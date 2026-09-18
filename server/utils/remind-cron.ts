/**
 * 无人值守缺陷提醒：cron payload schema 与执行逻辑。
 *
 * 平台 cron（FC Timer Trigger）不带用户身份，多维表配置无法在服务端读取，
 * 因此任务配置随 action_config 透传进 invoke payload（无状态，免疫多副本）。
 *
 * 去重同样无状态：cron 表达式对齐墙钟（每小时第 0/30 分），
 * handler 判定「当前北京时间 HH:mm ∈ task.remindTimes」——每个时刻恰好触发一次。
 */
import type { DefectRemindTask } from "./defect-remind-store";
import {
  detectWebhookChannel,
  formatRemindMessage,
  matchTaskDefects,
  postWebhook,
  collectAtUserIds,
  shanghaiDay,
  type DefectRemindItem,
} from "./defect-remind";
import { loadOnesConfig, fetchOpenBugs, mapTasksToRows, firstProjectUuid } from "./ones-defects";

/** invoke payload 顶层结构（action_config 透传 + FC 注入字段） */
export interface RemindCronPayload {
  /** 平台注入的自动化任务 id（数字），仅用于日志 */
  task_id?: number;
  /** 提醒任务配置列表（同步脚本写入 action_config） */
  tasks?: unknown[];
  /** 姓名→userid 映射（钉钉真 @ 用；WPS 通道用 ownerEmail 不需要它） */
  peopleMap?: Record<string, string>;
}

export interface CronRunResult {
  ok: boolean;
  sent: number;
  skipped: number;
  failed: number;
  messages: string[];
}

/**
 * 北京时间当前所处的 30 分钟槽位（向下对齐，如 23:23 → "23:00"）。
 * 与 remindTimes 的槽位粒度一致；对齐容忍 cron 触发器的小幅漂移。
 * ⚠️ 依赖 cron 表达式严格为 `0 0,30 * * * *`（每小时仅 0/30 分触发），
 * 若加密到每分钟会导致同一槽位重复发送。
 */
function shanghaiSlotHHmm(date = new Date()): string {
  const hhmm = date
    .toLocaleTimeString("en-GB", { timeZone: "Asia/Shanghai", hourCycle: "h23" })
    .slice(0, 5);
  const [h, m] = hhmm.split(":");
  return `${h}:${Number(m) < 30 ? "00" : "30"}`;
}

/**
 * 判定任务是否应在当前时刻发送。
 *
 * - remindTimes 非空：当前 HH:mm 必须命中其中某个时刻（cron 已对齐 0/30 分，恰好一次）
 * - remindTimes 为空（旧数据「不限时刻」）：cron 场景无法表达，按每天 09:00 处理
 * - once：仅 startDate 当天、remindTimes 首个时刻触发（「仅一次」语义）
 * - weekly：周一才发（与「每 7 天」语义在墙钟对齐下等价，且更可预期）
 */
export function isTaskDueAtSlot(task: DefectRemindTask, now = new Date()): boolean {
  if (!task.enabled || !task.webhook.trim()) return false;
  const today = shanghaiDay(now);
  if (task.startDate && today < task.startDate) return false;
  if (task.endDate && today > task.endDate) return false;

  const hhmm = shanghaiSlotHHmm(now);
  const times = (task.remindTimes ?? []).filter(Boolean).sort();
  const effectiveTimes = times.length > 0 ? times : ["09:00"];
  if (task.frequency === "once") {
    // 「仅一次」：startDate 当天的首个提醒时刻
    return task.startDate === today && hhmm === effectiveTimes[0];
  }
  if (!effectiveTimes.includes(hhmm)) return false;
  if (task.frequency === "weekdays") {
    const weekday = new Date(`${today}T12:00:00+08:00`).getDay();
    if (weekday === 0 || weekday === 6) return false;
  }
  if (task.frequency === "weekly") {
    // 周一才发：与「距上次 ≥7 天」在墙钟对齐下等价
    const weekday = new Date(`${today}T12:00:00+08:00`).getDay();
    if (weekday !== 1) return false;
  }
  return true;
}

/** 解析并校验 payload 里的任务配置（宽松校验：坏行跳过并记录，不阻断其他任务） */
export function parsePayloadTasks(raw: unknown[]): { tasks: DefectRemindTask[]; errors: string[] } {
  const tasks: DefectRemindTask[] = [];
  const errors: string[] = [];
  for (const [index, item] of raw.entries()) {
    if (!item || typeof item !== "object") {
      errors.push(`tasks[${index}] 非对象，已跳过`);
      continue;
    }
    const t = item as Partial<DefectRemindTask>;
    if (typeof t.id !== "string" || !t.id) {
      errors.push(`tasks[${index}] 缺少 id，已跳过`);
      continue;
    }
    if (typeof t.webhook !== "string" || !t.webhook.trim()) {
      errors.push(`tasks[${index}] (${t.id}) 缺少 webhook，已跳过`);
      continue;
    }
    tasks.push({
      id: t.id,
      name: typeof t.name === "string" && t.name ? t.name : "未修复缺陷提醒",
      team: typeof t.team === "string" ? t.team : "全部团队",
      frequency: (["daily", "weekly", "weekdays", "once"] as const).includes(t.frequency as never) ? t.frequency! : "daily",
      startDate: typeof t.startDate === "string" ? t.startDate : "",
      endDate: typeof t.endDate === "string" ? t.endDate : "",
      webhook: t.webhook,
      enabled: t.enabled !== false,
      severities: Array.isArray(t.severities) && t.severities.length > 0 ? t.severities : ["S-致命", "A-严重"],
      iterations: Array.isArray(t.iterations) ? t.iterations : [],
      remindTimes: Array.isArray(t.remindTimes) ? t.remindTimes : [],
      template: (["default", "detailed", "deadline", "escalate"] as const).includes(t.template as never) ? t.template! : "default",
      includeDetail: t.includeDetail !== false,
      includeDeadline: t.includeDeadline !== false,
      createdAt: typeof t.createdAt === "string" ? t.createdAt : "",
      updatedAt: typeof t.updatedAt === "string" ? t.updatedAt : "",
      lastRunAt: null,
      lastRunStatus: null,
      lastRunMessage: null,
    });
  }
  return { tasks, errors };
}

/**
 * cron 主逻辑：取 ONES 缺陷 → 逐任务判定到期 → 匹配 → 发送。
 * 单任务失败不阻断其他任务（结果聚合返回）。
 */
export async function runRemindCron(payload: RemindCronPayload, now = new Date()): Promise<CronRunResult> {
  const result: CronRunResult = { ok: true, sent: 0, skipped: 0, failed: 0, messages: [] };
  const rawTasks = Array.isArray(payload.tasks) ? payload.tasks : [];
  if (rawTasks.length === 0) {
    result.messages.push("payload 无任务配置");
    return result;
  }
  const { tasks, errors } = parsePayloadTasks(rawTasks);
  for (const err of errors) result.messages.push(err);

  const due = tasks.filter((task) => isTaskDueAtSlot(task, now));
  if (due.length === 0) {
    result.skipped = tasks.length;
    result.messages.push(`当前时刻无到期任务（共 ${tasks.length} 个任务）`);
    return result;
  }

  // ONES 取数一次，全部任务共用
  let defects: DefectRemindItem[] = [];
  try {
    const cfg = await loadOnesConfig();
    const onesTasks = await fetchOpenBugs(cfg);
    defects = mapTasksToRows(cfg, firstProjectUuid(cfg), onesTasks) as unknown as DefectRemindItem[];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.ok = false;
    result.failed = due.length;
    result.messages.push(`ONES 取数失败，本次 ${due.length} 个到期任务全部未发送：${message}`);
    // 无人值守下静默失败最危险：取数失败时向首个到期任务的群发异常通知，让负责人知道提醒中断
    const reporter = due[0];
    try {
      await postWebhook({
        webhook: reporter.webhook,
        title: `${reporter.name}（提醒异常）`,
        text: `缺陷提醒未能执行：读取 ONES 缺陷失败。\n\n原因：${message}\n\n请检查 ONES 配置或网络后重试。`,
        atUserIds: [],
      });
      result.messages.push(`已向「${reporter.name}」发送异常通知`);
    } catch (notifyErr) {
      const notifyMessage = notifyErr instanceof Error ? notifyErr.message : String(notifyErr);
      result.messages.push(`异常通知发送失败：${notifyMessage}`);
    }
    return result;
  }

  for (const task of due) {
    try {
      const matched = matchTaskDefects({
        defects,
        team: task.team,
        severities: task.severities,
      });
      const channel = detectWebhookChannel(task.webhook);
      const peopleMap = channel === "钉钉" ? (payload.peopleMap ?? null) : null;
      const text = formatRemindMessage({ defects: matched, task, peopleMap, channel });
      await postWebhook({
        webhook: task.webhook,
        title: task.name,
        text,
        atUserIds: channel === "钉钉" ? collectAtUserIds(matched, peopleMap) : [],
      });
      result.sent += 1;
      result.messages.push(`「${task.name}」已发送 ${matched.length} 条至${channel}`);
    } catch (err) {
      result.failed += 1;
      result.ok = false;
      const message = err instanceof Error ? err.message : String(err);
      result.messages.push(`「${task.name}」发送失败：${message}`);
    }
  }
  return result;
}
