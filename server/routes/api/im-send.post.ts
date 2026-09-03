import { defineEventHandler, readBody, createError } from "h3";

// 应用通道消息发送：client_credentials 获取 app_access_token（不走用户 OAuth），
// 调 openapi.wps.cn /v7/messages/create 以应用身份向指定用户发送纯文本通知。
// 依赖开放平台后台为应用开通「查询和管理会话消息」应用授权权限（app:kso.chat_message.readwrite）。

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

interface UpstreamError {
  code?: number;
  message?: string;
  msg?: string;
}

function describeUpstreamError(status: number, body: UpstreamError): string {
  const detail = body.message || body.msg || "";
  const codePart = body.code ? `（错误码 ${body.code}）` : "";
  if (status === 403 && /invalid_scope|not been granted/i.test(detail)) {
    return `应用缺少消息发送权限：请在 WPS 开发者后台为应用勾选并申请「查询和管理会话消息」权限，审批通过后重试${codePart}`;
  }
  return `WPS API ${status}${codePart} ${detail}`.trim();
}

async function getAppAccessToken(): Promise<string> {
  const { WPS_APP_ID, WPS_APP_SECRET } = useRuntimeConfig();
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) return tokenCache.token;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: String(WPS_APP_ID || ""),
    client_secret: String(WPS_APP_SECRET || ""),
  });
  const res = await fetch("https://openapi.wps.cn/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; message?: string };
  if (!res.ok || !data.access_token) {
    throw createError({
      statusCode: 502,
      statusMessage: "App token fetch failed",
      data: { message: `获取应用凭证失败：WPS API ${res.status} ${data.message || ""}`.trim() },
    });
  }
  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 7199;
  tokenCache = { token: data.access_token, expiresAt: now + expiresIn * 1000 };
  return tokenCache.token;
}

export default defineEventHandler(async (event) => {
  const { userId, content } = (await readBody(event)) as { userId?: string; content?: string };
  const trimmedUser = String(userId || "").trim();
  const text = String(content || "");
  if (!trimmedUser || !text.trim()) {
    throw createError({ statusCode: 400, statusMessage: "Bad Request", data: { message: "userId 和 content 不能为空" } });
  }
  if (text.length > 5000) {
    throw createError({ statusCode: 400, statusMessage: "Bad Request", data: { message: "消息内容超过 5000 字上限" } });
  }

  const token = await getAppAccessToken();
  const res = await fetch("https://openapi.wps.cn/v7/messages/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      type: "text",
      content: { text: { type: "plain", content: text } },
      receiver: { receiver_id: trimmedUser, type: "user" },
      mentions: [],
    }),
  });
  const data = (await res.json().catch(() => ({}))) as UpstreamError;
  if (!res.ok) {
    throw createError({
      statusCode: res.status === 403 ? 403 : 502,
      statusMessage: "Message send failed",
      data: { message: describeUpstreamError(res.status, data) },
    });
  }
  if (data.code !== undefined && data.code !== 0) {
    throw createError({
      statusCode: 502,
      statusMessage: "Message send failed",
      data: { message: data.message || data.msg || `WPS 返回错误码 ${data.code}` },
    });
  }
  return { code: 0, msg: "ok" };
});
