/**
 * 调试端点：验证多维表任务存储（capa_session JWT → openapi.wps.cn）
 * 用法：GET /api/debug-dbsheet-write
 * 幂等：固定探针任务 ID，重复调用只更新不累积。
 */
export default defineEventHandler(async (event) => {
  const cookieHeader = getRequestHeader(event, "cookie") ?? "";
  const result: Record<string, unknown> = { ok: true, cookieLength: cookieHeader.length };

  try {
    const config = useRuntimeConfig();
    const appId = String(config.WPS_APP_ID ?? "");
    result.hasCapaSession = cookieHeader.includes(`capa_session_${appId}=`);

    const mod = await import("~/utils/remind-task-dbsheet");

    const { tasks, recordIds } = await mod.loadTasks(cookieHeader);
    result.load = {
      taskCount: tasks.length,
      recordIdCount: recordIds.size,
      firstTask: tasks[0] ?? null,
    };

    const probe = {
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
    const saveOk = await mod.saveTasks(cookieHeader, [...tasks, probe], recordIds);
    result.save = { ok: saveOk, probeId: probe.id };
  } catch (err) {
    result.ok = false;
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
});
