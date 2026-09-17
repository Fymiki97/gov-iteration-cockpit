/**
 * 调试端点：测试多维表读写
 * GET /api/debug-dbsheet-write
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

    // 测试读取
    try {
      const mod = await import("~/utils/remind-task-dbsheet");
      const { tasks, recordIds } = await mod.loadTasks(token);
      result.read = { count: tasks.length, recordIdCount: recordIds.size };
    } catch (err) {
      result.read = { error: err instanceof Error ? err.message : String(err) };
    }

    // 测试写入
    try {
      const mod = await import("~/utils/remind-task-dbsheet");
      const testRow = {
        H1: "debug_" + Date.now(),
        H2: "调试任务-可删除",
        H3: "全部团队",
        H4: "每日",
        H7: true,
        H8: "[]",
        H9: "[]",
        H_: false,
        IA: false,
      };
      const ok = await mod.upsertRecord(token, testRow);
      result.write = { ok };
    } catch (err) {
      result.write = { error: err instanceof Error ? err.message : String(err) };
    }

    return result;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});
