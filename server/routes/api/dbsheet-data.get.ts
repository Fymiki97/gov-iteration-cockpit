const FILE_ID = "Dm5Wx1ph11MNih2SbwZurxjFLUZTboQEF";
const WPS_OPENAPI_BASE = "http://openapi.wps.cn";
const CACHE_TTL_MS = 3 * 60_000; // 3 分钟缓存

interface SheetResult {
  code?: number;
  data?: { records: unknown[] };
}

let cachedData: { payload: unknown; ts: number } | null = null;
let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAppToken(appId: string, appSecret: string): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: appId,
    client_secret: appSecret,
  });

  const res = await fetch(`${WPS_OPENAPI_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[dbsheet-data] client_credentials token failed:", res.status, text.slice(0, 500));
    throw new Error(`Token exchange failed: ${res.status}`);
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("No access_token in token response");

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
  console.info("[dbsheet-data] App token obtained, expires_in:", data.expires_in);
  return tokenCache.token;
}

async function fetchSheet(
  token: string,
  sheetId: number,
  body: Record<string, unknown>,
): Promise<SheetResult | null> {
  const url = `${WPS_OPENAPI_BASE}/v7/coop/dbsheet/${FILE_ID}/sheets/${sheetId}/records`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[dbsheet-data] sheet ${sheetId} failed: ${res.status}`, text.slice(0, 300));
    return null;
  }
  return (await res.json()) as SheetResult;
}

export default defineEventHandler(async (event) => {
  if (cachedData && Date.now() - cachedData.ts < CACHE_TTL_MS) {
    setResponseHeader(event, "X-Cache", "HIT");
    return cachedData.payload;
  }

  const config = useRuntimeConfig(event);
  const appId = config.WPS_APP_ID as string;
  const appSecret = config.WPS_APP_SECRET as string;

  if (!appId || !appSecret) {
    throw createError({ statusCode: 503, message: "WPS credentials not configured" });
  }

  let token: string;
  try {
    token = await getAppToken(appId, appSecret);
  } catch (err) {
    console.error("[dbsheet-data] Failed to get app token:", err);
    throw createError({ statusCode: 502, message: "Failed to obtain WPS app token" });
  }

  const [reqRes, milRes, riskRes] = await Promise.all([
    fetchSheet(token, 21, { prefer_id: false, max_records: 2000, page_size: 1000 }),
    fetchSheet(token, 23, { prefer_id: false, max_records: 200 }),
    fetchSheet(token, 24, { prefer_id: false, max_records: 50 }),
  ]);

  if (!reqRes && !milRes && !riskRes) {
    tokenCache = null;
    throw createError({ statusCode: 502, message: "All WPS API calls failed" });
  }

  const payload = {
    requirements: reqRes,
    milestones: milRes,
    risks: riskRes,
    ts: Date.now(),
  };

  cachedData = { payload, ts: Date.now() };
  setResponseHeader(event, "X-Cache", "MISS");
  return payload;
});
