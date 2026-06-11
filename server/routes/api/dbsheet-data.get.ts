import { getDbsheetCache, getAutoRefreshStatus, activateAutoRefresh } from "~/utils/dbsheet-cache";

export default defineEventHandler(async (event) => {
  // 从请求 Cookie 中提取 gateway_token，自动启动/更新服务端刷新
  const cookieHeader = getRequestHeader(event, "cookie") ?? "";
  const match = cookieHeader.match(/(?:^|;\s*)gateway_token=([^;]+)/);
  if (match) {
    const config = useRuntimeConfig(event);
    const endpoint = (config.appBaseEndpoint as string) || "https://o.wpsgo.com/app/app-base";
    activateAutoRefresh(match[1], endpoint);
  }

  const cache = getDbsheetCache();
  const status = getAutoRefreshStatus();

  if (!cache) {
    if (status.hasToken) {
      setResponseStatus(event, 202);
      return { status: "refreshing", message: "服务端正在拉取数据，请稍候..." };
    }
    throw createError({ statusCode: 404, message: "no_token" });
  }

  setResponseHeader(event, "X-Data-Age", String(Date.now() - cache.ts));
  setResponseHeader(event, "X-Auto-Refresh", status.isRunning ? "active" : "inactive");
  return cache;
});
