import { getAppApiUrl } from "@/lib/oauth-redirect";
import type { DefectRemindTask, DefectRemindTaskInput, DefectRow } from "@/lib/defect";

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
  const res = await fetch(getAppApiUrl("api/defect-remind-tasks"));
  const data = await parseJson<{ tasks: DefectRemindTask[] }>(res);
  return data.tasks ?? [];
}

/** 从后端拉取 ONES 项目的活跃缺陷（服务端已过滤已关闭/不必修复/草稿） */
export async function fetchOnesDefects(): Promise<DefectRow[]> {
  const res = await fetch(getAppApiUrl("api/ones-defects"), { credentials: "include" });
  const data = await parseJson<{ ok: boolean; rows: DefectRow[] }>(res);
  return data.rows ?? [];
}

export async function createRemindTask(input: DefectRemindTaskInput): Promise<DefectRemindTask> {
  const res = await fetch(getAppApiUrl("api/defect-remind-tasks"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseJson<{ task: DefectRemindTask }>(res);
  return data.task;
}

export async function updateRemindTask(id: string, input: DefectRemindTaskInput): Promise<DefectRemindTask> {
  const res = await fetch(getAppApiUrl(`api/defect-remind-tasks/${id}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseJson<{ task: DefectRemindTask }>(res);
  return data.task;
}

export async function deleteRemindTask(id: string): Promise<void> {
  const res = await fetch(getAppApiUrl(`api/defect-remind-tasks/${id}`), { method: "DELETE" });
  await parseJson<{ ok: boolean }>(res);
}

export async function runRemindTask(options: {
  taskId: string;
  defects: DefectRow[];
  scheduled?: boolean;
}): Promise<RunRemindResult> {
  const res = await fetch(getAppApiUrl("api/defect-remind-tasks/run"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskId: options.taskId,
      scheduled: options.scheduled === true,
      defects: toRemindItems(options.defects),
    }),
  });
  return parseJson<RunRemindResult>(res);
}
