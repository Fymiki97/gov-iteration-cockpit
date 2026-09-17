import { getRemindTask, normalizeTaskInput, saveRemindTask, type DefectRemindTaskInput } from "~/utils/defect-remind-store";
import { parseWebhookUrl } from "~/utils/defect-remind";
import { ensureDbToken } from "~/utils/remind-task-auth";

export default defineEventHandler(async (event) => {
  ensureDbToken(event);
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "缺少任务 ID" });
  const existing = await getRemindTask(id);
  if (!existing) throw createError({ statusCode: 404, message: "任务不存在" });
  const body = await readBody<DefectRemindTaskInput>(event);
  if (!body || typeof body !== "object") {
    throw createError({ statusCode: 400, message: "缺少任务参数" });
  }
  const webhook = body.webhook === undefined ? existing.webhook : String(body.webhook);
  if (!webhook.trim()) throw createError({ statusCode: 400, message: "请填写 webhook" });
  parseWebhookUrl(webhook);
  const task = await saveRemindTask(normalizeTaskInput(body, existing));
  return { task };
});
