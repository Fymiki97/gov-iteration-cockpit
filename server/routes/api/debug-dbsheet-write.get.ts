/**
 * 调试端点：测试多维表写入
 * GET /api/debug-dbsheet-write
 * 返回 token 状态和写入测试结果
 */
import { upsertRecord, loadTasks } from "~/utils/remind-task-dbsheet";

export default defineEventHandler(async (event) => {
  const cookieHeader = getRequestHeader(event, "cookie") ?? "";
  const match = cookieHeader.match(/(?:^|;\s*)gateway_token=([^;]+)/);
  const token = match?.[1] ?? null;

  if (!token) {
    return { ok: false, error: "no gateway_token in cookie", cookiePreview: cookieHeader.slice(0, 100) };
  }

  // 1. 测试读取
  let readResult: unknown = null;
  try {
    const { tasks, recordIds } = await loadTasks(token);
    readResult = { count: tasks.length, recordIdCount: recordIds.size, sample: tasks[0] ?? null };
  } catch (err) {
    readResult = { error: err instanceof Error ? err.message : String(err) };
  }

  // 2. 测试写入一条
  const testRow = {
    H1: `debug_${Date.now()}`,
    H2: "调试任务",
    H3: "全部团队",
    H4: "每日",
    H7: true,
    H8: "[]",
    H9: "[]",
    H_: false,
    IA: false,
  };

  let writeResult: unknown = null;
  try {
    const ok = await upsertRecord(token, testRow);
    writeResult = { ok };
  } catch (err) {
    writeResult = { error: err instanceof Error ? err.message : String(err) };
  }

  return { ok: true, tokenLength: token.length, read: readResult, write: writeResult };
});
