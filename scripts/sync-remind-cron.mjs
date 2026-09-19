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
 *   3. 调管理 API：删除旧的 remind-cron 任务（按 name 匹配）→ 创建新任务 → 启用
 *
 * 前置：
 *   - kdocs-comate-cli 已登录（auth status ok）
 *   - 环境变量 WPS_SID（项目 Owner/Admin 的会话）
 *   - PROJECT_ID（默认 760386581358207）
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const KDOCS_CLI = resolve(process.env.HOME, ".wpscomate/agent/skills/official/wps365-kdocs/cli/kdocs-comate-cli");
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
  console.error(`✗ ${msg}`);
  process.exit(1);
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

  // 配置未变则不动线上任务。定时任务每半小时跑一次，若每次都删+建，
  // 会在「已删未建」的窗口里漏触发，且新建默认 disabled，toggle 失败即静默停发。
  if (existing && canonical(existing.action_config ?? {}) === canonical(actionConfig)) {
    console.log(`✓ 配置无变化，保持现状（id=${existing.id}, status=${existing.status}）`);
    return;
  }

  for (const item of all) {
    if (item?.name === CRON_NAME) {
      const del = await api(`/projects/${PROJECT_ID}/automations/${item.id}`, { method: "DELETE" });
      console.log(`   已删除旧的 ${CRON_NAME} (id=${item.id}): HTTP ${del.status}`);
    }
  }

  console.log("3. 创建新 cron 任务...");
  // 本平台版本要求 action_config.path（指向 /invoke 入口）+ method；
  // tasks/peopleMap 为自定义字段，随 FC Timer payload 透传到 invoke。
  const create = await api(`/projects/${PROJECT_ID}/automations`, {
    method: "POST",
    body: JSON.stringify({
      name: CRON_NAME,
      trigger_type: "cron",
      trigger_config: { cron_expression: CRON_EXPR },
      action_config: { path: "/invoke", method: "POST", ...actionConfig },
    }),
  });
  if (create.status !== 200 && create.status !== 201) die(`创建失败: HTTP ${create.status} ${JSON.stringify(create.body).slice(0, 300)}`);
  const automationId = create.body?.id ?? create.body?.data?.id;
  console.log(`   已创建 id=${automationId}（默认 disabled）`);

  console.log("4. 启用任务...");
  const toggle = await api(`/projects/${PROJECT_ID}/automations/${automationId}/toggle`, {
    method: "POST",
    body: JSON.stringify({ enabled: true }),
  });
  if (toggle.status !== 200) die(`启用失败: HTTP ${toggle.status} ${JSON.stringify(toggle.body).slice(0, 300)}`);
  console.log(`✓ 同步完成：${enabled.length} 个启用任务已随 cron 下发，每小时 0/30 分检查`);
}

main().catch((err) => die(err instanceof Error ? err.stack : String(err)));
