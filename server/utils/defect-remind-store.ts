import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
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

// ─── 多维表持久化 + 本地文件降级 ───

let dbCache: DefectRemindTask[] | null = null;
let dbToken: string | null = null;

/** 设置 gateway_token 并触发多维表加载 */
export function setDbToken(token: string): void {
  dbToken = token;
}

/** 多维表 record _id 缓存，用于 upsert 时定位已有行 */
let dbRecordIds = new Map<string, string>();

/** 从多维表加载任务到内存缓存 */
export async function syncFromDb(): Promise<void> {
  if (!dbToken) return;
  try {
    const { tasks: rows, recordIds } = await loadTasks(dbToken);
    dbRecordIds = recordIds;
    dbCache = rows.map((r) => r as unknown as DefectRemindTask);
    console.info(`[remind-store] 多维表加载 ${dbCache.length} 条`);
  } catch (err) {
    console.warn("[remind-store] 多维表加载失败:", err instanceof Error ? err.message : err);
  }
}

/** 持久化到多维表（逐条 upsert） */
async function persistToDb(tasks: DefectRemindTask[]): Promise<boolean> {
  if (!dbToken) return false;
  try {
    console.info(`[remind-store] persistToDb: ${tasks.length} 条, 已知 recordIds: ${dbRecordIds.size}`);
    const forDb = tasks.map((t) => {
      const { webhook, ...rest } = t as unknown as Record<string, unknown>;
      return rest;
    });
    const ok = await saveTasks(dbToken, forDb, dbRecordIds);
    if (ok) dbCache = tasks;
    console.info(`[remind-store] persistToDb result: ${ok}`);
    return ok;
  } catch (err) {
    console.warn("[remind-store] 多维表写入失败:", err instanceof Error ? err.message : err);
    return false;
  }
}

// ─── 本地文件降级 ───

function storeDir(): string {
  return join(process.cwd(), ".data");
}

function storeFile(): string {
  return join(storeDir(), "defect-remind-tasks.json");
}

async function readLocal(): Promise<DefectRemindTask[]> {
  try {
    const text = await readFile(storeFile(), "utf8");
    const parsed = JSON.parse(text) as DefectRemindTask[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLocal(tasks: DefectRemindTask[]): Promise<void> {
  await mkdir(storeDir(), { recursive: true });
  await writeFile(storeFile(), `${JSON.stringify(tasks, null, 2)}\n`, "utf8");
}

// ─── 统一读写（多维表优先，本地降级） ───

async function readTasks(): Promise<DefectRemindTask[]> {
  if (dbCache) return [...dbCache].sort((a: DefectRemindTask, b: DefectRemindTask) => b.updatedAt.localeCompare(a.updatedAt));
  if (dbToken) {
    await syncFromDb();
    if (dbCache) return [...dbCache].sort((a: DefectRemindTask, b: DefectRemindTask) => b.updatedAt.localeCompare(a.updatedAt));
  }
  return readLocal();
}

async function writeTasks(tasks: DefectRemindTask[]): Promise<void> {
  const forDb = tasks.map((t) => ({ ...t, webhook: "" }));
  const dbOk = await persistToDb(forDb);
  await writeLocal(tasks);
  if (!dbOk) console.warn("[remind-store] 多维表写入失败，已降级到本地文件");
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

export async function saveRemindTask(task: DefectRemindTask): Promise<DefectRemindTask> {
  const tasks = await readTasks();
  const index = tasks.findIndex((item) => item.id === task.id);
  if (index >= 0) tasks[index] = task;
  else tasks.unshift(task);
  await writeTasks(tasks);
  return task;
}

export async function removeRemindTask(id: string): Promise<boolean> {
  const tasks = await readTasks();
  const next = tasks.filter((item) => item.id !== id);
  if (next.length === tasks.length) return false;
  await writeTasks(next);
  return true;
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
    updatedAt: new Date().toISOString(),
  };
  return saveRemindTask(next);
}
