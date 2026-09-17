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
  collectAtUserIds,
  type DefectRemindItem,
} from "~/utils/defect-remind";
import { ensurePeopleMap } from "~/utils/dbsheet-cache";

interface RunBody {
  taskId?: string;
  scheduled?: boolean;
  defects?: DefectRemindItem[];
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<RunBody>(event);
    const taskId = String(body?.taskId ?? "").trim();
    if (!taskId) return { ok: false, sent: false, count: 0, preview: "", error: "缺少任务 ID" };
    const task = await getRemindTask(taskId);
    if (!task) return { ok: false, sent: false, count: 0, preview: "", error: "任务不存在" };
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
    const channel = detectWebhookChannel(task.webhook);
    const peopleMap = channel === "钉钉" || channel === "WPS" ? await ensurePeopleMap() : null;
    const preview = formatRemindMessage({ defects, task, peopleMap, channel });
    if (defects.length === 0) {
      await markRemindTaskRun({ id: task.id, status: "failed", message: "没有匹配的未修复缺陷" });
      return { ok: false, sent: false, channel, count: 0, preview: "", error: "没有匹配的未修复缺陷" };
    }

    await postWebhook({ webhook: task.webhook, title: task.name, text: preview, atUserIds: channel === "钉钉" ? collectAtUserIds(defects, peopleMap) : [] });
    await markRemindTaskRun({
      id: task.id,
      status: "success",
      message: `已发送 ${defects.length} 条至${channel}`,
    });
    return {
      ok: true,
      sent: true,
      channel,
      count: defects.length,
      preview,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "发送失败";
    // 统一返回 200 + ok:false，避免 Nitro 生产模式剥离错误信息
    return {
      ok: false,
      sent: false,
      count: 0,
      preview: "",
      error: message,
    };
  }
});
