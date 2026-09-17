/**
 * 在能访问 ones.dig.kso.net 的环境（公司网/VPN）刷新缺陷快照。
 * 云端容器解析不了该内网域名，上线后靠这份快照提供缺陷列表。
 */
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "..", "data", "ones-defects-snapshot.json");

function loadCfg() {
  const homeCfg = join(homedir(), ".ones-config.json");
  if (existsSync(homeCfg)) return JSON.parse(readFileSync(homeCfg, "utf-8"));
  throw new Error("missing ~/.ones-config.json");
}

async function main() {
  const cfg = loadCfg();
  const project = Array.isArray(cfg.default_project_uuid) ? cfg.default_project_uuid[0] : cfg.default_project_uuid;
  const bugType = cfg.bug_issue_type_uuid ?? "Tk5ypVS8";
  const path = `/project/api/project/team/${cfg.team_uuid}/items/graphql`;
  const cacheBase = "https://ones-cache.wps.cn/oc/producer/ones";
  const urls = [
    `${cacheBase}${path}`,
    `${String(cfg.base_url).replace(/\/+$/, "")}${path}`,
  ];
  const query = `{
    tasks(filter:{project_in:["${project}"],issueType_in:["${bugType}"],statusCategory_in:["to_do","in_progress"]},orderBy:{createTime:DESC},limit:500){
      uuid number name status{name} sprint{name} priority{value} severity:_6Uk19k7i{value} module:_SH5ADjuQ owner{name} createTime deadline
    }
  }`;

  let tasks = [];
  let lastError = "no candidate";
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Ones-User-Id": cfg.user_id,
          "Ones-Auth-Token": cfg.auth_token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(20_000),
        redirect: "manual",
      });
      if (!res.ok) throw new Error(`ONES HTTP ${res.status}`);
      const data = await res.json();
      if (data.code && data.code !== 200) throw new Error(data.desc ?? "GraphQL error");
      tasks = data.data?.tasks ?? [];
      lastError = "";
      break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  if (lastError) throw new Error(lastError);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify({
    ts: Date.now(),
    baseUrl: cfg.base_url,
    teamUuid: cfg.team_uuid,
    projectUuid: project,
    tasks,
  })}\n`);
  console.log(`[refresh-ones-snapshot] wrote ${tasks.length} tasks -> ${outPath}`);
}

main().catch((err) => {
  console.warn(`[refresh-ones-snapshot] skip: ${err instanceof Error ? err.message : err}`);
  process.exitCode = 0;
});
