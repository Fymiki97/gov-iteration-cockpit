import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface OnesConfig {
  base_url: string;
  team_uuid: string;
  user_id: string;
  auth_token: string;
  default_project_uuid: string | string[];
  bug_issue_type_uuid?: string;
}

interface OnesTask {
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

// 需求池/待办池类迭代不参与缺陷看板
const EXCLUDED_SPRINT_NAMES = new Set(["需求池-产品用", "一体机历史需求", "政企反馈待办池"]);

// GraphQL 用 statusCategory 排除 done（关闭/不必修复），这里再去掉草稿
const SKIP_STATUS_NAMES = new Set(["草稿"]);

// ONES 迭代名前缀 → 看板团队
function teamOfSprint(sprintName: string): string {
  if (sprintName.startsWith("政务AI")) return "政务AI";
  if (sprintName.startsWith("政务协作")) return "政务协作";
  // Vx.x 系列与电子公文库是政务AI产品线的迭代，但 ONES 迭代名无前缀
  if (/^V\d+\./.test(sprintName)) return "政务AI";
  if (sprintName.startsWith("电子公文库")) return "政务AI";
  return "WPS政务365";
}

// ONES 状态 → 看板状态
function statusOf(name: string): string {
  if (name === "待修复") return "待处理";
  if (name === "处理中" || name === "修复中") return "处理中";
  // 待回归 = 开发已修复、待测试回归验证
  if (name === "待回归") return "待验证";
  if (name === "回归通过" || name === "已修复") return "已修复";
  if (name === "关闭" || name === "不必修复") return "已关闭";
  console.warn(`[ones-defects] 未识别的 ONES 状态名: ${JSON.stringify(name)}，按处理中处理`);
  return "处理中";
}

function microsToDate(ts: number): Date {
  // 16位=微秒，13位=毫秒，10位=秒（ONES 字段速查口径）
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

// ONES 缺陷详情页：team/project 均取自配置，issue 详情用 task uuid
function issueDetailUrl(cfg: OnesConfig, projectUuid: string, taskUuid: string): string {
  return `${cfg.base_url.replace(/\/+$/, "")}/project/#/team/${cfg.team_uuid}/project/${projectUuid}/issue/detail/${taskUuid}`;
}

function mapRow(cfg: OnesConfig, projectUuid: string, task: OnesTask): ApiDefectRow {
  const team = task.sprint?.name ? teamOfSprint(task.sprint.name) : "政务AI";
  return {
    id: `ones_${task.number}`,
    bugId: String(task.number),
    onesUrl: issueDetailUrl(cfg, projectUuid, task.uuid),
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

const CACHE_TTL_MS = 60_000;
let cache: { rows: ApiDefectRow[]; ts: number } | null = null;
let inFlight: Promise<ApiDefectRow[]> | null = null;

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

function bundledConfigPath(): string | null {
  try {
    return join(dirname(fileURLToPath(import.meta.url)), "ones-config.json");
  } catch {
    return null;
  }
}

async function loadConfig(): Promise<OnesConfig> {
  const bundled = bundledConfigPath();
  const cfg =
    (await readConfigFile(join(homedir(), ".ones-config.json")))
    ?? (bundled ? await readConfigFile(bundled) : null)
    ?? configFromRuntime();
  if (!cfg?.auth_token || !cfg.team_uuid) {
    throw createError({ statusCode: 500, message: "ONES 配置不完整（缺少 auth_token / team_uuid）" });
  }
  return cfg;
}

async function fetchOpenBugs(cfg: OnesConfig): Promise<OnesTask[]> {
  const projects = Array.isArray(cfg.default_project_uuid)
    ? cfg.default_project_uuid
    : [cfg.default_project_uuid];
  const project = projects[0];
  const url = `${cfg.base_url.replace(/\/+$/, "")}/project/api/project/team/${cfg.team_uuid}/items/graphql?t=Task`;
  // 只拉 to_do / in_progress。不按 createTime 取前 2000 条，否则会被已关闭缺陷占满，
  // 活跃缺陷被挤掉，响应超过 1MB，网关/前端解析失败后回退到本地空数据。
  const query = `{
    tasks(filter:{project_in:["${project}"],issueType_in:["${cfg.bug_issue_type_uuid ?? "Tk5ypVS8"}"],statusCategory_in:["to_do","in_progress"]},orderBy:{createTime:DESC},limit:500){
      uuid number name status{name} sprint{name} priority{value} severity:_6Uk19k7i{value} module:_SH5ADjuQ owner{name} createTime deadline
    }
  }`;

  // 网络层异常翻译成可行动的中文诊断，配合 200+ok:false 让前端能看到真实原因
  function describeFetchError(err: unknown): string {
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

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Ones-User-Id": cfg.user_id,
        "Ones-Auth-Token": cfg.auth_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new Error(describeFetchError(err));
  }

  if (res.status === 401) {
    throw createError({ statusCode: 502, message: "ONES Token 已过期，请更新 ~/.ones-config.json" });
  }
  if (!res.ok) {
    throw createError({ statusCode: 502, message: `ONES API 错误：HTTP ${res.status}` });
  }
  const data = (await res.json()) as { code?: number; desc?: string; data?: { tasks?: OnesTask[] } };
  if (data.code && data.code !== 200) {
    throw createError({ statusCode: 502, message: `ONES GraphQL 错误：${data.desc ?? "unknown"}` });
  }
  return data.data?.tasks ?? [];
}

async function loadDefects(): Promise<ApiDefectRow[]> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache.rows;
  if (!inFlight) {
    inFlight = (async () => {
      const cfg = await loadConfig();
      const tasks = await fetchOpenBugs(cfg);
      const projectUuid = Array.isArray(cfg.default_project_uuid)
        ? cfg.default_project_uuid[0]
        : cfg.default_project_uuid;
      const rows = tasks
        .filter((task) => !(task.status?.name && SKIP_STATUS_NAMES.has(task.status.name)))
        .filter((task) => !(task.sprint?.name && EXCLUDED_SPRINT_NAMES.has(task.sprint.name)))
        .map((task) => mapRow(cfg, projectUuid, task));
      cache = { rows, ts: Date.now() };
      return rows;
    })().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

export default defineEventHandler(async (event) => {
  try {
    const refresh = getQuery(event).refresh;
    if (refresh === "1" || refresh === "true") cache = null;
    const rows = await loadDefects();
    setHeader(event, "Cache-Control", "no-store");
    return { ok: true, rows, ts: cache?.ts ?? Date.now() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[ones-defects] 拉取失败:", message);
    // 返回 200 + ok:false：生产模式 Nitro 会把 5xx 的 message 剥离成 statusMessage
    // "Server Error"，前端只能看到笼统错误；200 响应体不会被剥离。
    setHeader(event, "Cache-Control", "no-store");
    return { ok: false, error: message, ts: Date.now() };
  }
});
