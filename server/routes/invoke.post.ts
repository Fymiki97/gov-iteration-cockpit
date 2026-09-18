/**
 * FC Timer Trigger 入口：平台 cron 定时调用 POST /invoke。
 *
 * payload 里的任务配置由同步脚本写入 action_config 透传而来，
 * 服务端不读多维表、不需要任何用户凭据（无状态，免疫多副本）。
 *
 * 注意：本入口直接执行提醒业务逻辑（取 ONES → 匹配 → 发 webhook），
 * 不经过 capability executor——提醒链路的三个环节（ONES 静态 token、
 * payload 配置、静态 webhook URL）均无需用户会话，executor 的
 * OAuth 代理能力在此场景没有增益。
 */
import { runRemindCron, type RemindCronPayload } from "~/utils/remind-cron";

export default defineEventHandler(async (event) => {
  const controlPath = getHeader(event, "x-fc-control-path");
  if (controlPath !== "/invoke") {
    return { code: 403, msg: "not an FC invocation" };
  }

  const raw = await readBody(event);
  let triggerBody: { triggerTime?: string; triggerName?: string; payload?: string | RemindCronPayload };
  try {
    triggerBody = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return { code: 400, msg: "invalid trigger body" };
  }

  let payload: RemindCronPayload = {};
  try {
    payload = typeof triggerBody.payload === "string"
      ? JSON.parse(triggerBody.payload)
      : triggerBody.payload || {};
  } catch {
    payload = {};
  }

  const result = await runRemindCron(payload);
  console.info(
    `[remind-cron] trigger=${triggerBody.triggerName ?? "?"} time=${triggerBody.triggerTime ?? "?"} ` +
    `sent=${result.sent} skipped=${result.skipped} failed=${result.failed} | ${result.messages.join("；")}`,
  );
  return { code: 0, ...result };
});
