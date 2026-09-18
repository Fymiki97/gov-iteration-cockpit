import { getStoreStatus, listRemindTasks } from "~/utils/defect-remind-store";
import { ensureDbToken } from "~/utils/remind-task-auth";

export default defineEventHandler(async (event) => {
  ensureDbToken(event);
  const tasks = await listRemindTasks();
  const status = getStoreStatus();
  // source=local 表示当前返回的是容器本地降级数据，未读到多维表
  return { tasks, source: status.lastReadSource, persistError: status.lastPersistError };
});
