import { getRemindTask, normalizeTaskInput, saveRemindTask, type DefectRemindTaskInput } from "~/utils/defect-remind-store";
import { parseWebhookUrl } from "~/utils/defect-remind";
import { ensureDbToken } from "~/utils/remind-task-auth";

export default defineEventHandler(async (event) => {
  ensureDbToken(event);
  try {
    const id = getRouterParam(event, "id");
    if (!id) return { ok: false, error: "缺少任务 ID" };
    const existing = await getRemindTask(id);
    if (!existing) return { ok: false, error: "任务不存在" };
    const body = await readBody<DefectRemindTaskInput>(event);
    if (!body || typeof body !== "object") {
      return { ok: false, error: "缺少任务参数" };
    }
    const webhook = body.webhook === undefined ? existing.webhook : String(body.webhook);
    if (!webhook.trim()) return { ok: false, error: "请填写 webhook" };
    parseWebhookUrl(webhook);
    const task = await saveRemindTask(normalizeTaskInput(body, existing));
    return { ok: true, task };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
});
