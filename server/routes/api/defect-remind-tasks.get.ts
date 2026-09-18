import { getLastPersistError, listRemindTasks } from "~/utils/defect-remind-store";
import { ensureDbToken } from "~/utils/remind-task-auth";

export default defineEventHandler(async (event) => {
  ensureDbToken(event);
  try {
    const tasks = await listRemindTasks();
    // 任务配置的唯一来源是多维表：读不到就明确报错，不退回到任何本地缓存，
    // 否则「表里其实有、界面显示空」会被误判成任务被删除。
    return { ok: true, tasks, persistError: getLastPersistError() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, tasks: [], error: message };
  }
});
