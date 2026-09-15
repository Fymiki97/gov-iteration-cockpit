import type { DefectRemindTask, DefectSeverity } from "./defect-remind-store";

export interface DefectRemindItem {
  bugId: string;
  title: string;
  priority: string;
  severity: string;
  status: string;
  team?: string;
  module: string;
  owner: string;
  deadline: string;
  createdAt: string;
  /** ONES 缺陷详情页链接，存在时消息中缺陷 ID 渲染为超链接 */
  onesUrl?: string;
}

const UNREPAIRED = new Set(["待处理", "处理中", "待验证"]);
const ALL_TEAMS = "全部团队";

export function shanghaiDay(date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
}

export function isUnrepaired(status: string): boolean {
  return UNREPAIRED.has(status);
}

export function isOverdue(item: DefectRemindItem, now = new Date()): boolean {
  if (!item.deadline || !isUnrepaired(item.status)) return false;
  return item.deadline.slice(0, 10) < shanghaiDay(now);
}

function daysBetween(fromDay: string, toDay: string): number {
  const from = new Date(`${fromDay}T00:00:00+08:00`).getTime();
  const to = new Date(`${toDay}T00:00:00+08:00`).getTime();
  return Math.round((to - from) / 86_400_000);
}

export function isTaskDue(task: DefectRemindTask, now = new Date()): boolean {
  if (!task.enabled || !task.webhook.trim()) return false;
  const today = shanghaiDay(now);
  if (task.startDate && today < task.startDate) return false;
  if (task.endDate && today > task.endDate) return false;
  const weekday = new Date(`${today}T12:00:00+08:00`).getDay();
  if (task.frequency === "weekdays" && (weekday === 0 || weekday === 6)) return false;
  if (task.frequency === "once") return !task.lastRunAt;
  if (!task.lastRunAt) return true;
  const lastDay = shanghaiDay(new Date(task.lastRunAt));
  if (task.frequency === "weekly") return daysBetween(lastDay, today) >= 7;
  return today > lastDay;
}

export function matchTaskDefects(options: {
  defects: DefectRemindItem[];
  team: string;
  severities: DefectSeverity[];
}): DefectRemindItem[] {
  return options.defects.filter((item) => {
    if (!isUnrepaired(item.status)) return false;
    if (options.team && options.team !== ALL_TEAMS && (item.team || item.module) !== options.team) return false;
    if (options.severities.length > 0) {
      const allowed = new Set(options.severities.flatMap((level) => {
        const value = String(level);
        if (value === "S-致命" || value === "致命") return ["S-致命", "致命"];
        if (value === "A-严重" || value === "严重") return ["A-严重", "严重"];
        if (value === "B-一般" || value === "一般") return ["B-一般", "一般"];
        if (value === "C-低" || value === "低" || value === "轻微") return ["C-低", "低", "轻微"];
        return [value];
      }));
      if (!allowed.has(item.severity)) return false;
    }
    return true;
  });
}

/** 缺陷 ID 渲染：有链接时用 markdown 超链接，否则纯文本；转义 markdown 特殊字符 */
function bugIdMarkdown(item: DefectRemindItem): string {
  const bugId = item.bugId.replace(/[\[\]]/g, "");
  if (!item.onesUrl) return bugId;
  return `[${bugId}](${item.onesUrl})`;
}

function formatLine(item: DefectRemindItem, task: DefectRemindTask, now: Date): string {
  const overdue = isOverdue(item, now);
  const deadline = task.includeDeadline && item.deadline
    ? `，截止 ${item.deadline.slice(0, 10)}${overdue ? "（已超期）" : ""}`
    : "";
  const owner = `@${item.owner}`;
  if (task.template === "detailed" || task.includeDetail) {
    return `${bugIdMarkdown(item)} ${item.title}｜${item.severity}/${item.priority}｜${item.status}｜${owner}${deadline}`;
  }
  return `${bugIdMarkdown(item)} ${item.title}（${owner}）${deadline}`;
}

export function formatRemindMessage(options: {
  defects: DefectRemindItem[];
  task: DefectRemindTask;
  now?: Date;
}): string {
  const now = options.now ?? new Date();
  const title = options.task.name.trim() || "未修复缺陷提醒";
  const team = options.task.team && options.task.team !== ALL_TEAMS ? options.task.team : "全部团队";
  const overdueCount = options.defects.filter((item) => isOverdue(item, now)).length;
  const fatalCount = options.defects.filter((item) => item.severity === "S-致命" || item.severity === "致命").length;
  const header = [
    `**【${title}】**`,
    `团队：${team} ｜ 未修复 ${options.defects.length} 条 ｜ 致命 ${fatalCount} 条 ｜ 已超期 ${overdueCount} 条`,
  ];
  if (options.task.template === "escalate") {
    header.push("请优先处理致命及超期缺陷，必要时升级至负责人。");
  } else if (options.task.template === "deadline") {
    header.push("请关注截止日期，避免缺陷超期影响版本交付。");
  } else {
    header.push("请相关负责人尽快跟进处理。");
  }
  if (options.defects.length === 0) return `${header.join("\n")}\n\n当前没有匹配的未修复缺陷。`;
  const lines = options.defects.map((item, index) => `${index + 1}. ${formatLine(item, options.task, now)}`);
  return `${header.join("\n")}\n\n${lines.join("\n")}`;
}

export function detectWebhookChannel(webhook: string): "钉钉" | "企业微信" | "WPS" | "Webhook" {
  const url = webhook.toLowerCase();
  if (url.includes("dingtalk") || url.includes("oapi.dingtalk")) return "钉钉";
  if (url.includes("qyapi.weixin") || url.includes("wecom")) return "企业微信";
  if (url.includes("kdocs.cn") || url.includes("wps.cn") || url.includes("365.kdocs")) return "WPS";
  return "Webhook";
}

export function buildWebhookBody(options: {
  webhook: string;
  title: string;
  text: string;
}): Record<string, unknown> {
  const channel = detectWebhookChannel(options.webhook);
  if (channel === "钉钉") {
    return { msgtype: "markdown", markdown: { title: options.title, text: options.text } };
  }
  if (channel === "企业微信") {
    return { msgtype: "markdown", markdown: { content: options.text } };
  }
  if (channel === "WPS") {
    return { msgtype: "markdown", markdown: { text: options.text } };
  }
  return {
    msgtype: "markdown",
    markdown: { title: options.title, text: options.text },
    text: options.text,
    title: options.title,
  };
}

export function parseWebhookUrl(webhook: string): URL {
  const trimmed = webhook.trim();
  if (!trimmed) {
    throw createError({ statusCode: 400, message: "请填写 webhook" });
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw createError({ statusCode: 400, message: "webhook 格式不正确" });
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw createError({ statusCode: 400, message: "webhook 仅支持 http/https" });
  }
  return parsed;
}

export async function postWebhook(options: {
  webhook: string;
  title: string;
  text: string;
}): Promise<{ status: number; body: string }> {
  const url = parseWebhookUrl(options.webhook);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildWebhookBody({
      webhook: options.webhook,
      title: options.title,
      text: options.text,
    })),
  });
  const body = await res.text().catch(() => "");
  if (!res.ok) {
    throw createError({
      statusCode: 502,
      message: `Webhook 发送失败（HTTP ${res.status}）${body.slice(0, 120)}`,
    });
  }
  return { status: res.status, body: body.slice(0, 300) };
}
