import { createHash, createHmac } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface OnesConfig {
  base_url: string;
  team_uuid: string;
  user_id: string;
  auth_token: string;
  default_project_uuid: string | string[];
  bug_issue_type_uuid?: string;
}

export interface OnesTask {
  uuid: string;
  number: number;
  name: string;
  status: { name: string } | null;
  sprint: { name: string } | null;
  priority: { value: string } | null;
  severity: { value: string } | null;
  module: string | null;
  owner: { name: string } | null;
  createTime: number;
  deadline: number | null;
}

export interface ApiDefectRow {
  id: string;
  bugId: string;
  title: string;
  priority: string;
  severity: string;
  status: string;
  team: string;
  iteration: string;
  module: string;
  owner: string;
  reporter: string;
  createdAt: string;
  deadline: string;
  onesUrl?: string;
}

export interface OnesSnapshot {
  ts: number;
  baseUrl: string;
  teamUuid: string;
  projectUuid: string;
  tasks: OnesTask[];
}

const EXCLUDED_SPRINT_NAMES = new Set(["需求池-产品用", "一体机历史需求", "政企反馈待办池"]);
const SKIP_STATUS_NAMES = new Set(["草稿"]);
const SNAPSHOT_FILENAME = "ones-defects-snapshot.json";

export function isOnesNetworkError(err: unknown): boolean {
  const e = err as { name?: string; message?: string; cause?: { code?: string } };
  const code = e?.cause?.code ?? "";
  if (e?.name === "TimeoutError") return true;
  if (["ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "ECONNREFUSED", "EHOSTUNREACH"].includes(code)) return true;
  return /域名解析失败|网络连接失败|网络请求失败|无法访问/.test(e?.message ?? "");
}

export function describeOnesFetchError(err: unknown): string {
  const e = err as { name?: string; message?: string; cause?: { code?: string } };
  const code = e?.cause?.code ?? "";
  if (e?.name === "TimeoutError") {
    return "ONES API 请求超时（20 秒），可能是服务器网络不通或 ONES 服务异常";
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return `ONES 域名解析失败（${code}）。ones.dig.kso.net 是内网域名，服务器需在公司网络/VPN 环境下才能访问`;
  }
  if (code === "ETIMEDOUT" || code === "ECONNREFUSED" || code === "EHOSTUNREACH") {
    return `ONES 网络连接失败（${code}）。服务器当前环境可能无法访问公司内网 ONES`;
  }
  if (e?.message && e.message !== "fetch failed") return e.message;
  return code ? `ONES 网络请求失败（${code}）` : "ONES 网络请求失败（服务器无法访问 ones.dig.kso.net）";
}

function teamOfSprint(sprintName: string): string {
  if (sprintName.startsWith("政务AI")) return "政务AI";
  if (sprintName.startsWith("政务协作")) return "政务协作";
  if (/^V\d+\./.test(sprintName)) return "政务AI";
  if (sprintName.startsWith("电子公文库")) return "政务AI";
  return "WPS政务365";
}

function statusOf(name: string): string {
  if (name === "待修复") return "待处理";
  if (name === "处理中" || name === "修复中") return "处理中";
  if (name === "待回归") return "待验证";
  if (name === "回归通过" || name === "已修复") return "已修复";
  if (name === "关闭" || name === "不必修复") return "已关闭";
  console.warn(`[ones-defects] 未识别的 ONES 状态名: ${JSON.stringify(name)}，按处理中处理`);
  return "处理中";
}

function microsToDate(ts: number): Date {
  if (ts > 1e15) return new Date(ts / 1000);
  if (ts > 1e12) return new Date(ts);
  return new Date(ts * 1000);
}

function formatCreatedAt(ts: number): string {
  const d = microsToDate(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDeadline(ts: number | null): string {
  if (!ts) return "";
  const d = microsToDate(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function issueDetailUrl(_cfg: OnesConfig, _projectUuid: string, taskNumber: number): string {
  return `https://ones.dig.kso.net/om/v1/gs/task/${taskNumber}`;
}

export function mapRow(cfg: OnesConfig, projectUuid: string, task: OnesTask): ApiDefectRow {
  const team = task.sprint?.name ? teamOfSprint(task.sprint.name) : "政务AI";
  return {
    id: `ones_${task.number}`,
    bugId: String(task.number),
    onesUrl: issueDetailUrl(cfg, projectUuid, task.number),
    title: task.name,
    priority: task.priority?.value ?? "普通",
    severity: task.severity?.value ?? "B-一般",
    status: task.status?.name ? statusOf(task.status.name) : "处理中",
    team,
    iteration: task.sprint?.name ?? "",
    module: task.module ?? "",
    owner: task.owner?.name ?? "",
    reporter: task.owner?.name ?? "",
    createdAt: formatCreatedAt(task.createTime),
    deadline: formatDeadline(task.deadline),
  };
}

export function mapTasksToRows(cfg: OnesConfig, projectUuid: string, tasks: OnesTask[]): ApiDefectRow[] {
  return tasks
    .filter((task) => !(task.status?.name && SKIP_STATUS_NAMES.has(task.status.name)))
    .filter((task) => !(task.sprint?.name && EXCLUDED_SPRINT_NAMES.has(task.sprint.name)))
    .map((task) => mapRow(cfg, projectUuid, task));
}

export function buildGraphqlQuery(project: string, bugType: string): string {
  return `{
    tasks(filter:{project_in:["${project}"],issueType_in:["${bugType}"],statusCategory_in:["to_do","in_progress","done"]},orderBy:{createTime:DESC},limit:5000){
      uuid number name status{name} sprint{name} priority{value} severity:_6Uk19k7i{value} module:_SH5ADjuQ owner{name} createTime deadline
    }
  }`;
}

export function firstProjectUuid(cfg: OnesConfig): string {
  return Array.isArray(cfg.default_project_uuid) ? cfg.default_project_uuid[0] : cfg.default_project_uuid;
}

async function readConfigFile(path: string): Promise<OnesConfig | null> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as OnesConfig;
  } catch {
    return null;
  }
}

function configFromRuntime(): OnesConfig | null {
  const runtime = useRuntimeConfig();
  const authToken = String(runtime.ONES_AUTH_TOKEN ?? "");
  const teamUuid = String(runtime.ONES_TEAM_UUID ?? "");
  if (!authToken || !teamUuid) return null;
  const project = String(runtime.ONES_PROJECT_UUID ?? "");
  return {
    base_url: String(runtime.ONES_BASE_URL || "https://ones.dig.kso.net"),
    team_uuid: teamUuid,
    user_id: String(runtime.ONES_USER_ID ?? ""),
    auth_token: authToken,
    default_project_uuid: project.includes(",")
      ? project.split(",").map((item) => item.trim()).filter(Boolean)
      : project,
    bug_issue_type_uuid: String(runtime.ONES_BUG_ISSUE_TYPE_UUID || "") || undefined,
  };
}

function bundledDir(): string | null {
  try {
    return dirname(fileURLToPath(import.meta.url));
  } catch {
    return null;
  }
}

export async function loadOnesConfig(): Promise<OnesConfig> {
  const bundled = bundledDir();
  const cfg =
    (await readConfigFile(join(homedir(), ".ones-config.json")))
    ?? (bundled ? await readConfigFile(join(bundled, "ones-config.json")) : null)
    ?? configFromRuntime();
  if (!cfg?.auth_token || !cfg.team_uuid) {
    throw createError({ statusCode: 500, message: "ONES 配置不完整（缺少 auth_token / team_uuid）" });
  }
  return cfg;
}

function graphqlPath(cfg: OnesConfig): string {
  // ones-cache 反代带 ?t=Task 会把 query 拼进 body，触发 Malformed.JSON。
  return `/project/api/project/team/${cfg.team_uuid}/items/graphql`;
}

function requestUri(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

function kso1Headers(options: {
  appId: string;
  appKey: string;
  method: string;
  uri: string;
  contentType: string;
  body: string;
}): Record<string, string> {
  const ksoDate = new Date().toUTCString();
  const bodyHash = options.body
    ? createHash("sha256").update(options.body).digest("hex")
    : "";
  const payload = `KSO-1${options.method}${options.uri}${options.contentType}${ksoDate}${bodyHash}`;
  const signature = createHmac("sha256", options.appKey).update(payload).digest("hex");
  return {
    "X-Kso-Date": ksoDate,
    "X-Kso-Authorization": `KSO-1 ${options.appId}:${signature}`,
  };
}

function wps3Headers(options: {
  appId: string;
  appKey: string;
  uri: string;
  contentType: string;
  body: string;
}): Record<string, string> {
  const date = new Date().toUTCString();
  const contentMd5 = createHash("md5").update(options.body).digest("hex");
  const sign = createHash("sha1")
    .update(`${options.appKey}${contentMd5}${options.uri}${options.contentType}${date}`)
    .digest("hex");
  return {
    Date: date,
    "Content-Md5": contentMd5,
    "X-Auth": `WPS-3:${options.appId}:${sign}`,
  };
}

function cacheAuthVariants(url: string, body: string): Record<string, string>[] {
  // /oc/producer/ones 反代只认 Ones-User-Id / Ones-Auth-Token，不需要 app 签名。
  if (!url.includes("/oc/producer/data")) return [{}];
  const runtime = useRuntimeConfig();
  const appId = String(runtime.ONES_CACHE_APP_ID || "").trim();
  const appKey = String(runtime.ONES_CACHE_APP_KEY || "").trim();
  if (!appId || !appKey) return [{}];
  const uri = requestUri(url);
  const contentType = "application/json";
  return [
    kso1Headers({ appId, appKey, method: "POST", uri, contentType, body }),
    wps3Headers({ appId, appKey, uri, contentType, body }),
  ];
}

function onesGraphqlCandidates(cfg: OnesConfig): string[] {
  const path = graphqlPath(cfg);
  const runtime = useRuntimeConfig();
  const cacheBase = String(runtime.ONES_CACHE_BASE_URL || "https://ones-cache.wps.cn/oc/producer/ones").replace(/\/+$/, "");
  const internalBase = cfg.base_url.replace(/\/+$/, "");
  return [...new Set([`${cacheBase}${path}`, `${internalBase}${path}`])];
}

async function postOnesGraphql(url: string, cfg: OnesConfig, query: string, extraHeaders: Record<string, string> = {}): Promise<OnesTask[]> {
  const body = JSON.stringify({ query });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Ones-User-Id": cfg.user_id,
      "Ones-Auth-Token": cfg.auth_token,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body,
    signal: AbortSignal.timeout(20_000),
    redirect: "manual",
  });
  if (res.status === 401) {
    throw createError({ statusCode: 502, message: "ONES Token 已过期，请更新 ~/.ones-config.json" });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ONES API 错误：HTTP ${res.status}${text ? ` ${text.slice(0, 180)}` : ""}`);
  }
  const data = (await res.json()) as { code?: number; desc?: string; data?: { tasks?: OnesTask[] } };
  if (data.code && data.code !== 200) {
    throw new Error(`ONES GraphQL 错误：${data.desc ?? "unknown"}`);
  }
  if (!data.data?.tasks) {
    throw new Error("ONES GraphQL 返回缺少 tasks");
  }
  return data.data.tasks;
}

export async function fetchOpenBugs(cfg: OnesConfig): Promise<OnesTask[]> {
  const query = buildGraphqlQuery(firstProjectUuid(cfg), cfg.bug_issue_type_uuid ?? "Tk5ypVS8");
  const errors: string[] = [];
  for (const url of onesGraphqlCandidates(cfg)) {
    const isCache = url.includes("ones-cache.wps.cn");
    const variants = isCache ? cacheAuthVariants(url, JSON.stringify({ query })) : [{}];
    for (const extraHeaders of variants) {
      try {
        const tasks = await postOnesGraphql(url, cfg, query, extraHeaders);
        console.info(`[ones-defects] 拉取成功: ${url} (${tasks.length} tasks)`);
        return tasks;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 401 || statusCode === 502) throw err;
        const message = err instanceof Error ? err.message : String(err);
        const network = describeOnesFetchError(err);
        errors.push(`${url} -> ${message === "fetch failed" ? network : message}`);
        console.warn(`[ones-defects] 候选失败: ${url} -> ${message}`);
      }
    }
  }
  throw new Error(errors[0] ? `ONES 拉取失败：${errors.join(" | ")}` : describeOnesFetchError(new Error("fetch failed")));
}

function snapshotCandidatePaths(): string[] {
  const bundled = bundledDir();
  return [
    ...(bundled ? [join(bundled, SNAPSHOT_FILENAME)] : []),
    join(process.cwd(), "data", SNAPSHOT_FILENAME),
    join(process.cwd(), "server", "data", SNAPSHOT_FILENAME),
  ];
}

export async function readOnesSnapshot(): Promise<OnesSnapshot | null> {
  for (const path of snapshotCandidatePaths()) {
    try {
      const parsed = JSON.parse(await readFile(path, "utf-8")) as OnesSnapshot;
      if (parsed && Array.isArray(parsed.tasks) && parsed.projectUuid) return parsed;
    } catch {
      // try next
    }
  }
  return null;
}

export async function writeOnesSnapshot(snapshot: OnesSnapshot): Promise<void> {
  const targets = [
    join(process.cwd(), "data", SNAPSHOT_FILENAME),
    join(process.cwd(), "server", "data", SNAPSHOT_FILENAME),
  ];
  for (const path of targets) {
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(snapshot)}\n`, "utf-8");
      return;
    } catch {
      // 生产环境可能只读，忽略
    }
  }
}

export function rowsFromSnapshot(snapshot: OnesSnapshot): ApiDefectRow[] {
  const cfg: OnesConfig = {
    base_url: snapshot.baseUrl,
    team_uuid: snapshot.teamUuid,
    user_id: "",
    auth_token: "",
    default_project_uuid: snapshot.projectUuid,
  };
  return mapTasksToRows(cfg, snapshot.projectUuid, snapshot.tasks);
}
