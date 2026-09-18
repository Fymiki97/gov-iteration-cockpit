import { getAppApiUrl } from "@/lib/oauth-redirect";
import { matchTaskDefects } from "@/lib/defect";
import type { DefectRemindTask, DefectRemindTaskInput, DefectRow } from "@/lib/defect";

/** 会话级缓存：记录本次会话已自动执行过的一次性任务，防止刷新后重复执行 */
const autoRunCache = new Set<string>();

export function hasAutoRun(taskId: string): boolean { return autoRunCache.has(taskId); }
export function markAutoRun(taskId: string): void { autoRunCache.add(taskId); }

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

/**
 * 拉取提醒任务。任务配置的唯一来源是多维表：读取失败直接抛出，
 * 不退回到本地缓存——本地缓存会让界面显示的任务与多维表不一致。
 */
export async function fetchRemindTasks(): Promise<{ tasks: DefectRemindTask[]; warning?: string }> {
  const res = await fetch(getAppApiUrl("api/defect-remind-tasks"), { credentials: "include" });
  const data = await parseJson<{ ok?: boolean; tasks?: DefectRemindTask[]; error?: string; persistError?: string | null }>(res);
  if (data.ok === false) throw new Error(data.error || "读取提醒任务失败");
  return {
    tasks: data.tasks ?? [],
    // 读取成功也可能带着上一次未解决的落库异常，需继续告知用户
    warning: data.persistError ?? undefined,
  };
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
  return { task, warning: data.persisted === false ? (data.persistError || "未写入多维表") : undefined };
}

export async function deleteRemindTask(id: string): Promise<{ warning?: string }> {
  const res = await fetch(getAppApiUrl(`api/defect-remind-tasks/${id}`), { method: "DELETE", credentials: "include" });
  const data = await parseJson<{ ok?: boolean; error?: string; persisted?: boolean; persistError?: string }>(res);
  if (data.ok === false) throw new Error(data.error || "删除任务失败");
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
