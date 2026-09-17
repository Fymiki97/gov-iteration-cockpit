import { normalizeTaskInput, saveRemindTask, type DefectRemindTaskInput } from "~/utils/defect-remind-store";
import { parseWebhookUrl } from "~/utils/defect-remind";
import { ensureDbToken } from "~/utils/remind-task-auth";

export default defineEventHandler(async (event) => {
  ensureDbToken(event);
  try {
    const body = await readBody<DefectRemindTaskInput>(event);
    if (!body || typeof body !== "object") {
      return { ok: false, error: "缺少任务参数" };
    }
    if (!String(body.webhook ?? "").trim()) {
      return { ok: false, error: "请填写 webhook" };
    }
    parseWebhookUrl(String(body.webhook));
    const task = await saveRemindTask(normalizeTaskInput(body));
    return { ok: true, task };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
});
