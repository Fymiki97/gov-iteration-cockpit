const FILE_ID = "Dm5Wx1ph11MNih2SbwZurxjFLUZTboQEF";
/** 人员映射表：姓名 → 用户ID（钉钉真 @ 用） */
const PEOPLE_SHEET_ID = 28;
const REFRESH_INTERVAL_MS = 60_000;
const MAX_RETRIES = 5;

export interface CachedPayload {
  requirements: unknown;
  milestones: unknown;
  risks: unknown;
  ts: number;
}

let cache: CachedPayload | null = null;
/** 姓名→userid 映射独立存储：前端 POST 会覆盖主缓存，不能放进去 */
let peopleCache: Record<string, string> | null = null;
let savedGatewayToken: string | null = null;
let appBaseEndpoint = "https://o.wpsgo.com/app/app-base";
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let activeRefreshPromise: Promise<void> | null = null;

export function getDbsheetCache(): CachedPayload | null {
  return cache;
}

/** 姓名→userid 映射；无数据时返回 null（调用方降级为纯文本 @姓名） */
export function getPeopleMap(): Record<string, string> | null {
  return peopleCache;
}

/**
 * 确保人员映射可用：缓存为空时拉一次 sheet 28（用于服务端冷启动直接发催办的场景）。
 * 失败返回 null（降级为纯文本 @姓名）。
 */
export async function ensurePeopleMap(): Promise<Record<string, string> | null> {
  if (peopleCache && Object.keys(peopleCache).length > 0) return peopleCache;
  if (!savedGatewayToken) return null;
  const res = await fetchSheet(savedGatewayToken, PEOPLE_SHEET_ID, { prefer_id: false, max_records: 500 });
  if (!res) return null;
  const map: Record<string, string> = {};
  for (const rec of extractRecords(res)) {
    const name = typeof rec["姓名"] === "string" ? rec["姓名"].trim() : "";
    const userId = typeof rec["用户ID"] === "string" ? rec["用户ID"].trim() : String(rec["用户ID"] ?? "").trim();
    if (name && userId) map[name] = userId;
  }
  if (Object.keys(map).length > 0) {
    peopleCache = map;
    console.info(`[people-map] 懒加载 ${Object.keys(map).length} 条`);
    return map;
  }
  return null;
}

export function setPeopleMap(map: Record<string, string> | null): void {
  peopleCache = map;
}

export function setDbsheetCache(data: CachedPayload): void {
  cache = data;
}

export function getAutoRefreshStatus() {
  return {
    hasToken: !!savedGatewayToken,
    hasCache: !!cache,
    cacheAge: cache ? Date.now() - cache.ts : null,
    isRunning: !!refreshTimer,
  };
}

/**
 * 等待当前正在进行的刷新完成（带超时）。
 * 用于 GET 请求首次访问时同步等待数据就绪。
 */
export async function waitForRefresh(timeoutMs = 20_000): Promise<boolean> {
  if (!activeRefreshPromise) return false;
  await Promise.race([
    activeRefreshPromise,
    new Promise(r => setTimeout(r, timeoutMs)),
  ]);
  return !!cache;
}

export function activateAutoRefresh(gatewayToken: string, endpoint?: string): void {
  savedGatewayToken = gatewayToken;
  if (endpoint) appBaseEndpoint = endpoint;

  if (!refreshTimer) {
    refreshTimer = setInterval(() => {
      if (savedGatewayToken) doRefresh(savedGatewayToken);
    }, REFRESH_INTERVAL_MS);
    console.info("[auto-refresh] 已启动，每 1 分钟自动刷新");
    doRefresh(savedGatewayToken);
  } else {
    console.info("[auto-refresh] token 已更新");
  }
}

/** 触发一次刷新（如果没有正在进行的刷新） */
export function triggerRefresh(): void {
  if (savedGatewayToken && !activeRefreshPromise) {
    doRefresh(savedGatewayToken);
  }
}

function doRefresh(token: string): void {
  if (activeRefreshPromise) return;
  activeRefreshPromise = refreshData(token).finally(() => {
    activeRefreshPromise = null;
  });
}

async function fetchSheet(
  gatewayToken: string,
  sheetId: number,
  body: Record<string, unknown>,
): Promise<unknown | null> {
  const url = `${appBaseEndpoint}/base-proxy/v7/coop/dbsheet/${FILE_ID}/sheets/${sheetId}/records`;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: `gateway_token=${gatewayToken}` },
        body: JSON.stringify(body),
      });

      if (res.ok) return await res.json();

      const text = await res.text().catch(() => "");
      if (res.status === 403 && attempt < MAX_RETRIES - 1) {
        const delay = 1000 * (attempt + 1);
        console.warn(`[auto-refresh] sheet ${sheetId} 403, 重试 ${attempt + 1}/${MAX_RETRIES} (${delay}ms)`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      console.warn(`[auto-refresh] sheet ${sheetId}: HTTP ${res.status}`, text.slice(0, 200));
      return null;
    } catch (err) {
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      console.warn(`[auto-refresh] sheet ${sheetId} 网络错误:`, err instanceof Error ? err.message : err);
      return null;
    }
  }
  return null;
}

async function refreshData(gatewayToken: string): Promise<void> {
  console.info("[auto-refresh] 开始刷新...");

  const [reqRes, milRes, riskRes, peopleRes] = await Promise.all([
    fetchSheet(gatewayToken, 21, { prefer_id: false, max_records: 2000, page_size: 1000 }),
    fetchSheet(gatewayToken, 23, { prefer_id: false, max_records: 200 }),
    fetchSheet(gatewayToken, 24, { prefer_id: false, max_records: 50 }),
    fetchSheet(gatewayToken, PEOPLE_SHEET_ID, { prefer_id: false, max_records: 500 }),
  ]);

  if (reqRes || milRes || riskRes) {
    cache = { requirements: reqRes, milestones: milRes, risks: riskRes, ts: Date.now() };
    console.info(`[auto-refresh] ✅ 刷新成功 (req: ${!!reqRes}, mil: ${!!milRes}, risk: ${!!riskRes})`);
  } else {
    console.warn("[auto-refresh] ⚠️ 全部失败，保留旧缓存");
  }

  if (peopleRes) {
    const map: Record<string, string> = {};
    for (const rec of extractRecords(peopleRes)) {
      const name = typeof rec["姓名"] === "string" ? rec["姓名"].trim() : "";
      const userId = typeof rec["用户ID"] === "string" ? rec["用户ID"].trim() : String(rec["用户ID"] ?? "").trim();
      if (name && userId) map[name] = userId;
    }
    peopleCache = map;
    console.info(`[auto-refresh] 人员映射 ${Object.keys(map).length} 条`);
  }
}

function extractRecords(payload: unknown): Record<string, unknown>[] {
  const records = (payload as { data?: { records?: unknown } })?.data?.records;
  return Array.isArray(records) ? (records as Record<string, unknown>[]) : [];
}
