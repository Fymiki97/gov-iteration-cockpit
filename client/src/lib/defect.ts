import { getAppApiUrl } from "@/lib/oauth-redirect";

export type DefectPriority = "最高" | "较高" | "普通" | "较低" | "最低";
export type DefectSeverity = "S-致命" | "A-严重" | "B-一般" | "C-低";
export type DefectStatus = "待处理" | "处理中" | "待验证" | "已修复" | "已关闭";

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
  ownerEmail?: string;
  reporter: string;
  createdAt: string;
  deadline: string;
  /** ONES 缺陷详情页链接（SEED 回退数据无此字段） */
  onesUrl?: string;
}

export interface OnesDefectsResult {
  rows: DefectRow[];
  source: "live" | "snapshot";
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
export const SEVERITY_OPTIONS: DefectSeverity[] = ["S-致命", "A-严重", "B-一般", "C-低"];
export const PRIORITY_OPTIONS: DefectPriority[] = ["最高", "较高", "普通", "较低", "最低"];

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

export function isHighSeverity(severity: string): boolean {
  return severity === "S-致命" || severity === "A-严重";
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
  const fatal = defects.filter((item) => isHighSeverity(item.severity) && isUnrepaired(item.status)).length;
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

/** 从后端拉取 ONES 项目的活跃缺陷（服务端已过滤已关闭/不必修复/草稿） */
export async function fetchOnesDefects(options?: { refresh?: boolean }): Promise<OnesDefectsResult> {
  const path = options?.refresh ? "api/ones-defects?refresh=1" : "api/ones-defects";
  const res = await fetch(getAppApiUrl(path), { credentials: "include" });
  // 服务端失败时返回 200 + {ok:false, error}（避免生产模式剥离 5xx message）
  const data = (await res.json().catch(() => null)) as {
    ok?: boolean;
    rows?: DefectRow[];
    source?: "live" | "snapshot";
    error?: string;
    message?: string;
    statusMessage?: string;
  } | null;
  if (!res.ok) {
    throw new Error(data?.statusMessage || data?.message || `请求失败（HTTP ${res.status}）`);
  }
  if (data?.ok === false) {
    throw new Error(data?.error || "ONES 缺陷接口返回失败");
  }
  const rows = data?.rows;
  if (!Array.isArray(rows)) {
    throw new Error("ONES 缺陷接口返回为空");
  }
  return { rows, source: data?.source === "snapshot" ? "snapshot" : "live" };
}
