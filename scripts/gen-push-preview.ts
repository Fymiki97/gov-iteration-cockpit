import { readFileSync } from "node:fs";
import {
  parseAuditRequirements,
  applyAuditScope,
  failReasonsByRole,
  matchesExpectedVersion,
  matchesPlanMonth,
  SKIP_SCHED_CONCLUSIONS,
} from "../client/src/lib/pm-schedule-audit.ts";

const TARGET = process.argv[2] || "张玉坤";
const YEAR = 2026, MONTH = 9;

const j = JSON.parse(readFileSync("/tmp/sheet21.json", "utf8"));
const records = j.data.records;

// 与 PmScheduleAuditTab 一致的口径：inScope → 归属模式过滤 → 审计
const inScope = parseAuditRequirements(records).filter((it) => !SKIP_SCHED_CONCLUSIONS.has(it.scheduleConclusion));
const inBelong = inScope.filter((it) => matchesExpectedVersion(it.expectedVersion, YEAR, MONTH));
const inPlan = inScope.filter((it) => matchesPlanMonth(it.month, YEAR, MONTH));

function collect(rows) {
  const items = [];
  for (const row of rows) {
    const a = applyAuditScope(row, false);
    if (a.passed) continue;
    for (const block of failReasonsByRole(a)) {
      if (block.person.includes(TARGET)) {
        items.push({ name: a.name, onesId: a.onesId, onesUrl: a.onesUrl, reasons: block.reasons, role: block.role, person: block.person });
      }
    }
  }
  return items;
}

const items = collect(inBelong);
const planItems = collect(inPlan);
console.log(`=== ${TARGET}：归属口径 ${items.length} 个 / 计划口径 ${planItems.length} 个 ===`);
if (items.length === 0 && planItems.length > 0) {
  items.push(...planItems);
  console.log("（归属口径无数据，改用计划口径展示）");
}
// 全库里的张玉坤（不限月份，看名字写法）
const anyAll = collect(inScope);
console.log(`（全库不限月份：${anyAll.length} 个）`);
if (items.length === 0 && anyAll.length > 0) {
  items.push(...anyAll);
  console.log("（两个口径均无数据，改用全库违规展示——推送后的数据已刷新，原选中需求可能已更新）");
}

// 复刻 pm-audit-push.ts 的纯文本格式（与线上发送/预览完全一致）
const MAX = 5000;
function reqLabel(item) {
  if (!item.onesId) return `「${item.name}」`;
  const safeId = ""; // 纯文本无 markdown 链接
  const onesSuffix = item.onesUrl ? `${item.onesId} ${item.onesUrl}` : item.onesId;
  return `「${item.name}」（${onesSuffix}）`;
}
function block(item) {
  const bullets = item.reasons.map((r) => `  · ${r}`).join("\n");
  return `${reqLabel(item)}\n${bullets}`;
}
const body = items.map(block).join("\n\n");
const contactName = "冯雨檬";
const header = `【排期会准入审计提醒】\n\n以下需求未满足26年9月排期会准入条件，请您关注并尽快处理：\n\n`;
const footer = `\n\n如有疑问请联系 @${contactName}。`;
let full = header + body + footer;
if (full.length > MAX) {
  const cut = body.slice(0, MAX - header.length - footer.length - 20);
  full = `${header}${cut}\n\n…（内容过长已截断）${footer}`;
}

console.log("--- 消息原文开始 ---");
console.log(full);
console.log("--- 消息原文结束 ---");
console.log(`总字符数: ${full.length}`);

// 供核对：各需求的违规原因归属
if (process.env.DETAIL) {
  for (const it of items) {
    console.log(`\n[${it.role}] ${it.name} (${it.onesId})`);
    for (const r of it.reasons) console.log(`  - ${r}`);
  }
}
