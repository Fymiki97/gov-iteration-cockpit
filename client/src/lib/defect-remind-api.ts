import { getAppApiUrl } from "@/lib/oauth-redirect";
import { matchTaskDefects } from "@/lib/defect";
import type { DefectRemindTask, DefectRemindTaskInput, DefectRow } from "@/lib/defect";

const TASKS_STORAGE_KEY = "defect-remind-tasks";

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

export async function fetchRemindTasks(): Promise<DefectRemindTask[]> {
  const local = loadLocalTasks();
  try {
    const res = await fetch(getAppApiUrl("api/defect-remind-tasks"), { credentials: "include" });
    const data = await parseJson<{ tasks: DefectRemindTask[] }>(res);
    const server = data.tasks ?? [];
    // 合并：服务端有的以服务端为准，服务端没有但本地有的保留（容器重启不丢数据）
    const serverIds = new Set(server.map((t) => t.id));
    const localOnly = local.filter((t) => !serverIds.has(t.id));
    return [...localOnly, ...server];
  } catch {
    return local;
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

export async function createRemindTask(input: DefectRemindTaskInput): Promise<DefectRemindTask> {
  const res = await fetch(getAppApiUrl("api/defect-remind-tasks"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  const data = await parseJson<{ task: DefectRemindTask }>(res);
  // 同步到 localStorage
  const local = loadLocalTasks();
  saveLocalTasks([data.task, ...local.filter((t) => t.id !== data.task.id)]);
  return data.task;
}

export async function updateRemindTask(id: string, input: DefectRemindTaskInput): Promise<DefectRemindTask> {
  const res = await fetch(getAppApiUrl(`api/defect-remind-tasks/${id}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  const data = await parseJson<{ task: DefectRemindTask }>(res);
  // 同步到 localStorage
  const local = loadLocalTasks();
  saveLocalTasks(local.map((t) => (t.id === id ? data.task : t)));
  return data.task;
}

export async function deleteRemindTask(id: string): Promise<void> {
  const res = await fetch(getAppApiUrl(`api/defect-remind-tasks/${id}`), { method: "DELETE", credentials: "include" });
  await parseJson<{ ok: boolean }>(res);
  // 同步从 localStorage 删除
  const local = loadLocalTasks();
  saveLocalTasks(local.filter((t) => t.id !== id));
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
