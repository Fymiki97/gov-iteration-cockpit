import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import {
  Search,
  X,
  Download,
  Settings2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AuditRequirement, DbsheetRecord, RoleFailBlock } from "@/lib/pm-schedule-audit";
import {
  DEFAULT_RULES,
  SKIP_SCHED_CONCLUSIONS,
  failReasonsByRole,
  groupByProductLine,
  matchesExpectedVersion,
  matchesPlanMonth,
  parseAuditRequirements,
} from "@/lib/pm-schedule-audit";

const YEAR_OPTIONS = [2025, 2026, 2027];
const MONTH_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
type FilterTab = "belong" | "plan";

function matchesOnesId(onesId: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const normalized = onesId.toLowerCase().replace(/^ones-/, "");
  const qNorm = q.replace(/^ones-/, "");
  return onesId.toLowerCase().includes(q) || normalized.includes(qNorm);
}

export function PmScheduleAuditTab(props: { records: DbsheetRecord[]; loading?: boolean }) {
  const [filterTab, setFilterTab] = useState<FilterTab>("belong");
  const [belongYear, setBelongYear] = useState(2026);
  const [belongMonth, setBelongMonth] = useState(9);
  const [planYear, setPlanYear] = useState(2026);
  const [planMonth, setPlanMonth] = useState(9);
  const [onesId, setOnesId] = useState("");
  const [appliedOnesId, setAppliedOnesId] = useState("");
  const [passOpen, setPassOpen] = useState(false);
  const [failOpen, setFailOpen] = useState(true);
  const [detail, setDetail] = useState<AuditRequirement | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const inScope = parseAuditRequirements(props.records)
    .filter((item) => !SKIP_SCHED_CONCLUSIONS.has(item.scheduleConclusion));


  const matchedVersions = [...new Set(
    inScope
      .filter((item) => matchesExpectedVersion(item.expectedVersion, belongYear, belongMonth))
      .map((item) => item.expectedVersion),
  )];

  const matchedPlanCount = inScope.filter(
    (item) => matchesPlanMonth(item.month, planYear, planMonth),
  ).length;

  const filtered = inScope.filter((item) => {
    if (filterTab === "belong") {
      if (!matchesExpectedVersion(item.expectedVersion, belongYear, belongMonth)) return false;
    } else if (!matchesPlanMonth(item.month, planYear, planMonth)) {
      return false;
    }
    return matchesOnesId(item.onesId, appliedOnesId);
  });

  const passed = filtered.filter((item) => item.passed);
  const failed = filtered.filter((item) => !item.passed);

  const runSearch = () => setAppliedOnesId(onesId);
  const resetFilters = () => {
    if (filterTab === "belong") {
      setBelongYear(2026);
      setBelongMonth(9);
    } else {
      setPlanYear(2026);
      setPlanMonth(9);
    }
    setOnesId("");
    setAppliedOnesId("");
  };

  return (
    <div className="space-y-5">
      {props.loading && (
        <p className="text-sm text-[#64748B]">正在从《2026年政务产研版本管理》拉取需求...</p>
      )}
      <div className="rounded-xl border border-[#E4ECFC] bg-white px-4 py-3 shadow-sm">
        <Tabs value={filterTab} onValueChange={(val) => setFilterTab(val as FilterTab)}>
          <TabsList>
            <TabsTrigger value="belong" className="px-3">按所属月份</TabsTrigger>
            <TabsTrigger value="plan" className="px-3">按规划月份</TabsTrigger>
          </TabsList>
          <TabsContent value="belong" className="mt-3">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="space-y-1">
                <p className="text-sm font-medium text-[#2563EB]">所属月份</p>
                <YearMonthSelect
                  year={belongYear}
                  month={belongMonth}
                  onYearChange={setBelongYear}
                  onMonthChange={setBelongMonth}
                />
              </div>
              <span className="text-sm font-medium text-[#059669] whitespace-nowrap pb-2">
                匹配 {matchedVersions.length} 个版本
              </span>
              <OnesIdSearch onesId={onesId} setOnesId={setOnesId} onClear={() => { setOnesId(""); setAppliedOnesId(""); }} onSearch={runSearch} />
              <FilterActions onSearch={runSearch} onReset={resetFilters} />
            </div>
            <p className="text-[11px] text-[#94A3B8] mt-2">
              数据来源：金山文档《2026年政务产研版本管理》「需求管理」表。按「期望带出版本」匹配年份后两位及月份（09 或 N月）。自动排除排期结论为「取消」「排期后下车」。按「所属产品线」分组；多语言仅所属项目 Office 计入。
            </p>
          </TabsContent>
          <TabsContent value="plan" className="mt-3">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="space-y-1">
                <p className="text-sm font-medium text-[#2563EB]">规划月份</p>
                <YearMonthSelect
                  year={planYear}
                  month={planMonth}
                  onYearChange={setPlanYear}
                  onMonthChange={setPlanMonth}
                />
              </div>
              <span className="text-sm font-medium text-[#059669] whitespace-nowrap pb-2">
                匹配 {matchedPlanCount} 条需求
              </span>
              <OnesIdSearch onesId={onesId} setOnesId={setOnesId} onClear={() => { setOnesId(""); setAppliedOnesId(""); }} onSearch={runSearch} />
              <FilterActions onSearch={runSearch} onReset={resetFilters} />
            </div>
            <p className="text-[11px] text-[#94A3B8] mt-2">
              数据来源：金山文档《2026年政务产研版本管理》。按「规划月度」匹配所选月份（2&3月会同时命中 2月和 3月）。自动排除「取消」「排期后下车」。按「所属产品线」分组；多语言仅所属项目 Office 计入。
            </p>
          </TabsContent>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          label="总数量"
          value={filtered.length}
          tone="blue"
          icon={<ClipboardCheck className="w-5 h-5 text-[#2563EB]" />}
        />
        <SummaryCard
          label="达标"
          value={passed.length}
          tone="green"
          icon={<CheckCircle2 className="w-5 h-5 text-[#059669]" />}
        />
        <SummaryCard
          label="未达标"
          value={failed.length}
          tone="red"
          icon={<XCircle className="w-5 h-5 text-[#DC2626]" />}
        />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs text-[#94A3B8]">排期会准入审计(PM)需求列表 · 按所属产品线分组 · 多语言仅所属项目 Office</p>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => toast.info("导出当前页：初稿暂未接入真实导出")}
            className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-[#1E3A5F] border border-[#CBD5E1] rounded-lg bg-white hover:bg-[#F8FAFC] transition-colors"
          >
            <Download className="w-4 h-4" />
            导出当前页
          </button>
          <button
            type="button"
            onClick={() => toast.info("导出所有页：初稿暂未接入真实导出")}
            className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-[#1E3A5F] border border-[#CBD5E1] rounded-lg bg-white hover:bg-[#F8FAFC] transition-colors"
          >
            <Download className="w-4 h-4" />
            导出所有页
          </button>
          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-white bg-[#7C3AED] hover:bg-[#6D28D9] rounded-lg transition-colors"
          >
            <Settings2 className="w-4 h-4" />
            配置审计规则
          </button>
        </div>
      </div>

      <AuditGroup
        title="1. 达标需求"
        count={passed.length}
        passed
        open={passOpen}
        onToggle={() => setPassOpen((v) => !v)}
        rows={passed}
        hoveredId={hoveredId}
        onHover={setHoveredId}
        onDetail={setDetail}
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
      />
      <AuditGroup
        title="2. 未达标需求"
        count={failed.length}
        passed={false}
        open={failOpen}
        onToggle={() => setFailOpen((v) => !v)}
        rows={failed}
        hoveredId={hoveredId}
        onHover={setHoveredId}
        onDetail={setDetail}
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
      />

      <Dialog open={!!detail} onOpenChange={(open) => { if (!open) setDetail(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail?.name}</DialogTitle>
            <DialogDescription>
              {detail?.onesId} · {detail?.expectedVersion} · {detail?.month} · 所属项目 {detail?.project} · 所属产品线 {detail?.productLine} · 产品 {detail?.pmOwner}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {detail?.criteria.map((c) => (
              <div key={c.name} className="flex items-start justify-between gap-3 rounded-lg border border-[#E4ECFC] px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-[#0F172A]">{c.name}</p>
                  <p className="text-xs text-[#64748B] mt-0.5">当前 {c.current} · 标准 {c.standard}</p>
                </div>
                <Badge className={c.passed ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-red-50 text-red-600 border-red-200"}>
                  {c.passed ? "达标" : "未达标"}
                </Badge>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>配置审计规则</DialogTitle>
            <DialogDescription>来自规则文档门禁，数据来自多维表「需求管理」。多语言适配仅统计所属项目 Office。初稿仅展示，保存不会写回数据源。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {DEFAULT_RULES.map((rule, i) => (
              <div key={rule.key} className="rounded-lg border border-[#E4ECFC] px-3 py-2">
                <p className="text-sm text-[#0F172A]">{i + 1}. {rule.label}</p>
                <p className="text-xs text-[#64748B] mt-0.5">{rule.standard}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function YearMonthSelect(props: {
  year: number;
  month: number;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Select value={String(props.year)} onValueChange={(val) => props.onYearChange(Number(val))}>
        <SelectTrigger className="w-[110px] border-[#E4ECFC] h-9 bg-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {YEAR_OPTIONS.map((y) => (
            <SelectItem key={y} value={String(y)}>{y}年</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={String(props.month)} onValueChange={(val) => props.onMonthChange(Number(val))}>
        <SelectTrigger className="w-[90px] border-[#E4ECFC] h-9 bg-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MONTH_OPTIONS.map((m) => (
            <SelectItem key={m} value={String(m)}>{m}月</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function OnesIdSearch(props: {
  onesId: string;
  setOnesId: (value: string) => void;
  onClear: () => void;
  onSearch: () => void;
}) {
  return (
    <div className="relative flex-1 min-w-[220px] self-end">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
      <Input
        placeholder="按 ONES ID 筛选，如 10231 或 ONES-10231"
        value={props.onesId}
        onChange={(e) => props.setOnesId(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") props.onSearch(); }}
        className="pl-9 h-9 text-sm border-[#E4ECFC]"
      />
      {props.onesId && (
        <button type="button" onClick={props.onClear} className="absolute right-2 top-1/2 -translate-y-1/2">
          <X className="w-4 h-4 text-[#94A3B8] hover:text-[#64748B]" />
        </button>
      )}
    </div>
  );
}

function FilterActions(props: { onSearch: () => void; onReset: () => void }) {
  return (
    <>
      <button
        type="button"
        onClick={props.onSearch}
        className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg transition-colors shrink-0 self-end"
      >
        查询
      </button>
      <button
        type="button"
        onClick={props.onReset}
        className="inline-flex items-center h-9 px-3 text-sm font-medium text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] rounded-lg border border-[#E4ECFC] transition-colors shrink-0 self-end"
      >
        重置
      </button>
    </>
  );
}

function SummaryCard(props: {
  label: string;
  value: number;
  tone: "blue" | "green" | "red";
  icon: ReactNode;
}) {
  const tones = {
    blue: "bg-[#EFF6FF] border-[#BFDBFE]",
    green: "bg-[#ECFDF5] border-[#A7F3D0]",
    red: "bg-[#FEF2F2] border-[#FECACA]",
  };
  const valueColor = {
    blue: "text-[#1D4ED8]",
    green: "text-[#047857]",
    red: "text-[#B91C1C]",
  };
  return (
    <Card className={`shadow-sm ${tones[props.tone]}`}>
      <CardContent className="p-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-[#64748B]">{props.label}</p>
          <p className={`text-3xl font-bold mt-1 ${valueColor[props.tone]}`}>{props.value}</p>
        </div>
        <div className="w-11 h-11 rounded-xl bg-white/70 flex items-center justify-center">{props.icon}</div>
      </CardContent>
    </Card>
  );
}

function AuditGroup(props: {
  title: string;
  count: number;
  passed: boolean;
  open: boolean;
  onToggle: () => void;
  rows: AuditRequirement[];
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onDetail: (row: AuditRequirement) => void;
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
}) {
  const productGroups = groupByProductLine(props.rows);

  return (
    <Card className="shadow-sm border-[#E4ECFC] overflow-hidden">
      <button
        type="button"
        onClick={props.onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#F8FAFC] border-b border-[#E4ECFC] text-left"
      >
        <div className="flex items-center gap-2">
          {props.open ? <ChevronDown className="w-4 h-4 text-[#94A3B8]" /> : <ChevronRight className="w-4 h-4 text-[#94A3B8]" />}
          {props.passed
            ? <CheckCircle2 className="w-4 h-4 text-[#059669]" />
            : <XCircle className="w-4 h-4 text-[#DC2626]" />}
          <span className="text-sm font-semibold text-[#0F172A]">{props.title}</span>
          <Badge className={props.passed ? "bg-emerald-50 text-emerald-600 border-none" : "bg-red-50 text-red-600 border-none"}>
            数量：{props.count}
          </Badge>
        </div>
      </button>
      {props.open && (
        <div>
          {props.rows.length === 0 ? (
            <p className="text-sm text-[#94A3B8] text-center py-8">暂无需求</p>
          ) : (
            productGroups.map((group) => (
              <ProductLineTable
                key={group.productLine}
                productLine={group.productLine}
                rows={group.rows}
                passed={props.passed}
                hoveredId={props.hoveredId}
                onHover={props.onHover}
                onDetail={props.onDetail}
                selectedIds={props.selectedIds}
                onSelectedIdsChange={props.onSelectedIdsChange}
              />
            ))
          )}
        </div>
      )}
    </Card>
  );
}

function ProductLineTable(props: {
  productLine: string;
  rows: AuditRequirement[];
  passed: boolean;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onDetail: (row: AuditRequirement) => void;
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
}) {
  const ids = props.rows.map((row) => row.id);
  const allSelected = ids.every((id) => props.selectedIds.includes(id));
  const someSelected = ids.some((id) => props.selectedIds.includes(id));

  const toggleAll = () => {
    if (allSelected) {
      props.onSelectedIdsChange(props.selectedIds.filter((id) => !ids.includes(id)));
      return;
    }
    props.onSelectedIdsChange([...new Set([...props.selectedIds, ...ids])]);
  };

  const toggleRow = (id: string) => {
    props.onSelectedIdsChange(
      props.selectedIds.includes(id)
        ? props.selectedIds.filter((item) => item !== id)
        : [...props.selectedIds, id],
    );
  };

  return (
    <div className="border-b border-[#E4ECFC] last:border-b-0">
      <div className="px-4 py-2 bg-[#EEF4FF] flex items-center gap-2">
        <span className="text-sm font-semibold text-[#1E3A5F]">{props.productLine}</span>
        <Badge className="bg-white text-[#2563EB] border-[#BFDBFE]">所属产品线 · {props.rows.length}</Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-[#E4ECFC] bg-[#F8FAFC] text-left">
              <th className="py-3 px-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                  onChange={toggleAll}
                />
              </th>
              {["#", "需求名称", "产品负责人", "开发负责人", "测试负责人", "不满足原因", "ONES"].map((h) => (
                <th key={h} className="py-3 px-4 font-semibold text-[#0F172A] whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row, i) => {
              const fails = failReasonsByRole(row);
              return (
                <tr
                  key={row.id}
                  onMouseEnter={() => props.onHover(row.id)}
                  onMouseLeave={() => props.onHover(null)}
                  className={`border-b border-[#F1F5FD] align-top transition-colors ${props.hoveredId === row.id ? "bg-[#EFF6FF]" : i % 2 === 0 ? "bg-white hover:bg-[#F8FAFC]" : "bg-[#FAFBFF] hover:bg-[#F8FAFC]"}`}
                >
                  <td className="py-3 px-3">
                    <input type="checkbox" checked={props.selectedIds.includes(row.id)} onChange={() => toggleRow(row.id)} />
                  </td>
                  <td className="py-3 px-4 text-[#64748B] whitespace-nowrap">{i + 1}</td>
                  <td className="py-3 px-4 min-w-[160px]">
                    <button type="button" onClick={() => props.onDetail(row)} className="font-medium text-[#0F172A] text-left hover:text-[#2563EB]">
                      {row.name}
                    </button>
                    <p className="text-[11px] text-[#94A3B8] mt-0.5">所属项目 {row.project} · {row.expectedVersion}</p>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap text-[#334155]">{row.pmOwner}</td>
                  <td className="py-3 px-4 whitespace-nowrap text-[#334155]">{row.devOwner}</td>
                  <td className="py-3 px-4 whitespace-nowrap text-[#334155]">{row.qaOwner}</td>
                  <td className="py-3 px-4 min-w-[360px]">
                    {props.passed || fails.length === 0 ? (
                      <span className="text-xs text-[#94A3B8]">—</span>
                    ) : (
                      <FailReasons blocks={fails} />
                    )}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    {row.onesUrl ? (
                      <a href={row.onesUrl} target="_blank" rel="noreferrer" className="text-sm text-[#2563EB] hover:underline">
                        链接
                      </a>
                    ) : (
                      <span className="text-xs text-[#94A3B8]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FailReasons(props: { blocks: RoleFailBlock[] }) {
  return (
    <div className="space-y-1.5 text-xs leading-6 text-[#0F172A]">
      {props.blocks.map((block) => (
        <p key={block.role}>
          <span className="font-semibold">【{block.role}】</span>
          <span className="font-medium text-[#16A34A]">{block.person}</span>
          <span>：{block.reasons.join("；")}</span>
        </p>
      ))}
    </div>
  );
}
