import { listRemindTasks } from "~/utils/defect-remind-store";
import { ensureDbToken } from "~/utils/remind-task-auth";

export default defineEventHandler(async (event) => {
  ensureDbToken(event);
  const tasks = await listRemindTasks();
  return { tasks };
});
