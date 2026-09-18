/**
 * 调试端点：验证多维表任务存储（走 openapi.wps.cn + 网关 access_token）
 * 用法：GET /api/debug-dbsheet-write
 */
export default defineEventHandler(async (event) => {
  const cookieHeader = getRequestHeader(event, "cookie") ?? "";
  const match = cookieHeader.match(/(?:^|;\s*)gateway_token=([^;]+)/);
  const token = match?.[1] ?? null;

  if (!token) {
    return { ok: false, step: "cookie", error: "服务端未收到 gateway_token cookie" };
  }

  const result: Record<string, unknown> = { ok: true, tokenLength: token.length };

  try {
    const mod = await import("~/utils/remind-task-dbsheet");

    // 1. 读取（同时会解析表结构）
    const { tasks, recordIds } = await mod.loadTasks(token);
    result.load = {
      taskCount: tasks.length,
      recordIdCount: recordIds.size,
      firstTask: tasks[0] ?? null,
    };

    // 2. 写入测试：固定探针 ID，重复调用只更新不累积
    const debugTask = {
      id: "debug_probe",
      name: "调试任务-可删除",
      team: "全部团队",
      frequency: "daily",
      enabled: false,
      severities: ["S-致命"],
      iterations: [],
      template: "default",
      includeDetail: false,
      includeDeadline: false,
      lastRunAt: null,
      lastRunStatus: null,
      lastRunMessage: "",
    };
    const saveOk = await mod.saveTasks(token, [...tasks, debugTask], recordIds);
    result.save = { ok: saveOk, probeId: debugTask.id, taskCount: tasks.length };
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
});
