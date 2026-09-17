import {
  fetchOpenBugs,
  firstProjectUuid,
  loadOnesConfig,
  mapTasksToRows,
  readOnesSnapshot,
  rowsFromSnapshot,
  writeOnesSnapshot,
  type ApiDefectRow,
} from "~/utils/ones-defects";

const CACHE_TTL_MS = 60_000;
let cache: { rows: ApiDefectRow[]; ts: number; source: "live" | "snapshot" } | null = null;
let inFlight: Promise<{ rows: ApiDefectRow[]; source: "live" | "snapshot" }> | null = null;

async function loadFromSnapshot(): Promise<{ rows: ApiDefectRow[]; source: "snapshot" } | null> {
  const snapshot = await readOnesSnapshot();
  if (!snapshot) return null;
  return { rows: rowsFromSnapshot(snapshot), source: "snapshot" };
}

async function loadDefects(): Promise<{ rows: ApiDefectRow[]; source: "live" | "snapshot" }> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache;
  if (!inFlight) {
    inFlight = (async () => {
      try {
        const cfg = await loadOnesConfig();
        const tasks = await fetchOpenBugs(cfg);
        const projectUuid = firstProjectUuid(cfg);
        const rows = mapTasksToRows(cfg, projectUuid, tasks);
        await writeOnesSnapshot({
          ts: Date.now(),
          baseUrl: cfg.base_url,
          teamUuid: cfg.team_uuid,
          projectUuid,
          tasks,
        });
        cache = { rows, ts: Date.now(), source: "live" };
        return cache;
      } catch (err) {
        const fallback = await loadFromSnapshot();
        if (fallback) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn("[ones-defects] 实时拉取失败，改用快照:", message);
          cache = { rows: fallback.rows, ts: Date.now(), source: "snapshot" };
          return cache;
        }
        throw err;
      }
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
    const result = await loadDefects();
    setHeader(event, "Cache-Control", "no-store");
    return { ok: true, rows: result.rows, source: result.source, ts: cache?.ts ?? Date.now() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[ones-defects] 拉取失败:", message);
    setHeader(event, "Cache-Control", "no-store");
    return { ok: false, error: message, ts: Date.now() };
  }
});
