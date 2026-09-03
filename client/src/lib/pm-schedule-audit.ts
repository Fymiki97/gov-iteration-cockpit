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
  devInDigitalGov: boolean;
  qaInDigitalGov: boolean;
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

export const SKIP_SCHED_CONCLUSIONS = new Set(["取消", "排期后下车"]);
export const PRODUCT_LINE_ORDER = ["政务AI", "政务协作", "医疗版", "安全版", "WPS政务365", "统一平台"];

const ILLEGAL_STATUS = new Set([
  "未开始", "需求变更", "挂起", "需求立项中", "需求分析中", "需求终止", "UX设计中",
]);

export const DIGITAL_GOV_DEPT = "数字政务事业部";
export const DEV_WORKLOAD_CRITERION = "开发计划工作量";
export const TEST_WORKLOAD_CRITERION = "测试计划工作量";

export const DEFAULT_RULES = [
  { key: "status", label: "需求状态流转", standard: "不在：未开始 / 需求变更 / 挂起 / 需求立项中 / 需求分析中 / 需求终止 / UX设计中" },
  { key: "review", label: "需求立项评审结论", standard: "不为空，且不为「无」" },
  { key: "source", label: "需求来源", standard: "不为空" },
  { key: "dev", label: "开发计划工作量", standard: "不为空；仅开发负责人所属部门为数字政务事业部时计入" },
  { key: "test", label: "测试计划工作量", standard: "不为空；仅测试负责人所属部门为数字政务事业部时计入" },
  { key: "notest", label: "是否免测", standard: "已填写" },
  { key: "line", label: "带出版本线", standard: "须包含「国际」，或「豁免轻审批」有链接/审批编号" },
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

function isInDigitalGovDept(fieldValue: unknown): boolean {
  if (fieldValue == null) return false;
  const items = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
  for (const item of items) {
    if (typeof item !== "object" || !item) continue;
    const districts = (item as Record<string, unknown>).districts;
    if (Array.isArray(districts) && districts.some((d) => String(d).includes(DIGITAL_GOV_DEPT))) {
      return true;
    }
  }
  return false;
}

function criterion(name: string, current: string, standard: string, passed: boolean): AuditCriterion {
  return { name, current: current.trim() || "空", standard, passed };
}

export function applyAuditScope(item: AuditRequirement): AuditRequirement {
  let criteria = item.criteria;
  if (!item.devInDigitalGov) {
    criteria = criteria.filter((c) => c.name !== DEV_WORKLOAD_CRITERION);
  }
  if (!item.qaInDigitalGov) {
    criteria = criteria.filter((c) => c.name !== TEST_WORKLOAD_CRITERION);
  }
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
    const exemption = str(f["豁免轻审批"]);
    const linePass = line.includes("国际") || filled(exemption);
    const lineCurrent = line || (exemption ? `豁免轻审批：${exemption}` : "");
    const devInDigitalGov = isInDigitalGovDept(f["开发负责人·部门"]);
    const qaInDigitalGov = isInDigitalGovDept(f["测试负责人·部门"]);
    const criteria = [
      criterion("需求状态流转", status, "不在不合规状态池", !!status && !ILLEGAL_STATUS.has(status)),
      criterion("需求立项评审结论", review, "不为空且不为「无」", filled(review) && review !== "无"),
      criterion("需求来源", source, "不为空", filled(source)),
      criterion(DEV_WORKLOAD_CRITERION, dev, "不为空", filled(dev)),
      criterion(TEST_WORKLOAD_CRITERION, test, "不为空", filled(test)),
      criterion("是否免测", notest, "已填写", filled(notest)),
      criterion("带出版本线", lineCurrent, "包含「国际」，或豁免轻审批有链接/编号", linePass),
    ];
    return applyAuditScope({
      id: r.id || `row-${index}`,
      name: str(f["标题"]) || "未命名需求",
      pmOwner: str(f["产品负责人"]),
      devOwner: str(f["开发负责人"]),
      qaOwner: str(f["测试负责人"]),
      devInDigitalGov,
      qaInDigitalGov,
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
  const mm = String(month).padStart(2, "0");
  if (haystack.includes(`${yy}${mm}`)) return true;
  const hasYear = haystack.includes(yy) || haystack.includes(String(year));
  const hasMonthLabel = new RegExp(`(^|[^0-9])${month}月`).test(haystack);
  return hasYear && hasMonthLabel;
}

export function matchesPlanMonth(planMonth: string, year: number, month: number): boolean {
  if (year !== 2026) return false;
  if (planMonth === `${month}月`) return true;
  return planMonth === "2&3月" && (month === 2 || month === 3);
}

export function roleOfCriterion(name: string): RoleKey {
  if (name === DEV_WORKLOAD_CRITERION) return "dev";
  if (name === TEST_WORKLOAD_CRITERION) return "qa";
  return "pm";
}

export function formatFailReason(c: AuditCriterion): string {
  if (c.name === "需求状态流转") {
    return `状态为「${c.current}」（不可以为需求立项中/需求分析中/未开始/待公审/需求终止/挂起/需求变更/UX设计中）`;
  }
  if (c.name === "带出版本线") {
    return `带出版本线不包含国际（当前: ${c.current}）且豁免轻审批无链接`;
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
