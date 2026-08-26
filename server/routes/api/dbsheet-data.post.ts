import { setDbsheetCache } from "~/utils/dbsheet-cache";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  if (!body || (!body.requirements && !body.milestones && !body.risks)) {
    throw createError({ statusCode: 400, message: "empty payload" });
  }

  setDbsheetCache({
    requirements: body.requirements ?? null,
    milestones: body.milestones ?? null,
    risks: body.risks ?? null,
    ts: Date.now(),
  });

  return { ok: true };
});
