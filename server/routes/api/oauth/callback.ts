import crypto from "node:crypto";
import { defineEventHandler, getRequestURL, getHeader } from "h3";
import { apiPost } from "~/utils/remind-task-dbsheet";

/**
 * 覆盖 @ks-open/capability 的默认 OAuth 回调。
 *
 * 默认实现把 session cookie 写成 host-only（o.wpsgo.com），而应用页面实际
 * 运行在 comate.wpsgo.com，跨子域读不到 cookie，导致 /api/oauth/status 永远
 * 返回未授权、前端无限重新发起授权（"一直处于请求授权状态"）。
 *
 * 这里复刻默认实现的换 token 与 JWT 格式（HS256, payload.act），差异仅在
 * 线上把 cookie 域提升到父域 .wpsgo.com，使两个子域共享同一会话。
 * cookie 名必须保持 getCapaSessionCookieName(appId) 的约定：capa_session_<appId>。
 */

const PARENT_DOMAIN = ".wpsgo.com";

function b64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signSessionJwt(accessToken: string, expiresAt: number, secret: string): string {
  const header = b64urlJson({ alg: "HS256" });
  const payload = b64urlJson({ act: accessToken, iat: Math.floor(Date.now() / 1000), exp: expiresAt });
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

/**
 * 诊断用：token 响应写入多维表「OAuth诊断」表。
 *
 * 平台不提供已部署服务端的日志查询（wpsgo 无 logs 命令），而 OAuth 授权页只有用户
 * 浏览器能触发、Agent 无登录态，所以换 token 的响应在服务端“看得见但取不出”。
 * 这里用刚换到的 access_token 把响应的结构落进多维表，再由 kdocs-comate-cli
 * 以用户身份读回，用于确认平台是否下发 refresh_token、有效期多久、刷新时是否轮换。
 * 只记录字段名、长度与前缀，不落 token 明文。
 */
const DIAG_SHEET_ID = 13;

/**
 * 用刚拿到的 refresh_token 立刻换一次 access_token，判断平台是否轮换 refresh_token。
 * 这决定「服务端长期无人值守」是否可行：若每次刷新都换新 token，服务端必须持久化
 * 新值，而我们没有可用的服务端存储；若不轮换，一个 token 存一年即可。
 * 返回值只含结论，响应体可能带明文 token，因此绝不落库。
 */
async function refreshOnce(
  appId: string,
  appSecret: string,
  refreshToken: string,
): Promise<{ ok: boolean; brief: string; next: string }> {
  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: appId,
      client_secret: appSecret,
      refresh_token: refreshToken,
    });
    const res = await fetch("http://openapi.wps.cn/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const text = await res.text();
    if (!res.ok) {
      let brief = text.slice(0, 160);
      try {
        const j = JSON.parse(text) as { code?: unknown; msg?: unknown; message?: unknown };
        brief = `code=${String(j.code ?? "")} msg=${String(j.msg ?? j.message ?? "")}`;
      } catch {
        // 非 JSON 响应：保留截断文本
      }
      return { ok: false, brief: `HTTP ${res.status} ${brief}`, next: "" };
    }
    const j = JSON.parse(text) as Record<string, unknown>;
    return {
      ok: true,
      brief: `成功，字段=${Object.keys(j).sort().join(",")}`,
      next: typeof j.refresh_token === "string" ? j.refresh_token : "",
    };
  } catch (err) {
    return { ok: false, brief: `异常 ${err instanceof Error ? err.message : String(err)}`, next: "" };
  }
}

async function probeRefreshRotation(
  appId: string,
  appSecret: string,
  refreshToken: string,
): Promise<Record<string, string>> {
  if (!refreshToken) {
    return {
      刷新测试结果: "无 refresh_token，跳过",
      刷新后返回refresh_token: "",
      刷新后token是否变化: "",
      旧token复用结果: "",
    };
  }
  const first = await refreshOnce(appId, appSecret, refreshToken);
  if (!first.ok) {
    return { 刷新测试结果: `失败 ${first.brief}`, 刷新后返回refresh_token: "", 刷新后token是否变化: "", 旧token复用结果: "" };
  }
  // 关键分支：轮换后旧 token 是否仍然可用。
  // 若仍可用，服务端只存一份种子 token 就能长期无人值守；若已失效，
  // 则必须有服务端可写的持久化存储来承接每次轮换出的新 token。
  const reuse = await refreshOnce(appId, appSecret, refreshToken);
  return {
    刷新测试结果: first.brief,
    刷新后返回refresh_token: first.next ? "是" : "否",
    刷新后token是否变化: first.next ? (first.next === refreshToken ? "相同（不轮换）" : "不同（轮换）") : "未返回",
    旧token复用结果: reuse.ok ? "旧token仍可用" : `旧token已失效：${reuse.brief}`,
  };
}

async function recordTokenResponseDiagnostics(
  accessToken: string,
  data: Record<string, unknown>,
  appId: string,
  appSecret: string,
): Promise<void> {
  const refreshToken = typeof data.refresh_token === "string" ? data.refresh_token : "";
  const rotation = await probeRefreshRotation(appId, appSecret, refreshToken);
  const fields = {
    诊断时间: new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }).slice(0, 19),
    响应字段列表: Object.keys(data).sort().join(", "),
    有refresh_token: refreshToken ? "是" : "否",
    refresh_token长度: String(refreshToken.length),
    refresh_token前缀: refreshToken ? `${refreshToken.slice(0, 8)}...` : "",
    scope: String(data.scope ?? ""),
    expires_in: String(data.expires_in ?? ""),
    refresh_expires_in: String(data.refresh_expires_in ?? ""),
    token_type: String(data.token_type ?? ""),
    ...rotation,
  };
  await apiPost(accessToken, `/sheets/${DIAG_SHEET_ID}/records/create`, {
    records: [{ fields_value: JSON.stringify(fields) }],
  });
}

function isSafeReturnUrl(raw: string, requestOrigin: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return false;
    if (url.hostname.endsWith("wpsgo.com")) return true;
    // 开发环境：允许回到本机
    return url.hostname === new URL(requestOrigin).hostname;
  } catch {
    return false;
  }
}

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event);
  const code = url.searchParams.get("code");
  if (!code) {
    event.node.res.statusCode = 400;
    return "Missing code parameter (custom-callback-v2)";
  }

  const config = useRuntimeConfig();
  const appId = config.WPS_APP_ID as string | undefined;
  const appSecret = config.WPS_APP_SECRET as string | undefined;
  const sessionSecret = config.SESSION_SECRET as string | undefined;
  if (!appId || !appSecret || !sessionSecret) {
    console.error("[oauth-callback] Missing WPS_APP_ID, WPS_APP_SECRET, or SESSION_SECRET in env");
    event.node.res.statusCode = 500;
    return "Server misconfiguration";
  }

  const stateParam = url.searchParams.get("state");
  let redirectUri: string | undefined;
  let returnUrl: string | undefined;
  if (stateParam) {
    try {
      const decoded = Buffer.from(stateParam, "base64").toString("utf8");
      if (decoded.startsWith("{")) {
        const parsed = JSON.parse(decoded) as { redirect_uri?: string; return_url?: string };
        redirectUri = parsed.redirect_uri;
        returnUrl = parsed.return_url;
      } else {
        redirectUri = decoded;
      }
    } catch {
      // state 不可解析时与默认实现一致：按当前请求拼回调地址
      redirectUri = `${url.protocol}//${url.host}/api/oauth/callback`;
    }
  }

  let accessToken: string;
  let expiresIn: number;
  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: appId,
      client_secret: appSecret,
      code,
      redirect_uri: redirectUri ?? `${url.protocol}//${url.host}/api/oauth/callback`,
    });
    const tokenRes = await fetch("http://openapi.wps.cn/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error(`[oauth-callback] Token exchange failed: status=${tokenRes.status}, redirect_uri=${redirectUri}, response=${text.slice(0, 500)}`);
      event.node.res.statusCode = 502;
      return "OAuth token exchange failed";
    }
    const data = (await tokenRes.json()) as Record<string, unknown>;
    const tokenValue = typeof data.access_token === "string" ? data.access_token : "";
    const expiresValue = Number(data.expires_in);
    if (!tokenValue || !Number.isFinite(expiresValue) || expiresValue <= 0) {
      // 只打字段名，不打响应体（含 token 明文）
      console.error(`[oauth-callback] Invalid token response keys=${Object.keys(data).join(",")}`);
      event.node.res.statusCode = 502;
      return "Invalid token response from WPS";
    }
    accessToken = tokenValue;
    expiresIn = expiresValue;

    // 诊断失败不能影响授权本身
    try {
      await recordTokenResponseDiagnostics(tokenValue, data, appId, appSecret);
    } catch (err) {
      console.error("[oauth-callback] 诊断写入失败:", err instanceof Error ? err.message : String(err));
    }
  } catch (err) {
    console.error("[oauth-callback] Token exchange error:", err instanceof Error ? err.message : String(err));
    event.node.res.statusCode = 502;
    return "OAuth token exchange error";
  }

  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  const jwt = signSessionJwt(accessToken, expiresAt, sessionSecret);
  const cookieName = `capa_session_${appId}`;

  // 有 return_url：把 JWT 放 URL fragment 带回同域页面（fragment 不会发送到
  // 服务器，也不进 Referer）。前端负责调用 /api/oauth/claim 落成 cookie。
  // 直接写父域 cookie 的方案受中间层影响不可靠，不再依赖。
  if (returnUrl && isSafeReturnUrl(returnUrl, url.origin)) {
    const sep = returnUrl.includes("#") ? "&" : "#";
    event.node.res.statusCode = 302;
    event.node.res.setHeader("Location", `${returnUrl}${sep}cbt=${encodeURIComponent(jwt)}`);
    return null;
  }

  // 无 return_url（弹窗模式）：直接写 cookie 并通知 opener。
  // 线上写父域让两个子域共享；本地保持 host-only。
  const host = (getHeader(event, "x-forwarded-host") ?? url.host).split(":")[0] ?? "";
  const isWpsgoDomain = /(^|\.)wpsgo\.com$/.test(host);
  const domainPart = isWpsgoDomain ? `; Domain=${PARENT_DOMAIN}` : "";
  event.node.res.setHeader(
    "Set-Cookie",
    `${cookieName}=${jwt}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${expiresIn}${domainPart}`,
  );
  event.node.res.setHeader("Content-Type", "text/html; charset=utf-8");
  return `<!DOCTYPE html><html><body><script>
window.opener.postMessage("wps-oauth-success", "*");
window.close();
</script></body></html>`;
});
