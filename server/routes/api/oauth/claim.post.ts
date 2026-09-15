import crypto from "node:crypto";
import { defineEventHandler, readBody, getRequestURL } from "h3";

/**
 * OAuth 会话落地接口：callback 把 JWT 放在 URL fragment 带回同域页面后，
 * 前端调用本接口验签并写 host-only cookie（当前请求域=应用页面域）。
 * cookie 名与 @ks-open/capability 的 status/能力调用保持一致：
 * capa_session_<appId>，JWT 格式 HS256 + payload.act。
 */

function verifySessionJwt(token: string, secret: string): { act: string; exp: number } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      act?: unknown;
      exp?: unknown;
    };
    if (typeof decoded.act !== "string" || typeof decoded.exp !== "number") return null;
    return { act: decoded.act, exp: decoded.exp };
  } catch {
    return null;
  }
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const appId = config.WPS_APP_ID as string | undefined;
  const sessionSecret = config.SESSION_SECRET as string | undefined;
  if (!appId || !sessionSecret) {
    console.error("[oauth-claim] Missing WPS_APP_ID or SESSION_SECRET in env");
    event.node.res.statusCode = 500;
    return { ok: false, error: "Server misconfiguration" };
  }

  const body = await readBody<{ token?: string }>(event).catch(() => null);
  const token = body?.token;
  if (!token || typeof token !== "string") {
    event.node.res.statusCode = 400;
    return { ok: false, error: "Missing token" };
  }

  const decoded = verifySessionJwt(token, sessionSecret);
  if (!decoded || decoded.exp <= Math.floor(Date.now() / 1000)) {
    event.node.res.statusCode = 401;
    return { ok: false, error: "Invalid or expired token" };
  }

  const cookieName = `capa_session_${appId}`;
  // host-only cookie：写在当前请求域（即应用页面域），status 同域可直接读取。
  // Secure 对 https 生效；本地 localhost 的 Secure cookie 浏览器也接受。
  const isHttps = getRequestURL(event).protocol === "https:";
  const securePart = isHttps ? "; Secure" : "";
  event.node.res.setHeader(
    "Set-Cookie",
    `${cookieName}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${decoded.exp - Math.floor(Date.now() / 1000)}${securePart}`,
  );
  return { ok: true };
});
