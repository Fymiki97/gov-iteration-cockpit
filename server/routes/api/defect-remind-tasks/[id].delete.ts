import { removeRemindTask } from "~/utils/defect-remind-store";
import { ensureDbToken } from "~/utils/remind-task-auth";

export default defineEventHandler(async (event) => {
  ensureDbToken(event);
  try {
    const id = getRouterParam(event, "id");
    if (!id) return { ok: false, error: "缺少任务 ID" };
    const removed = await removeRemindTask(id);
    if (!removed) return { ok: false, error: "任务不存在" };
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
});
