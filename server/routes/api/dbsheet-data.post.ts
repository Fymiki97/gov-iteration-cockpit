import { activateAutoRefresh, setDbsheetCache } from "~/utils/dbsheet-cache";

export default defineEventHandler(async (event) => {
  const cookieHeader = getRequestHeader(event, "cookie") ?? "";
  const match = cookieHeader.match(/(?:^|;\s*)gateway_token=([^;]+)/);
  const body = await readBody(event);

  const token = body?.gateway_token || (match ? match[1] : null);
  if (!token) {
    throw createError({ statusCode: 400, message: "missing gateway_token" });
  }

  const config = useRuntimeConfig(event);
  const endpoint = (config.appBaseEndpoint as string) || "https://o.wpsgo.com/app/app-base";
  activateAutoRefresh(token, endpoint);

  if (body?.requirements || body?.milestones || body?.risks) {
    setDbsheetCache({
      requirements: body.requirements ?? null,
      milestones: body.milestones ?? null,
      risks: body.risks ?? null,
      ts: Date.now(),
    });
  }

  return { ok: true, message: "token 已保存，服务端自动刷新已启动" };
});
