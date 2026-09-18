/**
 * 缺陷提醒任务 — WPS 多维表持久化存储
 *
 * 鉴权：从请求 cookie 取 `capa_session_<WPS_APP_ID>` JWT（OAuth 授权后由能力框架写入），
 * 用 SESSION_SECRET 验签解出 access_token，再以 Bearer 调用 openapi.wps.cn 多维表 API。
 * 注意：不能直连 o.wpsgo.com/app/app-base/base-proxy，也不能用 gateway_token 换 token——
 * 项目已配置 SESSION_SECRET，能力框架走的是 capa_session JWT 分支。
 */
import { verifyCapaSessionJwt } from "@ks-open/capability/server";

const REMIND_FILE_ID = "tmcQvuKxFrMJAHExDfFFrxC3PB5vCD4E7";
const REMIND_SHEET_ID = 12;
const OPENAPI_BASE = "https://openapi.wps.cn/v7/coop/dbsheet";

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
  IE: "webhook",
  IF: "remindTimes",
};

/**
 * 未在 FIELD_MAP 登记、但需按中文列名解析的列。
 * 新增列时无需先回读字段 ID 再改代码，只要列名一致即可自动生效。
 */
const FIELD_NAME_FALLBACK: Record<string, string> = {
  remindTimes: "提醒时间",
};

/** 业务字段名 → 多维表实际字段名（运行时从表结构解析，避免硬编码中文名出错） */
type FieldNames = Record<string, string>;

let fieldNamesCache: FieldNames | null = null;

// ─── 网关鉴权 ───

/** 从 cookie 头读取指定 cookie（值可能被 URL 编码） */
function readCookie(cookieHeader: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function getAccessToken(cookieHeader: string): Promise<string> {
  const config = useRuntimeConfig();
  const appId = String(config.WPS_APP_ID ?? "");
  const sessionSecret = String(config.SESSION_SECRET ?? "");
  if (!appId || !sessionSecret) throw new Error("服务端缺少 WPS_APP_ID / SESSION_SECRET 配置");

  const cookie = readCookie(cookieHeader, `capa_session_${appId}`);
  if (!cookie) throw new Error("缺少 capa_session 授权 cookie，请先在应用内完成 OAuth 授权");

  const session = await verifyCapaSessionJwt(cookie, new TextEncoder().encode(sessionSecret));
  if (!session?.accessToken) throw new Error("capa_session 授权已过期，请刷新页面重新授权");
  return session.accessToken;
}

// ─── HTTP ───

/** 多维表写/读请求（开放平台 openapi 通道，需用户 access_token） */
export async function apiPost<T = Record<string, unknown>>(
  accessToken: string,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const url = `${OPENAPI_BASE}/${REMIND_FILE_ID}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`多维表 API HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  let json: { code?: number; msg?: string; message?: string; data?: T };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`多维表 API 返回非 JSON: ${text.slice(0, 200)}`);
  }
  if (json.code !== undefined && json.code !== 0) {
    throw new Error(`多维表 API 错误 ${json.code}: ${json.msg || json.message || "unknown"}`);
  }
  return (json.data ?? (json as unknown as T)) as T;
}

/** 解析表结构，得到「业务字段名 → 实际字段名」映射（进程内缓存） */
async function resolveFieldNames(accessToken: string): Promise<FieldNames> {
  if (fieldNamesCache) return fieldNamesCache;
  const data = await apiPost<{ fields_schema?: Array<{ id: string; name: string }> }>(
    accessToken,
    `/sheets/${REMIND_SHEET_ID}/records`,
    { max_records: 1, show_fields_info: true },
  );
  const schema = data?.fields_schema ?? [];
  if (schema.length === 0) throw new Error("多维表未返回字段结构");
  const idToName = new Map(schema.map((f) => [f.id, f.name]));
  const names: FieldNames = {};
  for (const [id, key] of Object.entries(FIELD_MAP)) {
    const name = idToName.get(id);
    if (name) names[key] = name;
  }
  const existingNames = new Set(schema.map((f) => f.name));
  for (const [key, colName] of Object.entries(FIELD_NAME_FALLBACK)) {
    if (!names[key] && existingNames.has(colName)) names[key] = colName;
  }
  // 缺列必须显式告警：静默跳过会让「配置保存成功但没落库」看起来像正常
  const missing = Object.entries(FIELD_NAME_FALLBACK)
    .filter(([key]) => !names[key])
    .map(([, colName]) => colName);
  if (missing.length > 0) {
    console.warn(`[remind-dbsheet] 多维表缺少列：${missing.join("、")}，对应配置不会落库`);
  }
  fieldNamesCache = names;
  return names;
}

// ─── 记录解析 ───

/** 多维表记录行的字段值可能被序列化成 JSON 字符串，统一还原为对象 */
function normalizeFields(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function cellText(val: unknown): string {
  if (val == null) return "";
  if (typeof val === "object" && "text" in (val as Record<string, unknown>)) {
    return String((val as { text: unknown }).text ?? "");
  }
  return String(val);
}

function rowToTask(row: Record<string, unknown>, names: FieldNames): Record<string, unknown> | null {
  const fields = normalizeFields(row["fields"] ?? row);
  const id = cellText(fields[names.id]).trim();
  if (!id) return null;

  const startDate = formatDate(fields[names.startDate]);
  const lastRunAt = formatDateTime(fields[names.lastRunAt]);

  return {
    id,
    name: cellText(fields[names.name]),
    team: cellText(fields[names.team]) || "全部团队",
    frequency: mapFrequencyToEn(cellText(fields[names.frequency])),
    startDate,
    endDate: formatDate(fields[names.endDate]),
    webhook: cellText(fields[names.webhook]),
    enabled: toBool(fields[names.enabled]),
    severities: parseJsonArray(fields[names.severities]),
    iterations: parseJsonArray(fields[names.iterations]),
    remindTimes: normalizeRemindTimes(fields[names.remindTimes]),
    template: mapTemplateToEn(cellText(fields[names.template])),
    includeDetail: toBool(fields[names.includeDetail]),
    includeDeadline: toBool(fields[names.includeDeadline]),
    createdAt: startDate || new Date().toISOString(),
    updatedAt: lastRunAt || new Date().toISOString(),
    lastRunAt,
    lastRunStatus: mapStatusToEn(cellText(fields[names.lastRunStatus])),
    lastRunMessage: cellText(fields[names.lastRunMessage]),
  };
}

function taskToFields(task: Record<string, unknown>, names: FieldNames): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  // 表结构缺列时跳过，避免写出名为 "undefined" 的键污染记录
  const put = (key: string, value: unknown) => {
    const name = names[key];
    if (name) out[name] = value;
  };
  put("id", String(task.id ?? ""));
  put("name", String(task.name ?? ""));
  put("team", String(task.team ?? "全部团队"));
  put("frequency", mapFrequencyToZh(String(task.frequency ?? "daily")));
  const startCell = toDateCell(task.startDate);
  if (startCell) put("startDate", startCell);
  const endCell = toDateCell(task.endDate);
  if (endCell) put("endDate", endCell);
  put("enabled", task.enabled === true);
  put("severities", JSON.stringify(task.severities ?? []));
  put("iterations", JSON.stringify(task.iterations ?? []));
  put("remindTimes", JSON.stringify(normalizeRemindTimes(task.remindTimes)));
  put("template", mapTemplateToZh(String(task.template ?? "default")));
  put("includeDetail", task.includeDetail === true);
  put("includeDeadline", task.includeDeadline === true);
  const lastCell = toDateCell(task.lastRunAt, true);
  if (lastCell) put("lastRunAt", lastCell);
  const statusZh = mapStatusToZh(task.lastRunStatus);
  if (statusZh) put("lastRunStatus", statusZh);
  put("lastRunMessage", String(task.lastRunMessage ?? ""));
  put("webhook", String(task.webhook ?? ""));
  return out;
}

// ─── 映射函数 ───

// 频率枚举须与 RemindFrequency（daily/weekly/weekdays/once）完全一致，
// 曾误用 "workday" 导致「工作日」任务写表时静默降级为「每日」
function mapFrequencyToEn(zh: string): string {
  const map: Record<string, string> = { 每日: "daily", 每周: "weekly", 工作日: "weekdays", 仅一次: "once" };
  return map[zh] ?? "daily";
}
function mapFrequencyToZh(en: string): string {
  const map: Record<string, string> = { daily: "每日", weekly: "每周", weekdays: "工作日", once: "仅一次" };
  return map[en] ?? "每日";
}
// 模板枚举须与 RemindTemplate（default/detailed/deadline/escalate）一一对应，
// 多维表该字段的 4 个选项已按此对齐
function mapTemplateToEn(zh: string): string {
  const map: Record<string, string> = { 默认模板: "default", 详细清单: "detailed", 截止日期: "deadline", 升级催办: "escalate" };
  return map[zh] ?? "default";
}
function mapTemplateToZh(en: string): string {
  const map: Record<string, string> = { default: "默认模板", detailed: "详细清单", deadline: "截止日期", escalate: "升级催办" };
  return map[en] ?? "默认模板";
}
function mapStatusToEn(zh: string): "success" | "failed" | null {
  if (zh === "成功") return "success";
  if (zh === "失败") return "failed";
  return null;
}
function mapStatusToZh(en: unknown): string | undefined {
  if (en === "success") return "成功";
  if (en === "failed") return "失败";
  return undefined;
}

function toBool(val: unknown): boolean {
  return val === true || val === "true";
}

function parseJsonArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * 归一化为 YYYY-MM-DD。
 * 多维表可能返回毫秒时间戳，也可能返回 "2026/09/15" 这类按字段 numberFormat 渲染的字符串；
 * 而 isTaskDue 用字符串比较日期，混入斜杠格式会让 "2026-09-18" < "2026/09/15" 误判为真，
 * 导致任务永不触发，因此这里必须统一分隔符。
 */
function formatDate(val: unknown): string | null {
  if (typeof val === "number" && val > 0) return new Date(val).toISOString().split("T")[0];
  if (typeof val !== "string" || !val) return null;
  // 可能是 "2026/09/15"，也可能是写入时的 "2026-09-18 19:30"，统一取日期段
  const day = val.replace(/\//g, "-").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/**
 * 转为多维表 Date 字段可接受的字符串。
 * 该字段拒绝毫秒时间戳（实测写入 number 会返回 500410002 E_INVALIDARG，
 * 导致整条记录写入失败），必须传 "YYYY-MM-DD" 或 "YYYY-MM-DD HH:mm"。
 * 纯日期走字符串截取而非 Date 解析，避免容器时区与北京时区不一致时日期偏移。
 */
function toDateCell(val: unknown, withTime = false): string | undefined {
  if (typeof val !== "string" || !val.trim()) return undefined;
  const raw = val.trim().replace(/\//g, "-");
  if (!withTime) {
    const day = raw.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined;
  }
  // 纯日期串（从表里读回时已归一化为 YYYY-MM-DD）按本地 00:00 处理：
  // new Date("2026-09-18") 按 UTC 解析，在 UTC+8 下会变成 08:00，写出与来源不符的时间
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw} 00:00`;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return undefined;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 读回日期时间字段，保留到分钟（YYYY-MM-DD HH:mm）。
 * lastRunAt 必须保留时分：多时刻任务靠「同一天同一时刻」去重，截断成日期会导致重复发送。
 */
function formatDateTime(val: unknown): string | null {
  if (typeof val === "number" && val > 0) {
    // sv-SE 的 locale 输出即 "YYYY-MM-DD HH:mm:ss"，比手工拼装省事
    return new Date(val).toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }).slice(0, 16);
  }
  if (typeof val !== "string" || !val.trim()) return null;
  const raw = val.trim().replace(/\//g, "-");
  const day = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const time = raw.slice(11, 16);
  return /^\d{2}:\d{2}$/.test(time) ? `${day} ${time}` : `${day} 00:00`;
}

/** 归一化提醒时刻：只保留 HH:mm、向下对齐到 30 分钟槽位、去重升序 */
export function normalizeRemindTimes(raw: unknown): string[] {
  const slots = new Set<string>();
  for (const item of parseJsonArray(raw)) {
    const m = String(item).trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) continue;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) continue;
    slots.add(`${String(h).padStart(2, "0")}:${min < 30 ? "00" : "30"}`);
  }
  return [...slots].sort();
}

// ─── 公开接口 ───

/** 从多维表读取全部提醒任务，同时返回 record id 用于后续 upsert */
export async function loadTasks(
  cookieHeader: string,
): Promise<{ tasks: Record<string, unknown>[]; recordIds: Map<string, string> }> {
  const accessToken = await getAccessToken(cookieHeader);
  const names = await resolveFieldNames(accessToken);
  const data = await apiPost<{ records?: Record<string, unknown>[] }>(
    accessToken,
    `/sheets/${REMIND_SHEET_ID}/records`,
    { max_records: 1000 },
  );

  const rows = data?.records ?? [];
  const tasks: Record<string, unknown>[] = [];
  const recordIds = new Map<string, string>();
  for (const row of rows) {
    const task = rowToTask(row, names);
    const recordId = String(row["id"] ?? "");
    if (task?.id && recordId) {
      recordIds.set(String(task.id), recordId);
      tasks.push(task);
    }
  }
  return { tasks, recordIds };
}

/** 逐条 upsert 提醒任务，并删除多维表中已不存在的记录 */
export async function saveTasks(
  cookieHeader: string,
  tasks: Record<string, unknown>[],
  existingRecordIds: Map<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const accessToken = await getAccessToken(cookieHeader);
  const names = await resolveFieldNames(accessToken);
  let error: string | undefined;

  const toCreate: Record<string, unknown>[] = [];
  const toUpdate: Record<string, unknown>[] = [];

  for (const task of tasks) {
    const fieldsValue = JSON.stringify(taskToFields(task, names));
    const recordId = existingRecordIds.get(String(task.id ?? ""));
    if (recordId) toUpdate.push({ id: recordId, fields_value: fieldsValue });
    else toCreate.push({ fields_value: fieldsValue });
  }

  try {
    if (toCreate.length > 0) {
      const created = await apiPost<{ records?: Array<{ id?: string; fields?: unknown }> }>(
        accessToken,
        `/sheets/${REMIND_SHEET_ID}/records/create`,
        { records: toCreate },
      );
      // 回填新记录 id。否则下一次保存时这些任务仍无 recordId，会被当成新任务重复创建，
      // 触发「任务ID 值不唯一」并导致整批写入失败（包含本次要更新的其他任务）。
      for (const row of created?.records ?? []) {
        const taskId = cellText(normalizeFields(row.fields)[names.id]).trim();
        if (row.id && taskId) existingRecordIds.set(taskId, row.id);
      }
    }
    if (toUpdate.length > 0) {
      await apiPost(accessToken, `/sheets/${REMIND_SHEET_ID}/records/update`, { records: toUpdate });
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    console.warn("[remind-dbsheet] 写入失败:", error);
  }

  const currentIds = new Set(tasks.map((t) => String(t.id ?? "")));
  const toDelete = [...existingRecordIds.entries()]
    .filter(([taskId, recordId]) => !currentIds.has(taskId) && recordId)
    .map(([, recordId]) => recordId);

  if (toDelete.length > 0) {
    try {
      await apiPost(accessToken, `/sheets/${REMIND_SHEET_ID}/records/batch_delete`, { records: toDelete });
      // 删除成功后同步清掉这些 id，否则它们会一直留在映射里，下次写入又对已不存在的记录发起删除
      for (const [taskId, recordId] of existingRecordIds) {
        if (!currentIds.has(taskId) && toDelete.includes(recordId)) existingRecordIds.delete(taskId);
      }
    } catch (err) {
      error = error ?? (err instanceof Error ? err.message : String(err));
      console.warn("[remind-dbsheet] 删除失败:", error);
    }
  }

  return { ok: !error, error };
}
