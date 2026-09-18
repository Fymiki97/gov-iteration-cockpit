import { loadTasks, saveTasks } from "./remind-task-dbsheet";

export type DefectSeverity = "S-致命" | "A-严重" | "B-一般" | "C-低";
export type RemindFrequency = "daily" | "weekly" | "weekdays" | "once";
export type RemindTemplate = "default" | "detailed" | "deadline" | "escalate";

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
  iterations: string[];
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
  name?: string;
  team?: string;
  frequency?: RemindFrequency;
  startDate?: string;
  endDate?: string;
  webhook?: string;
  enabled?: boolean;
  severities?: DefectSeverity[];
  iterations?: string[];
  template?: RemindTemplate;
  includeDetail?: boolean;
  includeDeadline?: boolean;
}

// ─── 多维表持久化（唯一数据源，无本地降级） ───

const NO_COOKIE_READ = "未收到 capa_session 授权 cookie，无法读取多维表（请刷新页面重新授权）";
const NO_COOKIE_WRITE = "未收到 capa_session 授权 cookie，无法写入多维表（请刷新页面重新授权）";

let dbCache: DefectRemindTask[] | null = null;
let dbCookie: string | null = null;

/** 设置请求 cookie 头（含 capa_session JWT），供多维表鉴权使用 */
export function setDbCookie(cookieHeader: string): void {
  if (cookieHeader !== dbCookie) {
    // 授权身份变化时必须作废缓存：否则会把上一个用户的任务列表与 record 映射
    // 直接交给当前用户（表现为「看到别人的任务」或写入错行）。
    dbCache = null;
    dbRecordIds = new Map();
  }
  dbCookie = cookieHeader;
}

/** 多维表 record _id 缓存，用于 upsert 时定位已有行 */
let dbRecordIds = new Map<string, string>();

/**
 * 从多维表加载任务到内存缓存。
 * 失败时向上抛出：调用方必须区分「没读到」和「表里就是空的」，
 * 否则多维表故障会被当成「任务被删光了」。
 */
async function syncFromDb(): Promise<void> {
  if (!dbCookie) throw new Error(NO_COOKIE_READ);
  const { tasks: rows, recordIds } = await loadTasks(dbCookie);
  dbRecordIds = recordIds;
  dbCache = rows.map((r) => r as unknown as DefectRemindTask);
  console.info(`[remind-store] 多维表加载 ${dbCache.length} 条`);
}

/**
 * 作废内存缓存，强制下次操作重新读表。
 * 写入中途失败时 dbRecordIds 可能已被部分回填，与 dbCache 不再对应；
 * 若继续沿用，下次写入会把「缓存里没有、表里却有」的记录当成已删除而清掉。
 */
function invalidateDbState(): void {
  dbCache = null;
  dbRecordIds = new Map();
}

/** 一次持久化的结果。persisted=false 表示本次修改没有落库，刷新后即消失 */
export interface PersistResult {
  persisted: boolean;
  error?: string;
}

let lastPersistError: string | null = null;

/** 最近一次持久化失败原因，供接口层透出，避免「保存成功但表里没有」这类静默失败 */
export function getLastPersistError(): string | null {
  return lastPersistError;
}

/** 持久化到多维表（逐条 upsert） */
async function persistToDb(tasks: DefectRemindTask[]): Promise<PersistResult> {
  if (!dbCookie) {
    lastPersistError = NO_COOKIE_WRITE;
    return { persisted: false, error: lastPersistError };
  }
  try {
    const result = await saveTasks(dbCookie, tasks as unknown as Record<string, unknown>[], dbRecordIds);
    if (result.ok) {
      dbCache = tasks;
      lastPersistError = null;
      return { persisted: true };
    }
    lastPersistError = result.error ?? "多维表写入失败";
    invalidateDbState();
    return { persisted: false, error: lastPersistError };
  } catch (err) {
    lastPersistError = err instanceof Error ? err.message : String(err);
    console.warn("[remind-store] 多维表写入失败:", lastPersistError);
    invalidateDbState();
    return { persisted: false, error: lastPersistError };
  }
}

// ─── 统一读写（唯一数据源：多维表） ───

const byUpdatedAt = (a: DefectRemindTask, b: DefectRemindTask) => b.updatedAt.localeCompare(a.updatedAt);

/** 读取任务。多维表不可用时抛出，绝不退回到本地文件 */
async function readTasks(): Promise<DefectRemindTask[]> {
  if (!dbCache) await syncFromDb();
  return [...(dbCache ?? [])].sort(byUpdatedAt);
}

async function writeTasks(tasks: DefectRemindTask[]): Promise<PersistResult> {
  const result = await persistToDb(tasks);
  if (!result.persisted) console.warn("[remind-store] 多维表写入失败:", result.error);
  return result;
}

function newId(): string {
  return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asFrequency(value: unknown): RemindFrequency {
  return FREQUENCIES.includes(value as RemindFrequency) ? value as RemindFrequency : "daily";
}

function asTemplate(value: unknown): RemindTemplate {
  return TEMPLATES.includes(value as RemindTemplate) ? value as RemindTemplate : "default";
}

function asSeverities(value: unknown): DefectSeverity[] {
  if (!Array.isArray(value)) return ["S-致命", "A-严重"];
  const picked = value
    .map((item) => SEVERITY_ALIASES[String(item)] ?? (SEVERITIES.includes(item as DefectSeverity) ? item as DefectSeverity : null))
    .filter((item): item is DefectSeverity => item !== null);
  return picked.length > 0 ? [...new Set(picked)] : ["S-致命", "A-严重"];
}

export function normalizeTaskInput(input: DefectRemindTaskInput, existing?: DefectRemindTask): DefectRemindTask {
  const now = new Date().toISOString();
  const name = asString(input.name, existing?.name ?? "未修复缺陷提醒") || "未修复缺陷提醒";
  const webhook = asString(input.webhook, existing?.webhook ?? "");
  return {
    id: existing?.id ?? newId(),
    name,
    team: asString(input.team, existing?.team ?? "全部团队") || "全部团队",
    frequency: input.frequency ? asFrequency(input.frequency) : (existing?.frequency ?? "daily"),
    startDate: asString(input.startDate, existing?.startDate ?? ""),
    endDate: asString(input.endDate, existing?.endDate ?? ""),
    webhook,
    enabled: input.enabled === undefined ? (existing?.enabled ?? true) : asBoolean(input.enabled, true),
    severities: input.severities ? asSeverities(input.severities) : asSeverities(existing?.severities),
    iterations: Array.isArray(input.iterations) ? input.iterations : (existing?.iterations ?? []),
    template: input.template ? asTemplate(input.template) : (existing?.template ?? "default"),
    includeDetail: input.includeDetail === undefined ? (existing?.includeDetail ?? true) : asBoolean(input.includeDetail, true),
    includeDeadline: input.includeDeadline === undefined ? (existing?.includeDeadline ?? true) : asBoolean(input.includeDeadline, true),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastRunAt: existing?.lastRunAt ?? null,
    lastRunStatus: existing?.lastRunStatus ?? null,
    lastRunMessage: existing?.lastRunMessage ?? null,
  };
}

const FREQUENCIES: RemindFrequency[] = ["daily", "weekly", "weekdays", "once"];
const TEMPLATES: RemindTemplate[] = ["default", "detailed", "deadline", "escalate"];
const SEVERITIES: DefectSeverity[] = ["S-致命", "A-严重", "B-一般", "C-低"];
const SEVERITY_ALIASES: Record<string, DefectSeverity> = {
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

export async function listRemindTasks(): Promise<DefectRemindTask[]> {
  return readTasks();
}

export async function getRemindTask(id: string): Promise<DefectRemindTask | null> {
  const tasks = await readTasks();
  return tasks.find((item) => item.id === id) ?? null;
}

export interface SaveTaskResult {
  task: DefectRemindTask;
  persist: PersistResult;
}

export async function saveRemindTask(task: DefectRemindTask): Promise<SaveTaskResult> {
  const tasks = await readTasks();
  const index = tasks.findIndex((item) => item.id === task.id);
  if (index >= 0) tasks[index] = task;
  else tasks.unshift(task);
  const persist = await writeTasks(tasks);
  return { task, persist };
}

export async function removeRemindTask(id: string): Promise<{ removed: boolean; persist: PersistResult }> {
  const tasks = await readTasks();
  const next = tasks.filter((item) => item.id !== id);
  if (next.length === tasks.length) return { removed: false, persist: { persisted: true } };
  const persist = await writeTasks(next);
  return { removed: true, persist };
}

export async function markRemindTaskRun(options: {
  id: string;
  status: "success" | "failed";
  message: string;
}): Promise<DefectRemindTask | null> {
  const task = await getRemindTask(options.id);
  if (!task) return null;
  const next: DefectRemindTask = {
    ...task,
    lastRunAt: new Date().toISOString(),
    lastRunStatus: options.status,
    lastRunMessage: options.message.slice(0, 200),
    // 「仅一次」的一次性配额已被消费：isTaskDue 此后恒为 false，状态必须同步停用，
    // 否则界面会一直显示「启用」却永不触发。
    enabled: task.frequency === "once" ? false : task.enabled,
    updatedAt: new Date().toISOString(),
  };
  const saved = await saveRemindTask(next);
  return saved.task;
}
