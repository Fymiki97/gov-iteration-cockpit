import { backfillRemindTasks } from "~/utils/defect-remind-store";
import { ensureDbToken } from "~/utils/remind-task-auth";

/** 单次回填上限，防止异常客户端一次提交过量任务 */
const MAX_BACKFILL = 200;

/**
 * 增量回填提醒任务到多维表。
 * 语义：按任务 id 补写「多维表尚未收录」的任务；已存在的 id 不覆盖，仅补空 webhook。
 * 与 POST /api/defect-remind-tasks 的区别：后者总是新建任务并重新分配 id，
 * 会把本地已有任务变成重复记录，因此回填必须走本端点以保留原 id。
 */
export default defineEventHandler(async (event) => {
  ensureDbToken(event);
  try {
    const body = await readBody<{ tasks?: unknown[] }>(event);
    const tasks = Array.isArray(body?.tasks) ? body.tasks.slice(0, MAX_BACKFILL) : [];
    if (tasks.length === 0) {
      return { ok: true, added: 0, patched: 0, skipped: 0 };
    }
    const result = await backfillRemindTasks(tasks);
    return { ok: true, ...result, persisted: result.persist.persisted, persistError: result.persist.error };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
});
