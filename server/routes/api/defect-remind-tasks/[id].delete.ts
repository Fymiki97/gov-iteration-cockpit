import { removeRemindTask } from "~/utils/defect-remind-store";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "缺少任务 ID" });
  const removed = await removeRemindTask(id);
  if (!removed) throw createError({ statusCode: 404, message: "任务不存在" });
  return { ok: true };
});
