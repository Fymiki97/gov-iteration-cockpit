import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

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

// 仅排除草稿（非正式缺陷）；其余状态都返回给前端，
// 关闭/不必修复映射为「已关闭」，保证缺陷总数包含已完成缺陷
const CLOSED_STATUS_NAMES = new Set(["草稿"]);

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
  if (name === "处理中" || name === "修复中" || name === "待回归") return "处理中";
  if (name === "回归通过" || name === "已修复") return "已修复";
  if (name === "关闭" || name === "不必修复") return "已关闭";
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

async function loadConfig(): Promise<OnesConfig> {
  const raw = await readFile(join(homedir(), ".ones-config.json"), "utf-8");
  const cfg = JSON.parse(raw) as OnesConfig;
  if (!cfg.auth_token || !cfg.team_uuid) {
    throw createError({ statusCode: 500, message: "ONES 配置不完整（~/.ones-config.json 缺少 auth_token / team_uuid）" });
  }
  return cfg;
}

async function fetchOpenBugs(cfg: OnesConfig): Promise<OnesTask[]> {
  const projects = Array.isArray(cfg.default_project_uuid)
    ? cfg.default_project_uuid
    : [cfg.default_project_uuid];
  const project = projects[0];
  const url = `${cfg.base_url.replace(/\/+$/, "")}/project/api/project/team/${cfg.team_uuid}/items/graphql?t=Task`;
  const query = `{
    tasks(filter:{project_in:["${project}"],issueType_in:["${cfg.bug_issue_type_uuid ?? "Tk5ypVS8"}"]},orderBy:{createTime:DESC},limit:2000){
      uuid number name status{name} sprint{name} priority{value} severity:_6Uk19k7i{value} module:_SH5ADjuQ owner{name} createTime deadline
    }
  }`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Ones-User-Id": cfg.user_id,
      "Ones-Auth-Token": cfg.auth_token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

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
        .filter((task) => !(task.status?.name && CLOSED_STATUS_NAMES.has(task.status.name)))
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
    const rows = await loadDefects();
    setHeader(event, "Cache-Control", "no-store");
    return { ok: true, rows, ts: cache?.ts ?? Date.now() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[ones-defects] 拉取失败:", message);
    throw createError({ statusCode: 502, message });
  }
});
