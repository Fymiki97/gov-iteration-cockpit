import { normalizeTaskInput, saveRemindTask, type DefectRemindTaskInput } from "~/utils/defect-remind-store";
import { parseWebhookUrl } from "~/utils/defect-remind";
import { ensureDbToken } from "~/utils/remind-task-auth";

export default defineEventHandler(async (event) => {
  ensureDbToken(event);
  const body = await readBody<DefectRemindTaskInput>(event);
  if (!body || typeof body !== "object") {
    throw createError({ statusCode: 400, message: "缺少任务参数" });
  }
  if (!String(body.webhook ?? "").trim()) {
    throw createError({ statusCode: 400, message: "请填写 webhook" });
  }
  parseWebhookUrl(String(body.webhook));
  const task = await saveRemindTask(normalizeTaskInput(body));
  return { task };
});
