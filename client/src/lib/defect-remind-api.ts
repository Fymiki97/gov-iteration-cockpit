import { getAppApiUrl } from "@/lib/oauth-redirect";
import { matchTaskDefects } from "@/lib/defect";
import type { DefectRemindTask, DefectRemindTaskInput, DefectRow } from "@/lib/defect";

const TASKS_STORAGE_KEY = "defect-remind-tasks";

/** 会话级缓存：记录本次会话已自动执行过的一次性任务，防止刷新后重复执行 */
const autoRunCache = new Set<string>();

export function hasAutoRun(taskId: string): boolean { return autoRunCache.has(taskId); }
export function markAutoRun(taskId: string): void { autoRunCache.add(taskId); }

export function loadLocalTasks(): DefectRemindTask[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(TASKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalTasks(tasks: DefectRemindTask[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
  } catch { /* quota exceeded, ignore */ }
}

export interface RunRemindResult {
  ok: boolean;
  sent: boolean;
  channel: string;
  count: number;
  preview: string;
  error?: string;
}

function toRemindItems(defects: DefectRow[]) {
  return defects.map((item) => ({
    bugId: item.bugId,
    title: item.title,
    priority: item.priority,
    severity: item.severity,
    status: item.status,
    team: item.team,
    module: item.module,
    owner: item.owner,
    ownerEmail: item.ownerEmail,
    deadline: item.deadline,
    createdAt: item.createdAt,
    onesUrl: item.onesUrl ?? "",
  }));
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({})) as T & { message?: string; statusMessage?: string };
  if (!res.ok) {
    throw new Error(data.statusMessage || data.message || `请求失败（HTTP ${res.status}）`);
  }
  return data;
}

/** 把本地独有的任务增量补写回多维表（已存在的任务不会被覆盖） */
async function backfillRemindTasks(tasks: DefectRemindTask[]): Promise<void> {
  try {
    const res = await fetch(getAppApiUrl("api/defect-remind-tasks/sync"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ tasks }),
    });
    await parseJson<{ ok: boolean; added?: number; patched?: number; error?: string }>(res);
  } catch {
    // 回填失败不阻断任务加载，下次打开页面会重试
  }
}

export async function fetchRemindTasks(): Promise<{ tasks: DefectRemindTask[]; source: "db" | "local"; warning?: string }> {
  const local = loadLocalTasks();
  try {
    const res = await fetch(getAppApiUrl("api/defect-remind-tasks"), { credentials: "include" });
    const data = await parseJson<{ tasks: DefectRemindTask[]; source?: "db" | "local"; persistError?: string | null }>(res);
    const server = data.tasks ?? [];
    // 合并：服务端有的以服务端为准，服务端没有但本地有的保留（容器重启不丢数据）
    // 对 lastRunAt 取最大值，防止服务端未持久化导致丢失执行记录
    const localMap = new Map(local.map((t) => [t.id, t]));
    const serverIds = new Set(server.map((t) => t.id));
    const merged = server.map((t) => {
      const localT = localMap.get(t.id);
      if (!localT) return t;
      const next = { ...t };
      // webhook 已随任务写入多维表；仅当服务端为空时用本地值兜底（历史数据或字段未同步）
      if (!next.webhook && localT.webhook) next.webhook = localT.webhook;
      if (localT.lastRunAt && (!next.lastRunAt || next.lastRunAt < localT.lastRunAt)) {
        next.lastRunAt = localT.lastRunAt;
        next.lastRunStatus = localT.lastRunStatus;
        next.lastRunMessage = localT.lastRunMessage;
      }
      return next;
    });
    const localOnly = local.filter((t) => !serverIds.has(t.id));
    // 本地有、多维表没有的任务（历史写入失败或未同步）自动补写回多维表。
    // 仅在服务端读取成功时执行——读取失败时无法得知多维表真实内容，贸然回填可能误删记录。
    if (localOnly.length > 0) void backfillRemindTasks(localOnly);
    const source = data.source === "db" ? "db" : "local";
    return {
      tasks: [...localOnly, ...merged],
      source,
      warning: source === "local"
        ? "当前列表来自本地缓存，未能读取多维表"
        : (data.persistError ?? undefined),
    };
  } catch {
    return { tasks: local, source: "local", warning: "未能连接服务端，当前列表来自本地缓存" };
  }
}

export interface OnesDefectsResult {
  rows: DefectRow[];
  source: "live" | "snapshot";
}

/** 从后端拉取 ONES 项目的活跃缺陷（服务端已过滤已关闭/不必修复/草稿） */
export async function fetchOnesDefects(options?: { refresh?: boolean }): Promise<OnesDefectsResult> {
  const path = options?.refresh ? "api/ones-defects?refresh=1" : "api/ones-defects";
  const res = await fetch(getAppApiUrl(path), { credentials: "include" });
  // 服务端失败时返回 200 + {ok:false, error}（避免生产模式剥离 5xx message）
  const data = await parseJson<{ ok: boolean; rows: DefectRow[]; source?: "live" | "snapshot"; error?: string }>(res);
  if (data.ok === false) {
    throw new Error(data.error || "ONES 缺陷接口返回失败");
  }
  if (!Array.isArray(data.rows)) {
    throw new Error("ONES 缺陷接口返回为空");
  }
  return { rows: data.rows, source: data.source === "snapshot" ? "snapshot" : "live" };
}

/** 保存结果。warning 非空表示任务只落在本地（多维表落库失败），需要告知用户 */
export interface RemindTaskSaveResult {
  task: DefectRemindTask;
  warning?: string;
}

export async function createRemindTask(input: DefectRemindTaskInput): Promise<RemindTaskSaveResult> {
  const res = await fetch(getAppApiUrl("api/defect-remind-tasks"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  const data = await parseJson<{ ok?: boolean; task?: DefectRemindTask; error?: string; persisted?: boolean; persistError?: string }>(res);
  if (data.ok === false || !data.task) throw new Error(data.error || "创建任务失败");
  const task = data.task;
  // 同步到 localStorage
  const local = loadLocalTasks();
  saveLocalTasks([task, ...local.filter((t) => t.id !== task.id)]);
  return { task, warning: data.persisted === false ? (data.persistError || "未写入多维表") : undefined };
}

export async function updateRemindTask(id: string, input: DefectRemindTaskInput): Promise<RemindTaskSaveResult> {
  const res = await fetch(getAppApiUrl(`api/defect-remind-tasks/${id}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  const data = await parseJson<{ ok?: boolean; task?: DefectRemindTask; error?: string; persisted?: boolean; persistError?: string }>(res);
  if (data.ok === false || !data.task) throw new Error(data.error || "更新任务失败");
  const task = data.task;
  // 同步到 localStorage
  const local = loadLocalTasks();
  saveLocalTasks(local.map((t) => (t.id === id ? task : t)));
  return { task, warning: data.persisted === false ? (data.persistError || "未写入多维表") : undefined };
}

export async function deleteRemindTask(id: string): Promise<{ warning?: string }> {
  const res = await fetch(getAppApiUrl(`api/defect-remind-tasks/${id}`), { method: "DELETE", credentials: "include" });
  const data = await parseJson<{ ok?: boolean; error?: string; persisted?: boolean; persistError?: string }>(res);
  if (data.ok === false) throw new Error(data.error || "删除任务失败");
  // 同步从 localStorage 删除
  const local = loadLocalTasks();
  saveLocalTasks(local.filter((t) => t.id !== id));
  return { warning: data.persisted === false ? (data.persistError || "未从多维表删除") : undefined };
}

export async function runRemindTask(options: {
  taskId: string;
  task: DefectRemindTask;
  defects: DefectRow[];
  scheduled?: boolean;
}): Promise<RunRemindResult> {
  const filtered = matchTaskDefects({
    defects: options.defects,
    team: options.task.team,
    severities: options.task.severities,
    iterations: options.task.iterations,
  });
  const res = await fetch(getAppApiUrl("api/defect-remind-tasks/run"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      taskId: options.taskId,
      task: options.task,
      scheduled: options.scheduled === true,
      defects: toRemindItems(filtered),
    }),
  });
  const data = await parseJson<{ ok: boolean; sent?: boolean; channel?: string; count?: number; preview?: string; error?: string }>(res);
  if (data.ok === false) {
    throw new Error(data.error || "发送失败");
  }
  return data as RunRemindResult;
}
