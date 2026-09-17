/**
 * 缺陷提醒任务 — WPS 365 多维表持久化存储
 *
 * 通过平台 gateway_token 代理访问多维表 CRUD API，
 * 替代本地 .data/ 文件存储（容器重启不丢失）。
 */

const REMIND_FILE_ID = "tmcQvuKxFrMJAHExDfFFrxC3PB5vCD4E7";
const REMIND_SHEET_ID = 12;

/** 多维表字段 ID → 业务字段名 */
const FIELD_MAP: Record<string, string> = {
  H1: "id",
  H2: "name",
  H3: "team",
  H4: "frequency",
  H5: "startDate",
  H6: "endDate",
  H7: "enabled",
  H8: "severities",
  H9: "iterations",
  "H-": "template",
  H_: "includeDetail",
  IA: "includeDeadline",
  IB: "lastRunAt",
  IC: "lastRunStatus",
  ID: "lastRunMessage",
};

const REVERSE_MAP = Object.fromEntries(Object.entries(FIELD_MAP).map(([k, v]) => [v, k]));

/** 从多维表记录行提取扁平字段值 */
function extractField(row: Record<string, unknown>, fieldId: string): unknown {
  const cell = row[fieldId];
  if (cell == null) return null;
  // 多维表文本字段返回 { text: "..." } 或直接字符串
  if (typeof cell === "object" && cell !== null && "text" in cell) {
    return (cell as { text: string }).text;
  }
  // 日期字段返回毫秒时间戳
  if (typeof cell === "number") return cell;
  return cell;
}

/** 从多维表记录行解析为 DefectRemindTask */
function rowToTask(row: Record<string, unknown>): Record<string, unknown> | null {
  const rawId = String(extractField(row, "H1") ?? "").trim();
  if (!rawId) return null;

  const task: Record<string, unknown> = {
    id: rawId,
    name: String(extractField(row, "H2") ?? ""),
    team: String(extractField(row, "H3") ?? "全部团队"),
    frequency: mapFrequencyToEn(String(extractField(row, "H4") ?? "daily")),
    startDate: formatDate(extractField(row, "H5")),
    endDate: formatDate(extractField(row, "H6")),
    webhook: "", // 不存多维表，由前端提供
    enabled: extractField(row, "H7") === true || extractField(row, "H7") === "true",
    severities: parseJsonArray(extractField(row, "H8")),
    iterations: parseJsonArray(extractField(row, "H9")),
    template: mapTemplateToEn(String(extractField(row, "H-") ?? "default")),
    includeDetail: extractField(row, "H_") === true || extractField(row, "H_") === "true",
    includeDeadline: extractField(row, "IA") === true || extractField(row, "IA") === "true",
    createdAt: formatDate(extractField(row, "H5")) || new Date().toISOString(),
    updatedAt: formatDate(extractField(row, "IB")) || new Date().toISOString(),
    lastRunAt: formatDate(extractField(row, "IB")),
    lastRunStatus: mapStatusToEn(extractField(row, "IC")),
    lastRunMessage: String(extractField(row, "ID") ?? ""),
  };
  return task;
}

/** 将 DefectRemindTask 转为多维表记录行 */
function taskToRow(task: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  row["H1"] = String(task.id ?? "");
  row["H2"] = String(task.name ?? "");
  row["H3"] = String(task.team ?? "全部团队");
  row["H4"] = mapFrequencyToZh(String(task.frequency ?? "daily"));
  if (task.startDate) row["H5"] = parseDateToMs(task.startDate);
  if (task.endDate) row["H6"] = parseDateToMs(task.endDate);
  row["H7"] = task.enabled === true;
  row["H8"] = JSON.stringify(task.severities ?? []);
  row["H9"] = JSON.stringify(task.iterations ?? []);
  row["H-"] = mapTemplateToZh(String(task.template ?? "default"));
  row["H_"] = task.includeDetail === true;
  row["IA"] = task.includeDeadline === true;
  if (task.lastRunAt) row["IB"] = parseDateToMs(task.lastRunAt);
  if (task.lastRunStatus) row["IC"] = mapStatusToZh(task.lastRunStatus);
  row["ID"] = String(task.lastRunMessage ?? "");
  return row;
}

// ─── 映射函数 ───

function mapFrequencyToEn(zh: string): string {
  const map: Record<string, string> = { "每日": "daily", "每周": "weekly", "工作日": "workday" };
  return map[zh] ?? "daily";
}
function mapFrequencyToZh(en: string): string {
  const map: Record<string, string> = { daily: "每日", weekly: "每周", workday: "工作日" };
  return map[en] ?? "每日";
}
function mapTemplateToEn(zh: string): string {
  const map: Record<string, string> = { "默认模板": "default", "批量合并": "batch" };
  return map[zh] ?? "default";
}
function mapTemplateToZh(en: string): string {
  const map: Record<string, string> = { default: "默认模板", batch: "批量合并" };
  return map[en] ?? "默认模板";
}
function mapStatusToEn(zh: unknown): "success" | "failed" | null {
  if (zh === "成功") return "success";
  if (zh === "失败") return "failed";
  return null;
}
function mapStatusToZh(en: unknown): string | undefined {
  if (en === "success") return "成功";
  if (en === "failed") return "失败";
  return undefined;
}

function parseJsonArray(val: unknown): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  return [];
}

function formatDate(val: unknown): string | null {
  if (typeof val === "number" && val > 0) {
    return new Date(val).toISOString().split("T")[0];
  }
  if (typeof val === "string" && val) return val.split("T")[0];
  return null;
}

function parseDateToMs(dateStr: unknown): number | undefined {
  if (typeof dateStr === "string" && dateStr) {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? undefined : d.getTime();
  }
  return undefined;
}

// ─── API 调用 ───

async function fetchRecords(
  gatewayToken: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>[] | null> {
  const config = useRuntimeConfig();
  const endpoint = (config.appBaseEndpoint as string) || "https://o.wpsgo.com/app/app-base";
  const url = `${endpoint}/base-proxy/v7/coop/dbsheet/${REMIND_FILE_ID}/sheets/${REMIND_SHEET_ID}/records`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `gateway_token=${gatewayToken}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`[remind-dbsheet] fetchRecords HTTP ${res.status}`);
      return null;
    }
    const json = await res.json() as { data?: { records?: unknown[] } };
    return Array.isArray(json?.data?.records) ? (json.data.records as Record<string, unknown>[]) : [];
  } catch (err) {
    console.warn("[remind-dbsheet] fetchRecords error:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function createRecords(
  gatewayToken: string,
  rows: Record<string, unknown>[],
): Promise<boolean> {
  const config = useRuntimeConfig();
  const endpoint = (config.appBaseEndpoint as string) || "https://o.wpsgo.com/app/app-base";
  const url = `${endpoint}/base-proxy/v7/coop/dbsheet/${REMIND_FILE_ID}/sheets/${REMIND_SHEET_ID}/records`;

  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: `gateway_token=${gatewayToken}` },
      body: JSON.stringify({ records: rows }),
    });
    return res.ok;
  } catch (err) {
    console.warn("[remind-dbsheet] createRecords error:", err instanceof Error ? err.message : err);
    return false;
  }
}

async function deleteRecordsById(gatewayToken: string, ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  const config = useRuntimeConfig();
  const endpoint = (config.appBaseEndpoint as string) || "https://o.wpsgo.com/app/app-base";
  const url = `${endpoint}/base-proxy/v7/coop/dbsheet/${REMIND_FILE_ID}/sheets/${REMIND_SHEET_ID}/records`;

  try {
    const res = await fetch(url, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Cookie: `gateway_token=${gatewayToken}` },
      body: JSON.stringify({ records: ids }),
    });
    return res.ok;
  } catch (err) {
    console.warn("[remind-dbsheet] deleteRecordsById error:", err instanceof Error ? err.message : err);
    return false;
  }
}

async function upsertRecord(
  gatewayToken: string,
  row: Record<string, unknown>,
  existingRecordId?: string,
): Promise<boolean> {
  const config = useRuntimeConfig();
  const endpoint = (config.appBaseEndpoint as string) || "https://o.wpsgo.com/app/app-base";
  const url = `${endpoint}/base-proxy/v7/coop/dbsheet/${REMIND_FILE_ID}/sheets/${REMIND_SHEET_ID}/records`;

  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: `gateway_token=${gatewayToken}` },
      body: JSON.stringify(existingRecordId ? { _id: existingRecordId, ...row } : row),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`[remind-dbsheet] upsertRecord HTTP ${res.status}:`, errText.slice(0, 200));
    }
    return res.ok;
  } catch (err) {
    console.warn("[remind-dbsheet] upsertRecord error:", err instanceof Error ? err.message : err);
    return false;
  }
}

// ─── 公开接口 ───

/** 从多维表读取全部提醒任务，同时返回 record _id 用于 upsert */
export async function loadTasks(
  gatewayToken: string,
): Promise<{ tasks: Record<string, unknown>[]; recordIds: Map<string, string> }> {
  const rows = await fetchRecords(gatewayToken, { prefer_id: true, max_records: 1000 });
  if (!rows) return { tasks: [], recordIds: new Map() };
  const recordIds = new Map<string, string>();
  const tasks: Record<string, unknown>[] = [];
  for (const row of rows) {
    const rid = String(row["_id"] ?? "");
    const task = rowToTask(row);
    if (task?.id && rid) {
      recordIds.set(String(task.id), rid);
      tasks.push(task);
    }
  }
  return { tasks, recordIds };
}

/** 逐条 upsert 提醒任务到多维表，删除本地已有但多维表中不存在的 */
export async function saveTasks(
  gatewayToken: string,
  tasks: Record<string, unknown>[],
  existingRecordIds: Map<string, string>,
): Promise<boolean> {
  let ok = true;

  // upsert 每条
  for (const task of tasks) {
    const row = taskToRow(task);
    const rid = existingRecordIds.get(String(task.id ?? "")) ?? "";
    const result = await upsertRecord(gatewayToken, row, rid);
    if (!result) ok = false;
  }

  // 删除多维表中有但本次列表中没有的（任务被删除的情况）
  const currentIds = new Set(tasks.map((t) => String(t.id ?? "")));
  const toDelete: string[] = [];
  for (const [taskId, recordId] of existingRecordIds) {
    if (!currentIds.has(taskId) && recordId) toDelete.push(recordId);
  }
  if (toDelete.length > 0) {
    const delResult = await deleteRecordsById(gatewayToken, toDelete);
    if (!delResult) ok = false;
  }

  return ok;
}
