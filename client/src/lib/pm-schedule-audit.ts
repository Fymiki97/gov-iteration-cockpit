export interface DbsheetRecord {
  id?: string;
  fields?: string | Record<string, unknown>;
}

export interface AuditCriterion {
  name: string;
  current: string;
  standard: string;
  passed: boolean;
}

export interface AuditRequirement {
  id: string;
  name: string;
  pmOwner: string;
  devOwner: string;
  qaOwner: string;
  project: string;
  productLine: string;
  expectedVersion: string;
  versionLine: string;
  month: string;
  planYear: number;
  onesId: string;
  onesUrl: string;
  deadline: string;
  scheduleConclusion: string;
  passed: boolean;
  criteria: AuditCriterion[];
}

export type RoleKey = "pm" | "dev" | "qa";

export interface RoleFailBlock {
  role: string;
  person: string;
  reasons: string[];
}

export const I18N_CRITERION = "多语言适配情况";
export const SKIP_SCHED_CONCLUSIONS = new Set(["取消", "排期后下车"]);
export const PRODUCT_LINE_ORDER = ["政务AI", "政务协作", "医疗版", "安全版", "WPS政务365", "统一平台"];

const ILLEGAL_STATUS = new Set([
  "未开始", "需求变更", "挂起", "需求立项中", "需求分析中", "需求终止", "UX设计中",
]);

export const DEFAULT_RULES = [
  { key: "status", label: "需求状态流转", standard: "不在：未开始 / 需求变更 / 挂起 / 需求立项中 / 需求分析中 / 需求终止 / UX设计中" },
  { key: "review", label: "需求立项评审结论", standard: "不为空，且不为「无」" },
  { key: "source", label: "需求来源", standard: "不为空" },
  { key: "dev", label: "开发计划工作量", standard: "不为空" },
  { key: "test", label: "测试计划工作量", standard: "不为空" },
  { key: "notest", label: "是否免测", standard: "已填写" },
  { key: "line", label: "带出版本线", standard: "包含「国际」或「海外」，或「是否国际化适配」为适配" },
  { key: "i18n", label: "多语言适配情况", standard: "已填写；仅所属项目为 Office 计入" },
];

function fld(r: DbsheetRecord): Record<string, unknown> {
  if (typeof r.fields === "string") {
    try { return JSON.parse(r.fields) as Record<string, unknown>; } catch { return {}; }
  }
  return (r.fields || {}) as Record<string, unknown>;
}

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(str).filter(Boolean).join("、");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["displayText", "text", "name", "userName", "user_name", "nickname", "nickName", "label", "value"]) {
      const s = str(o[k]);
      if (s) return s;
    }
  }
  return "";
}

function parseOnes(f: Record<string, unknown>): { id: string; url: string } {
  const raw = f["ONES ID"];
  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0] as Record<string, unknown>;
    return { id: String(first.displayText || ""), url: String(first.address || "") };
  }
  return { id: "", url: "" };
}

function filled(value: string): boolean {
  const t = value.trim();
  return t !== "" && t !== "空" && t !== "未填" && t !== "-" && t !== "/";
}

function isOfficeProject(project: string): boolean {
  return project.split(/[,，、]/).some((part) => part.trim() === "Office");
}

function criterion(name: string, current: string, standard: string, passed: boolean): AuditCriterion {
  return { name, current: current.trim() || "空", standard, passed };
}

export function applyAuditScope(item: AuditRequirement): AuditRequirement {
  const criteria = isOfficeProject(item.project)
    ? item.criteria
    : item.criteria.filter((c) => c.name !== I18N_CRITERION);
  return { ...item, criteria, passed: criteria.every((c) => c.passed) };
}

export function parseAuditRequirements(records: DbsheetRecord[]): AuditRequirement[] {
  return records.map((r, index) => {
    const f = fld(r);
    const o = parseOnes(f);
    const status = str(f["状态"]);
    const review = str(f["需求立项评审结论"]);
    const source = str(f["需求来源"]);
    const dev = str(f["开发计划工作量（人/天）"]);
    const test = str(f["测试计划工作量（人/天）"]);
    const notest = str(f["是否免测"]);
    const line = str(f["带出版本线"]);
    const intlFlag = str(f["是否国际化适配"]);
    const i18n = str(f["多语言适配情况"]) || str(f["是否适配多语言"]);
    const linePass = /国际/.test(line) || /海外/.test(line) || intlFlag === "适配";
    const criteria = [
      criterion("需求状态流转", status, "不在不合规状态池", !!status && !ILLEGAL_STATUS.has(status)),
      criterion("需求立项评审结论", review, "不为空且不为「无」", filled(review) && review !== "无"),
      criterion("需求来源", source, "不为空", filled(source)),
      criterion("开发计划工作量", dev, "不为空", filled(dev)),
      criterion("测试计划工作量", test, "不为空", filled(test)),
      criterion("是否免测", notest, "已填写", filled(notest)),
      criterion("带出版本线", line || intlFlag, "包含「国际」/「海外」或已国际化适配", linePass),
      criterion("多语言适配情况", i18n, "已填写", filled(i18n)),
    ];
    return applyAuditScope({
      id: r.id || `row-${index}`,
      name: str(f["标题"]) || "未命名需求",
      pmOwner: str(f["产品负责人"]),
      devOwner: str(f["开发负责人"]),
      qaOwner: str(f["测试负责人"]),
      project: str(f["所属项目"]),
      productLine: str(f["所属产品线"]),
      expectedVersion: str(f["期望带出版本"]),
      versionLine: line,
      month: str(f["规划月度"]),
      planYear: 2026,
      onesId: o.id,
      onesUrl: o.url,
      deadline: str(f["计划提测时间"]),
      scheduleConclusion: str(f["排期结论"]),
      passed: criteria.every((c) => c.passed),
      criteria,
    });
  });
}

export function matchesExpectedVersion(text: string, year: number, month: number): boolean {
  const haystack = text.trim();
  if (!haystack) return false;
  const yy = String(year).slice(-2);
  if (!haystack.includes(yy) && !haystack.includes(String(year))) return false;
  const mm = String(month).padStart(2, "0");
  if (haystack.includes(mm)) return true;
  return new RegExp(`(^|[^0-9])${month}月`).test(haystack);
}

export function matchesPlanMonth(planMonth: string, year: number, month: number): boolean {
  if (year !== 2026) return false;
  if (planMonth === `${month}月`) return true;
  return planMonth === "2&3月" && (month === 2 || month === 3);
}

export function roleOfCriterion(name: string): RoleKey {
  if (name === "开发计划工作量") return "dev";
  if (name === "测试计划工作量") return "qa";
  return "pm";
}

export function formatFailReason(c: AuditCriterion): string {
  if (c.name === "需求状态流转") {
    return `状态为「${c.current}」（不可以为需求立项中/需求分析中/未开始/待公审/需求终止/挂起/需求变更/UX设计中）`;
  }
  if (c.name === "带出版本线") {
    return `带出版本线不包含国际/海外（当前: ${c.current}）且未标记国际化适配`;
  }
  if (c.name === "多语言适配情况") {
    return `多语言适配情况为空（当前: ${c.current}）`;
  }
  if (!c.current || c.current === "空" || c.current === "未填" || c.current === "无") {
    return `${c.name}为空`;
  }
  return `${c.name}为「${c.current}」（标准: ${c.standard}）`;
}

export function failReasonsByRole(row: AuditRequirement): RoleFailBlock[] {
  const buckets: Record<RoleKey, RoleFailBlock> = {
    pm: { role: "产品负责人", person: row.pmOwner, reasons: [] },
    dev: { role: "开发负责人", person: row.devOwner, reasons: [] },
    qa: { role: "测试负责人", person: row.qaOwner, reasons: [] },
  };
  for (const c of row.criteria) {
    if (c.passed) continue;
    buckets[roleOfCriterion(c.name)].reasons.push(formatFailReason(c));
  }
  return (["pm", "dev", "qa"] as RoleKey[]).map((key) => buckets[key]).filter((block) => block.reasons.length > 0);
}

export function groupByProductLine(rows: AuditRequirement[]): { productLine: string; rows: AuditRequirement[] }[] {
  const map = new Map<string, AuditRequirement[]>();
  for (const row of rows) {
    const key = row.productLine.trim() || "未填写";
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return [...map.keys()]
    .sort((a, b) => {
      const ia = PRODUCT_LINE_ORDER.indexOf(a);
      const ib = PRODUCT_LINE_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, "zh");
    })
    .map((productLine) => ({ productLine, rows: map.get(productLine) ?? [] }));
}
