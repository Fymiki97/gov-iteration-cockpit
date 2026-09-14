import { listRemindTasks } from "~/utils/defect-remind-store";

export default defineEventHandler(async () => {
  const tasks = await listRemindTasks();
  return { tasks };
});
