export type DefectPriority = "最高" | "较高" | "普通" | "较低" | "最低";
export type DefectSeverity = "S-致命" | "A-严重" | "B-一般" | "C-低";
export type DefectStatus = "待处理" | "处理中" | "待验证" | "已修复" | "已关闭";
export type RemindFrequency = "daily" | "weekly" | "weekdays" | "once";
export type RemindTemplate = "default" | "detailed" | "deadline" | "escalate";

export const DEFECT_TEAMS = ["政务AI", "政务协作", "WPS政务365"] as const;
export type DefectTeam = (typeof DEFECT_TEAMS)[number];

export interface DefectRow {
  id: string;
  bugId: string;
  title: string;
  priority: DefectPriority;
  severity: DefectSeverity;
  status: DefectStatus;
  team: DefectTeam;
  iteration: string;
  module: string;
  owner: string;
  reporter: string;
  createdAt: string;
  deadline: string;
  /** ONES 缺陷详情页链接（SEED 回退数据无此字段） */
  onesUrl?: string;
}

export interface DefectRemindTask {
  id: string;
  name: string;
  team: string;
  frequency: RemindFrequency;
  startDate: string;
  endDate: string;
  webhook: string;
  enabled: boolean;
  severities: DefectSeverity[];
  template: RemindTemplate;
  includeDetail: boolean;
  includeDeadline: boolean;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  lastRunStatus: "success" | "failed" | null;
  lastRunMessage: string | null;
}

export interface DefectRemindTaskInput {
  name: string;
  team: string;
  frequency: RemindFrequency;
  startDate: string;
  endDate: string;
  webhook: string;
  enabled: boolean;
  severities: DefectSeverity[];
  template: RemindTemplate;
  includeDetail: boolean;
  includeDeadline: boolean;
}

export interface DefectStats {
  total: number;
  pending: number;
  processing: number;
  unrepaired: number;
  fatal: number;
  resolved: number;
  fixRate: number;
}

export const UNREPAIRED_STATUSES: DefectStatus[] = ["待处理", "处理中", "待验证"];
export const RESOLVED_STATUSES: DefectStatus[] = ["已修复", "已关闭"];
export const ALL_TEAMS = "全部团队";
export const SEVERITY_OPTIONS: DefectSeverity[] = ["S-致命", "A-严重", "B-一般", "C-低"];
export const PRIORITY_OPTIONS: DefectPriority[] = ["最高", "较高", "普通", "较低", "最低"];
export const DEFAULT_SEVERITIES: DefectSeverity[] = ["S-致命", "A-严重"];

export const FREQUENCY_OPTIONS: { value: RemindFrequency; label: string }[] = [
  { value: "daily", label: "每天" },
  { value: "weekly", label: "每周" },
  { value: "weekdays", label: "每工作日" },
  { value: "once", label: "仅一次" },
];

export const TEMPLATE_OPTIONS: { value: RemindTemplate; label: string; hint: string }[] = [
  { value: "default", label: "默认催办", hint: "简洁汇总未修复缺陷" },
  { value: "detailed", label: "详细清单", hint: "列出每条缺陷的关键字段" },
  { value: "deadline", label: "截止日期", hint: "突出超期与临近截止项" },
  { value: "escalate", label: "升级催办", hint: "强调致命/超期需升级处理" },
];

export const SEVERITY_COLORS: Record<DefectSeverity, string> = {
  "S-致命": "bg-[#FEF3F2] text-[#D92D20] border-[#FECDCA]",
  "A-严重": "bg-[#FFFAEB] text-[#F79009] border-[#FEDF89]",
  "B-一般": "bg-[#EFF4FF] text-[#2A6FDB] border-[#C7D7FE]",
  "C-低": "bg-[#ECFDF3] text-[#12B76A] border-[#A6F4C5]",
};

export const PRIORITY_COLORS: Record<DefectPriority, string> = {
  最高: "bg-[#FEF3F2] text-[#D92D20] border-[#FECDCA]",
  较高: "bg-[#FFFAEB] text-[#F79009] border-[#FEDF89]",
  普通: "bg-[#EFF4FF] text-[#2A6FDB] border-[#C7D7FE]",
  较低: "bg-slate-100 text-slate-600 border-slate-200",
  最低: "bg-[#ECFDF3] text-[#12B76A] border-[#A6F4C5]",
};

export const STATUS_COLORS: Record<DefectStatus, string> = {
  待处理: "bg-[#FEF3F2] text-[#D92D20] border-[#FECDCA]",
  处理中: "bg-[#FFFAEB] text-[#F79009] border-[#FEDF89]",
  待验证: "bg-[#EFF4FF] text-[#2A6FDB] border-[#C7D7FE]",
  已修复: "bg-[#ECFDF3] text-[#12B76A] border-[#A6F4C5]",
  已关闭: "bg-slate-100 text-slate-500 border-slate-200",
};

export const OWNER_AVATAR_COLORS = [
  "bg-[#2A6FDB]",
  "bg-[#12B76A]",
  "bg-[#F79009]",
  "bg-[#7A5AF8]",
  "bg-[#EE46BC]",
  "bg-[#0BA5EC]",
];

/** 缺陷列表数据源，接入多维表前保持为空 */
export const SEED_DEFECTS: DefectRow[] = [];

export function isUnrepaired(status: string): boolean {
  return UNREPAIRED_STATUSES.includes(status as DefectStatus);
}

export function isResolved(status: string): boolean {
  return RESOLVED_STATUSES.includes(status as DefectStatus);
}

export function isFatalSeverity(severity: string): boolean {
  return severity === "S-致命" || severity === "致命";
}

export function normalizeSeverity(value: string | undefined): DefectSeverity {
  const map: Record<string, DefectSeverity> = {
    致命: "S-致命",
    严重: "A-严重",
    一般: "B-一般",
    轻微: "C-低",
    低: "C-低",
    "S-致命": "S-致命",
    "A-严重": "A-严重",
    "B-一般": "B-一般",
    "C-低": "C-低",
  };
  return map[value ?? ""] ?? "B-一般";
}

export function normalizePriority(value: string | undefined): DefectPriority {
  const map: Record<string, DefectPriority> = {
    P0: "最高",
    P1: "较高",
    P2: "普通",
    P3: "较低",
    P4: "最低",
    最高: "最高",
    较高: "较高",
    普通: "普通",
    较低: "较低",
    最低: "最低",
  };
  return map[value ?? ""] ?? "普通";
}

export function shanghaiDay(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
}

export function isOverdue(defect: DefectRow, now = new Date()): boolean {
  if (!defect.deadline || !isUnrepaired(defect.status)) return false;
  return defect.deadline.slice(0, 10) < shanghaiDay(now);
}

export function computeDefectStats(defects: DefectRow[]): DefectStats {
  const total = defects.length;
  const pending = defects.filter((item) => item.status === "待处理").length;
  const processing = defects.filter((item) => item.status === "处理中").length;
  const unrepaired = defects.filter((item) => isUnrepaired(item.status)).length;
  const fatal = defects.filter((item) => isFatalSeverity(item.severity) && isUnrepaired(item.status)).length;
  const resolved = defects.filter((item) => isResolved(item.status)).length;
  const fixRate = total > 0 ? Math.round((resolved / total) * 100) : 0;
  return { total, pending, processing, unrepaired, fatal, resolved, fixRate };
}

export function ownerAvatarColor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return OWNER_AVATAR_COLORS[hash % OWNER_AVATAR_COLORS.length];
}

export function uniqueValues(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function nextBugId(defects: DefectRow[]): string {
  let max = 1000;
  for (const item of defects) {
    const match = item.bugId.match(/(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return String(max + 1);
}

export function filterDefects(options: {
  defects: DefectRow[];
  search?: string;
  teams?: string[];
  severities?: string[];
  statuses?: string[];
  priorities?: string[];
  modules?: string[];
  iterations?: string[];
}): DefectRow[] {
  const search = options.search?.trim().toLowerCase() ?? "";
  return options.defects.filter((item) => {
    if (search) {
      const hay = `${item.bugId} ${item.title} ${item.owner} ${item.team} ${item.iteration} ${item.module}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    if (options.teams?.length && !options.teams.includes(item.team)) return false;
    if (options.severities?.length && !options.severities.includes(item.severity)) return false;
    if (options.statuses?.length && !options.statuses.includes(item.status)) return false;
    if (options.priorities?.length && !options.priorities.includes(item.priority)) return false;
    if (options.modules?.length && !options.modules.includes(item.module)) return false;
    if (options.iterations?.length && !options.iterations.includes(item.iteration)) return false;
    return true;
  });
}

export function matchTaskDefects(options: {
  defects: DefectRow[];
  team: string;
  severities: DefectSeverity[];
}): DefectRow[] {
  return options.defects.filter((item) => {
    if (!isUnrepaired(item.status)) return false;
    if (options.team && options.team !== ALL_TEAMS && item.team !== options.team) return false;
    if (options.severities.length > 0) {
      const allowed = new Set(options.severities.map(normalizeSeverity));
      if (!allowed.has(normalizeSeverity(item.severity))) return false;
    }
    return true;
  });
}

export function emptyRemindTaskInput(options?: { team?: string }): DefectRemindTaskInput {
  const start = shanghaiDay(new Date());
  return {
    name: "未修复缺陷提醒",
    team: options?.team || DEFECT_TEAMS[0],
    frequency: "daily",
    startDate: start,
    endDate: "",
    webhook: "",
    enabled: true,
    severities: [...DEFAULT_SEVERITIES],
    template: "default",
    includeDetail: true,
    includeDeadline: true,
  };
}

export function taskToInput(task: DefectRemindTask): DefectRemindTaskInput {
  return {
    name: task.name,
    team: task.team || ALL_TEAMS,
    frequency: task.frequency,
    startDate: task.startDate,
    endDate: task.endDate,
    webhook: task.webhook,
    enabled: task.enabled,
    severities: (task.severities.length > 0 ? task.severities : DEFAULT_SEVERITIES).map(normalizeSeverity),
    template: task.template,
    includeDetail: task.includeDetail,
    includeDeadline: task.includeDeadline,
  };
}

export function frequencyLabel(value: RemindFrequency): string {
  return FREQUENCY_OPTIONS.find((item) => item.value === value)?.label ?? value;
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

function formatDefectLine(item: DefectRow, options: {
  template: RemindTemplate;
  includeDetail: boolean;
  includeDeadline: boolean;
  now?: Date;
}): string {
  const overdue = isOverdue(item, options.now);
  const deadline = options.includeDeadline && item.deadline
    ? `，截止 ${item.deadline.slice(0, 10)}${overdue ? "（已超期）" : ""}`
    : "";
  const bugId = item.onesUrl ? `[${item.bugId}](${item.onesUrl})` : item.bugId;
  if (options.template === "detailed" || options.includeDetail) {
    return `${bugId} ${item.title}｜${item.severity}/${item.priority}｜${item.status}｜@${item.owner}${deadline}`;
  }
  return `${bugId} ${item.title}（@${item.owner}）${deadline}`;
}

export function formatRemindMessage(options: {
  defects: DefectRow[];
  task: Pick<DefectRemindTaskInput, "name" | "team" | "template" | "includeDetail" | "includeDeadline">;
  now?: Date;
}): string {
  const now = options.now ?? new Date();
  const title = options.task.name.trim() || "未修复缺陷提醒";
  const team = options.task.team && options.task.team !== ALL_TEAMS ? options.task.team : "全部团队";
  const overdueCount = options.defects.filter((item) => isOverdue(item, now)).length;
  const fatalCount = options.defects.filter((item) => isFatalSeverity(item.severity)).length;
  const lines = options.defects.map((item) => formatDefectLine(item, {
    template: options.task.template,
    includeDetail: options.task.includeDetail,
    includeDeadline: options.task.includeDeadline,
    now,
  }));

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

  if (lines.length === 0) return `${header.join("\n")}\n\n当前没有匹配的未修复缺陷。`;
  return `${header.join("\n")}\n\n${lines.map((line, index) => `${index + 1}. ${line}`).join("\n")}`;
}

export function detectWebhookChannel(webhook: string): "钉钉" | "企业微信" | "WPS" | "Webhook" {
  const url = webhook.toLowerCase();
  if (url.includes("dingtalk") || url.includes("oapi.dingtalk")) return "钉钉";
  if (url.includes("qyapi.weixin") || url.includes("wecom")) return "企业微信";
  if (url.includes("kdocs.cn") || url.includes("wps.cn") || url.includes("365.kdocs")) return "WPS";
  return "Webhook";
}

export function uniqueOwners(defects: DefectRow[]): string[] {
  return uniqueValues(defects.map((item) => item.owner));
}

export const EXTRA_DEFECTS_STORAGE_KEY = "gov-cockpit-defect-extras";

export function loadExtraDefects(): DefectRow[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(EXTRA_DEFECTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Partial<DefectRow>>;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item.id && item.bugId && item.title).map((item) => ({
      id: String(item.id),
      bugId: String(item.bugId),
      title: String(item.title),
      priority: normalizePriority(item.priority),
      severity: normalizeSeverity(item.severity),
      status: (item.status ?? "待处理") as DefectStatus,
      team: DEFECT_TEAMS.includes(item.team as DefectTeam) ? item.team as DefectTeam : DEFECT_TEAMS[0],
      iteration: String(item.iteration ?? ""),
      module: String(item.module ?? ""),
      owner: String(item.owner ?? ""),
      reporter: String(item.reporter ?? item.owner ?? ""),
      createdAt: String(item.createdAt ?? ""),
      deadline: String(item.deadline ?? ""),
    }));
  } catch {
    return [];
  }
}

export function saveExtraDefects(defects: DefectRow[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(EXTRA_DEFECTS_STORAGE_KEY, JSON.stringify(defects));
}

export function mergeDefects(seed: DefectRow[], extras: DefectRow[]): DefectRow[] {
  const map = new Map<string, DefectRow>();
  for (const item of seed) map.set(item.id, item);
  for (const item of extras) map.set(item.id, item);
  return [...map.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
