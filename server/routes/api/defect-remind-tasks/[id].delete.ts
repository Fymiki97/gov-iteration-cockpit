import { removeRemindTask } from "~/utils/defect-remind-store";
import { ensureDbToken } from "~/utils/remind-task-auth";

export default defineEventHandler(async (event) => {
  ensureDbToken(event);
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "缺少任务 ID" });
  const removed = await removeRemindTask(id);
  if (!removed) throw createError({ statusCode: 404, message: "任务不存在" });
  return { ok: true };
});
