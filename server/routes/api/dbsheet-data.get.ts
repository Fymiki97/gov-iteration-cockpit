import {
  getDbsheetCache,
  getAutoRefreshStatus,
  activateAutoRefresh,
  waitForRefresh,
  triggerRefresh,
} from "~/utils/dbsheet-cache";

export default defineEventHandler(async (event) => {
  const cookieHeader = getRequestHeader(event, "cookie") ?? "";
  const match = cookieHeader.match(/(?:^|;\s*)gateway_token=([^;]+)/);
  if (match) {
    const config = useRuntimeConfig(event);
    const endpoint = (config.appBaseEndpoint as string) || "https://o.wpsgo.com/app/app-base";
    activateAutoRefresh(match[1], endpoint);
  }

  let data = getDbsheetCache();
  const status = getAutoRefreshStatus();

  // 没有缓存但有 token → 等待当前刷新完成（最多 20 秒）
  if (!data && status.hasToken) {
    triggerRefresh();
    await waitForRefresh(20_000);
    data = getDbsheetCache();
  }

  if (!data) {
    throw createError({
      statusCode: 404,
      message: status.hasToken ? "refresh_failed" : "no_token",
    });
  }

  setResponseHeader(event, "X-Data-Age", String(Date.now() - data.ts));
  setResponseHeader(event, "X-Auto-Refresh", status.isRunning ? "active" : "inactive");
  return data;
});
