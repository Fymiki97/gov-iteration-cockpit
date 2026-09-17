/**
 * 纯净调试端点：只做 cookie 诊断 + 直接 fetch 多维表 API
 * 不依赖任何内部 utils，避免模块初始化崩溃
 */
export default defineEventHandler(async (event) => {
  try {
    const cookieHeader = getRequestHeader(event, "cookie") ?? "";
    const match = cookieHeader.match(/(?:^|;\s*)gateway_token=([^;]+)/);
    const token = match?.[1] ?? null;

    if (!token) {
      return {
        ok: false,
        step: "cookie",
        error: "服务端未收到 gateway_token cookie",
        cookieLength: cookieHeader.length,
        cookiePreview: cookieHeader.slice(0, 200),
      };
    }

    const result: Record<string, unknown> = { ok: true, tokenLength: token.length };

    // 1. 测试读取（POST /records）
    const fileId = "tmcQvuKxFrMJAHExDfFFrxC3PB5vCD4E7";
    const sheetId = 12;
    const config = useRuntimeConfig();
    const endpoint = (config.appBaseEndpoint as string) || "https://o.wpsgo.com/app/app-base";
    const url = `${endpoint}/base-proxy/v7/coop/dbsheet/${fileId}/sheets/${sheetId}/records`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: `gateway_token=${token}` },
        body: JSON.stringify({ prefer_id: false, max_records: 10 }),
      });
      const body = await res.text();
      result.read = { status: res.status, bodyPreview: body.slice(0, 300) };
    } catch (err) {
      result.read = { error: err instanceof Error ? err.message : String(err) };
    }

    // 2. 测试写入（POST /records）
    try {
      const writeBody = JSON.stringify({ records: [{ H1: "debug_" + Date.now(), H2: "调试-可删除", H3: "全部团队", H4: "每日", H7: true, H8: "[]", H9: "[]", H_: false, IA: false }] });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: `gateway_token=${token}` },
        body: writeBody,
      });
      const body = await res.text();
      result.write = { status: res.status, bodyPreview: body.slice(0, 300) };
    } catch (err) {
      result.write = { error: err instanceof Error ? err.message : String(err) };
    }

    return result;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});
