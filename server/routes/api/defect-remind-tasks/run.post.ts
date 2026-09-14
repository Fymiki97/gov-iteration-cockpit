import {
  getRemindTask,
  markRemindTaskRun,
} from "~/utils/defect-remind-store";
import {
  detectWebhookChannel,
  formatRemindMessage,
  isTaskDue,
  matchTaskDefects,
  postWebhook,
  type DefectRemindItem,
} from "~/utils/defect-remind";

interface RunBody {
  taskId?: string;
  scheduled?: boolean;
  defects?: DefectRemindItem[];
}

export default defineEventHandler(async (event) => {
  const body = await readBody<RunBody>(event);
  const taskId = String(body?.taskId ?? "").trim();
  if (!taskId) throw createError({ statusCode: 400, message: "缺少任务 ID" });
  const task = await getRemindTask(taskId);
  if (!task) throw createError({ statusCode: 404, message: "任务不存在" });
  if (body?.scheduled && !isTaskDue(task)) {
    return {
      ok: true,
      sent: false,
      skipped: true,
      channel: detectWebhookChannel(task.webhook),
      count: 0,
      preview: "",
    };
  }

  const defects = matchTaskDefects({
    defects: Array.isArray(body?.defects) ? body.defects : [],
    team: task.team,
    severities: task.severities,
  });
  const preview = formatRemindMessage({ defects, task });
  if (defects.length === 0) {
    await markRemindTaskRun({ id: task.id, status: "failed", message: "没有匹配的未修复缺陷" });
    throw createError({ statusCode: 400, message: "没有匹配的未修复缺陷" });
  }

  try {
    await postWebhook({ webhook: task.webhook, title: task.name, text: preview });
    await markRemindTaskRun({
      id: task.id,
      status: "success",
      message: `已发送 ${defects.length} 条至${detectWebhookChannel(task.webhook)}`,
    });
    return {
      ok: true,
      sent: true,
      channel: detectWebhookChannel(task.webhook),
      count: defects.length,
      preview,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook 发送失败";
    await markRemindTaskRun({ id: task.id, status: "failed", message });
    throw createError({ statusCode: 502, message });
  }
});
