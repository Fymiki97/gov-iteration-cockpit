#!/usr/bin/env node
/**
 * 同步提醒配置到平台 cron 任务（CLI 工具，需 wps_sid）。
 *
 * 用法：
 *   node scripts/sync-remind-cron.mjs [--dry-run] [--name NAME]
 *
 * 流程：
 *   1. 用 kdocs-comate-cli 从多维表读提醒任务（sheet 12）+ 人员映射（sheet 28）
 *   2. 构造 action_config（tasks + peopleMap 透传给 invoke payload）
 *   3. 调管理 API：配置有变则删旧 cron 任务 → 建新任务 → 启用；无变则不动线上任务
 *   4. 失败时给自己发 IM（6 小时内只提醒一次）
 *
 * 部署：由 Comate 定时任务每 30 分钟跑一次，因此无需人工介入；
 *       应用自己无权改定时任务（管理 API 只认平台登录态），只能由本脚本代劳。
 *
 * 前置：
 *   - kdocs-comate-cli 已登录（auth status ok）
 *   - 环境变量 WPS_SID（项目 Owner/Admin 的会话）
 *   - PROJECT_ID（默认 760386581358207）
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const KDOCS_CLI = resolve(process.env.HOME, ".wpscomate/agent/skills/official/wps365-kdocs/cli/kdocs-comate-cli");
/** 告警通道：失败时用 wps365 CLI 给自己发 IM */
const WPS365_CLI = resolve(process.env.HOME, ".wpscomate/bin/wps365");
/** 告警节流状态。放用户目录而非仓库，避免污染工作树 */
const ALERT_STATE_FILE = resolve(process.env.HOME, ".wpscomate/remind-sync-alert.json");
/** 每 30 分钟跑一次，失败会连续复现，所以 6 小时内只提醒一次 */
const ALERT_THROTTLE_MS = 6 * 60 * 60 * 1000;
/** 提醒任务表所在多维表 */
const TASK_FILE_ID = "tmcQvuKxFrMJAHExDfFFrxC3PB5vCD4E7";
/** 人员映射表所在多维表（与任务表不同文件） */
const PEOPLE_FILE_ID = "Dm5Wx1ph11MNih2SbwZurxjFLUZTboQEF";
const TASK_SHEET = 12;
const PEOPLE_SHEET = 28;
const API_BASE = "https://open.wps.cn/app-studio/api/manage/v1";
const PROJECT_ID = process.env.PROJECT_ID || "760386581358207";
const CRON_NAME = process.env.CRON_NAME || "defect-remind-cron";
const CRON_EXPR = "CRON_TZ=Asia/Shanghai 0 0,30 * * * *";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

function die(msg) {
  // 抛错而非直接退出：由入口统一发 IM 告警后退出
  throw new Error(msg);
}

/**
 * 同步失败时给自己发 IM 私聊。
 * 定时任务无人值守，失败若不告警，提醒会静默停发——这正是本机制要防的。
 * 告警本身失败只记录日志，不影响退出码。
 */
function alertByIm(reason) {
  const now = Date.now();
  try {
    if (existsSync(ALERT_STATE_FILE)) {
      const last = Number(JSON.parse(readFileSync(ALERT_STATE_FILE, "utf-8")).alertedAt);
      if (Number.isFinite(last) && now - last < ALERT_THROTTLE_MS) {
        console.error("! 距上次告警不足 6 小时，跳过 IM 提醒");
        return;
      }
    }
  } catch {
    // 状态文件损坏就当作没告警过
  }

  const run = (cmdArgs) => JSON.parse(execFileSync(WPS365_CLI, cmdArgs, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }));
  try {
    const me = run(["user", "me"]).data;
    if (!me?.id || !me?.user_name) throw new Error("拿不到当前用户信息");

    // 发给自己 = 与自己单聊的 p2p 会话，按自己姓名搜索后取 peer.id 匹配的那条
    const found = run(["im", "chat", "search", "--keyword", me.user_name]);
    const selfChat = (found.items ?? [])
      .map((item) => item?.chat)
      .find((chat) => chat?.type === "p2p" && chat?.p2p_ext_attrs?.peer?.id === me.id);
    if (!selfChat) throw new Error("未找到与自己单聊的会话");

    const at = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    execFileSync(WPS365_CLI, [
      "im", "message", "send", selfChat.id,
      "--text", `⚠️ 缺陷提醒同步失败\n时间：${at}\n原因：${reason}\n影响：多维表里的提醒配置不会下发到定时任务，到点不会发送提醒。`,
      "--confirm",
    ], { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
    writeFileSync(ALERT_STATE_FILE, JSON.stringify({ alertedAt: now }));
    console.error("! 已通过 IM 私聊发出同步失败告警");
  } catch (err) {
    console.error(`! IM 告警发送失败：${err instanceof Error ? err.message : String(err)}`);
  }
}

function kdocs(action, params) {
  const out = execFileSync(KDOCS_CLI, ["dbsheet", action, JSON.stringify(params)], {
    encoding: "utf-8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const data = JSON.parse(out);
  if (data.code !== 0) die(`kdocs ${action} 失败: ${data.message}`);
  return data.data.detail;
}

function extractText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(extractText).filter(Boolean).join(",");
  if (typeof value === "object") return extractText(value.text ?? value.value ?? "");
  return String(value);
}

function parseJsonArray(value) {
  const text = extractText(value);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return text ? text.split(/[,，、]/).map((s) => s.trim()).filter(Boolean) : [];
  }
}

/** 多维表日期字段可能是 "2026/09/15" 或 "2026-09-15"，统一为 ISO 格式 */
function normalizeDate(value) {
  const text = extractText(value);
  if (!text) return "";
  const m = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : text;
}

function loadTasks() {
  const detail = kdocs("list-records", { file_id: TASK_FILE_ID, sheet_id: TASK_SHEET, max_records: 200 });
  const tasks = [];
  for (const rec of detail.records ?? []) {
    const f = rec.fields ?? {};
    const task = {
      id: extractText(f["任务ID"]),
      name: extractText(f["任务名称"]),
      team: extractText(f["所属团队"]) || "全部团队",
      // 频率/模板选项须与多维表实际选项完全一致（每日 与 每天 并存，都归为 daily）；
      // 曾误用「详细模板/截止模板/升级模板」，与表中真实选项不符，导致模板静默降级为默认模板
      frequency: { "每日": "daily", "每天": "daily", "每周": "weekly", "工作日": "weekdays", "仅一次": "once" }[extractText(f["提醒频率"])] || "daily",
      startDate: normalizeDate(f["开始日期"]),
      endDate: normalizeDate(f["结束日期"]),
      webhook: extractText(f["Webhook地址"]),
      enabled: f["是否启用"] === true || extractText(f["是否启用"]) === "true",
      severities: parseJsonArray(f["严重级别"]),
      iterations: parseJsonArray(f["所属迭代"]),
      remindTimes: parseJsonArray(f["提醒时间"]),
      template: { "默认模板": "default", "详细清单": "detailed", "截止日期": "deadline", "升级催办": "escalate" }[extractText(f["提醒模板"])] || "default",
      includeDetail: f["包含详情"] !== false,
      includeDeadline: f["包含截止时间"] !== false,
      createdAt: "",
      updatedAt: new Date().toISOString(),
    };
    if (task.id && task.webhook) tasks.push(task);
  }
  return tasks;
}

function loadPeopleMap() {
  const detail = kdocs("list-records", { file_id: PEOPLE_FILE_ID, sheet_id: PEOPLE_SHEET, max_records: 500 });
  const map = {};
  for (const rec of detail.records ?? []) {
    const f = rec.fields ?? {};
    const name = extractText(f["姓名"]);
    const userId = extractText(f["用户ID"]);
    if (name && userId) map[name] = userId;
  }
  return map;
}

async function api(path, init = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Cookie: `wps_sid=${process.env.WPS_SID}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 200) }; }
  return { status: res.status, body };
}

function canonical(actionConfig) {
  // 比对时剔除易变字段：updatedAt 每次读取都会变成当前时间，不剔除会导致「永远认为有变化」
  const strip = (t) => {
    const c = { ...t };
    delete c.updatedAt;
    delete c.createdAt;
    return c;
  };
  // 直接拼规范字符串，避免依赖对象字面量与键序
  const stable = (v) => {
    if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
    if (v && typeof v === "object") {
      return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
    }
    return JSON.stringify(v);
  };
  return JSON.stringify(stable({ tasks: actionConfig.tasks.map(strip), peopleMap: actionConfig.peopleMap }));
}

async function enable(automationId) {
  const toggle = await api(`/projects/${PROJECT_ID}/automations/${automationId}/toggle`, {
    method: "POST",
    body: JSON.stringify({ enabled: true }),
  });
  if (toggle.status !== 200) die(`启用失败: HTTP ${toggle.status} ${JSON.stringify(toggle.body).slice(0, 300)}`);
}

async function main() {
  if (!existsSync(KDOCS_CLI)) die(`kdocs-comate-cli 不存在: ${KDOCS_CLI}`);
  if (!process.env.WPS_SID) {
    // 从 wpsgo cookie 文件兜底
    const cookieFile = "/tmp/wpsgo-cookies.txt";
    if (existsSync(cookieFile)) {
      const m = readFileSync(cookieFile, "utf-8").match(/wps_sid=([^;\s]+)/);
      if (m) process.env.WPS_SID = m[1];
    }
    if (!process.env.WPS_SID) die("缺少 WPS_SID 环境变量（项目 Owner/Admin 会话）");
  }

  console.log("1. 读取多维表配置...");
  const tasks = loadTasks();
  const peopleMap = loadPeopleMap();
  const enabled = tasks.filter((t) => t.enabled);
  console.log(`   任务 ${tasks.length} 个（启用 ${enabled.length}），人员映射 ${Object.keys(peopleMap).length} 条`);
  if (tasks.length === 0) die("多维表无提醒任务，先在应用里配置");

  const actionConfig = { tasks, peopleMap };
  const payloadSize = JSON.stringify(actionConfig).length;
  console.log(`   action_config 大小: ${payloadSize} 字节`);
  if (payloadSize > 60_000) die("payload 超过 60KB，超出 cron action_config 安全余量");

  if (dryRun) {
    console.log("2. [dry-run] 将创建的自动化任务：");
    console.log(JSON.stringify({
      name: CRON_NAME,
      trigger_type: "cron",
      trigger_config: { cron_expression: CRON_EXPR },
      action_config: actionConfig,
    }, null, 2).slice(0, 2000));
    console.log("   （dry-run 结束，未调管理 API）");
    return;
  }

  console.log("2. 检查现有 cron 任务（按 name 匹配）...");
  const list = await api(`/projects/${PROJECT_ID}/automations`);
  if (list.status !== 200) die(`列出任务失败: HTTP ${list.status} ${JSON.stringify(list.body)}`);
  const all = list.body?.data?.items ?? [];
  const existing = all.find((item) => item?.name === CRON_NAME);

  // 配置未变则不动线上任务。定时任务每半小时跑一次，若每次都改，
  // 会丢掉调度器已注册的定时器——实测 22:59:34 更新后，23:00 那个槽位就没触发。
  if (existing && canonical(existing.action_config ?? {}) === canonical(actionConfig)) {
    // 配置没变但任务没在跑（toggle 失败/被停用）会静默停发，这里补一次启用
    if (existing.status !== "active") {
      console.log(`   配置无变化，但 status=${existing.status}，重新启用...`);
      await enable(existing.id);
      console.log(`✓ 配置无变化，已重新启用（id=${existing.id}）`);
      return;
    }
    console.log(`✓ 配置无变化，保持现状（id=${existing.id}, status=${existing.status}）`);
    return;
  }

  // 本平台版本要求 action_config.path（指向 /invoke 入口）+ method；
  // tasks/peopleMap 为自定义字段，随 FC Timer payload 透传到 invoke。
  const automationBody = {
    name: CRON_NAME,
    trigger_type: "cron",
    trigger_config: { cron_expression: CRON_EXPR },
    action_config: { path: "/invoke", method: "POST", ...actionConfig },
  };

  // 配置有变时原地 PUT 更新，绝不删+建。删+建会让平台丢掉已注册的定时器，
  // 若更新时刻距目标提醒时刻很近（如 22:59:34 改完、23:00 就该发），那一次必漏。
  let automationId = existing?.id;
  if (automationId) {
    console.log(`3. 原地更新 cron 任务（id=${automationId}）...`);
    const update = await api(`/projects/${PROJECT_ID}/automations/${automationId}`, {
      method: "PUT",
      body: JSON.stringify(automationBody),
    });
    if (update.status !== 200) die(`更新失败: HTTP ${update.status} ${JSON.stringify(update.body).slice(0, 300)}`);
    console.log("   已更新（沿用原 id，调度注册不受影响）");

    // 历史删+建可能留下同名残留，只保留当前这一个
    for (const item of all) {
      if (item?.name === CRON_NAME && item.id !== automationId) {
        const del = await api(`/projects/${PROJECT_ID}/automations/${item.id}`, { method: "DELETE" });
        console.log(`   已清理重复任务 (id=${item.id}): HTTP ${del.status}`);
      }
    }
  } else {
    console.log("3. 创建 cron 任务...");
    const create = await api(`/projects/${PROJECT_ID}/automations`, {
      method: "POST",
      body: JSON.stringify(automationBody),
    });
    if (create.status !== 200 && create.status !== 201) die(`创建失败: HTTP ${create.status} ${JSON.stringify(create.body).slice(0, 300)}`);
    automationId = create.body?.id ?? create.body?.data?.id;
    console.log(`   已创建 id=${automationId}（默认 disabled）`);
  }

  console.log("4. 确认任务处于启用状态...");
  const after = await api(`/projects/${PROJECT_ID}/automations`);
  const current = (after.body?.data?.items ?? []).find((item) => item?.id === automationId);
  if (current?.status !== "active") {
    await enable(automationId);
    console.log("   已启用");
  } else {
    console.log("   已是 active，无需 toggle");
  }
  console.log(`✓ 同步完成：${enabled.length} 个启用任务已随 cron 下发，每小时 0/30 分检查`);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`✗ ${msg}`);
  // dry-run 失败属人工调试，不打扰
  if (!dryRun) alertByIm(msg);
  process.exit(1);
});
