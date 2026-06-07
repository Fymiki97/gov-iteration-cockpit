import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { createWps365 } from "@ks-open/capability/client/wps365";
import type { Wps365Client } from "@ks-open/capability/client/wps365";
import {
  ResponsiveContainer as RechartResponsive,
  ComposedChart as RechartComposed,
  Bar as RechartBar,
  Line as RechartLine,
  XAxis as RechartXAxis,
  YAxis as RechartYAxisLeft,
  CartesianGrid as RechartCartesianGrid,
  Tooltip as RechartTooltip,
  Legend as RechartLegend,
  PieChart as RechartPie,
  Pie as RechartPieShape,
  Cell as RechartCell,
} from "recharts";
import type { PieLabelRenderProps } from "recharts";

const RechartYAxisRight = (props: React.ComponentProps<typeof RechartYAxisLeft>) => <RechartYAxisLeft orientation="right" {...props} />;
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// Tabs 组件不再使用（已改为侧边栏导航）
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Layers,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  ListChecks,
  Milestone,
  BarChart3,
  Search,
  X,
  ExternalLink,
  Calendar,
  CalendarDays,
  Clock,
  ChevronRight,
  ChevronDown,
  Info,
  Menu,
  PanelLeftClose,
  Download,
  ImageDown,
} from "lucide-react";
import {
  buildExcelExportFilename,
  buildImageExportFilename,
  captureElementAsPng,
  exportRequirementsToExcel,
} from "@/lib/export-utils";

/* ==================== 常量 ==================== */
const FILE_ID = "Dm5Wx1ph11MNih2SbwZurxjFLUZTboQEF";
const TAB_OVERVIEW = "overview";
const TAB_MONTHLY = "monthly";
const TAB_LIST = "list";
const TAB_MILESTONE = "milestone";

const STATUS_COLORS = [
  "#2563EB", "#059669", "#F59E0B", "#DC2626", "#8B5CF6",
  "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#64748B",
];

/* ==================== 类型 ==================== */
interface ReqRow {
  id: string;
  title: string;
  status: string;
  level: string;
  project: string;
  iteration: string;
  testDate: string;
  devOwner: string;
  testOwner: string;
  productOwner: string;
  onesId: string;
  onesUrl: string;
  modTime: string;
  month: string;
  workload: number;
  devWorkload: number;
  testWorkload: number;
  noTest: boolean;
}

interface MilestoneRow {
  id: string;
  name: string;
  month: string;
  status: string;
  eventDate: string;   // 事件日期
  hasActual: boolean;  // 是否有实际完成时间
  note: string;        // 备注
  daysLeft: number; delayDays: number;
}

interface RiskRow {
  id: string;
  title: string;
  status: string;
  date: string;
  product: string;
  iteration: string;
  onesId: string;      // 关联的 ONES ID
  strategy: string;    // 应对策略
}

interface MonthDetail {
  month: string;
  total: number;
  completed: number;
  pct: number;
  completionRate: number;
  topStatuses: { name: string; count: number; color: string }[];
  milestoneCount: number;
  riskCount: number;
  totalWorkload: number;
  devWorkload: number;
  testWorkload: number;
  noTestCount: number;
  noTestRatio: number;
  terminatedCount: number;
}

type FilterTag = "total" | "completed" | "risk" | "bar" | null;

/* ==================== 主组件 ==================== */
export function DashboardPage() {
  const [wps, setWps] = useState<Wps365Client | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [requirements, setRequirements] = useState<ReqRow[]>([]);
  const [milestones, setMilestones] = useState<MilestoneRow[]>([]);
  const [risks, setRisks] = useState<RiskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(TAB_OVERVIEW);

  // 筛选
  const [filterTag, setFilterTag] = useState<FilterTag>(null);
  const [searchText, setSearchText] = useState("");
  const [selectedIterations, setSelectedIterations] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedOwners, setSelectedOwners] = useState<string[]>([]);
  const [milestoneMonth, setMilestoneMonth] = useState("全部");
  const [monthlyMonthFilter, setMonthlyMonthFilter] = useState("全部");
  const [milestoneCompletedExpanded, setMilestoneCompletedExpanded] = useState(false);
  const [hoveredPie, setHoveredPie] = useState<string | null>(null);
  const [milestoneQuickFilter, setMilestoneQuickFilter] = useState<string>("全部");
  const [milestoneSearchText, setMilestoneSearchText] = useState("");
  const [milestoneGroupExpanded, setMilestoneGroupExpanded] = useState<Record<string, boolean>>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [reqPage, setReqPage] = useState(0);
  const [monthTableSortCol, setMonthTableSortCol] = useState("month");
  const [monthTableSortAsc, setMonthTableSortAsc] = useState(true);
  const [monthCardsCollapsed, setMonthCardsCollapsed] = useState(false);
  const REQ_PAGE_SIZE = 20;
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [silentRefreshing, setSilentRefreshing] = useState(false);
  const autoRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabContentRef = useRef<HTMLElement>(null);
  const [exportingImage, setExportingImage] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportTip, setExportTip] = useState<string | null>(null);

  // 柱状图 hover
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);

  /* === SDK === */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const client = createWps365({
          proxyBase: import.meta.env.DEV ? "/base-proxy" : "/app/app-base/base-proxy",
        });
        const authResult = await client.ensureAuthorized({ scope: "kso.dbsheet.readwrite" });
        if (!authResult.authorized) return;
        if (cancelled) return;
        setWps(client);
        setAuthChecked(true);
      } catch (err) {
        if (!cancelled) setAuthError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* === 加载数据（silent=true 时不清空已有数据、不显示骨架屏） === */
  const loadData = useCallback(async (silent = false) => {
    if (!wps) return;
    if (silent) { setSilentRefreshing(true); } else { setLoading(true); }
    try {
      const [reqRes, milRes, riskRes] = await Promise.all([
        wps.dbsheet.listRecords({ file_id: FILE_ID, sheet_id: 21, prefer_id: false, max_records: 2000, page_size: 1000 }),
        wps.dbsheet.listRecords({ file_id: FILE_ID, sheet_id: 23, prefer_id: false, max_records: 200 }),
        wps.dbsheet.listRecords({ file_id: FILE_ID, sheet_id: 24, prefer_id: false, max_records: 50 }),
      ]);
      if (reqRes.data?.records) {
        const reqs = parseReqs(reqRes.data.records);
        setRequirements(reqs);
        if (!silent) {
          const monthDist: Record<string, number> = {};
          reqs.forEach(r => { const m = r.month || "(空)"; monthDist[m] = (monthDist[m] || 0) + 1; });
          console.log("[需求-月份分布]", monthDist, "| 规则: 读取「排期月度」字段, 空值→「未参与排期」");
          if (reqRes.data.records.length > 0) {
            const raw = reqRes.data.records.slice(0, 3).map(r => {
              const f = fld(r as RawRec);
              const monthKeys = Object.keys(f).filter(k => k.includes("月") || k.includes("排期") || k.includes("迭代"));
              const vals: Record<string, string> = {};
              monthKeys.forEach(k => { vals[k] = str(f[k]).substring(0, 30); });
              return { id: r.id, monthKeys: vals };
            });
            console.log("[需求-含月的字段]", JSON.stringify(raw));
          }
          console.log("[Req ONES ID 样本]", reqs.filter(r => r.onesId).slice(0, 5).map(r => ({ title: r.title?.substring(0,20), onesId: r.onesId })));
        }
      }
      if (milRes.data?.records) {
        const mils = parseMils(milRes.data.records);
        setMilestones(mils);
        if (!silent && milRes.data.records.length > 0) {
          const raw = milRes.data.records.slice(0, 5).map(r => {
            const f = fld(r as RawRec);
            return { id: r.id, keys: Object.keys(f), values: Object.fromEntries(Object.entries(f).map(([k,v]) => [k, str(v).substring(0, 50)])) };
          });
          console.log("[里程碑-原始字段样本]", JSON.stringify(raw));
        }
      }
      if (riskRes.data?.records) setRisks(parseRisks(riskRes.data.records));
      setLastRefreshTime(new Date());
    } catch (err) {
      console.error("加载失败:", err);
    } finally {
      if (silent) { setSilentRefreshing(false); } else { setLoading(false); }
    }
  }, [wps]);

  // 首次加载
  useEffect(() => { if (wps) loadData(false); }, [wps, loadData]);

  // 自动轮询：工作时间(8:00-21:00) 5分钟，其余 1小时
  useEffect(() => {
    if (!wps) return;
    function scheduleNext() {
      const h = new Date().getHours();
      const ms = (h >= 8 && h < 21) ? 5 * 60_000 : 60 * 60_000;
      autoRefreshRef.current = setTimeout(() => { loadData(true).then(scheduleNext); }, ms);
    }
    scheduleNext();
    return () => { if (autoRefreshRef.current) clearTimeout(autoRefreshRef.current); };
  }, [wps, loadData]);

  // 页面可见性恢复时立即刷新
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && wps) loadData(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [wps, loadData]);

  /* === 全量统计 (加权进度，需求终止权重为0但计入总数) === */
  const stats = useMemo(() => {
    let sumProgress = 0;
    let completed = 0;
    const byMonth: Record<string, { total: number; sumProgress: number; completed: number; statuses: Record<string, number>; totalWorkload: number; devWorkload: number; testWorkload: number; noTestCount: number; terminatedCount: number }> = {};
    const statusCounts: Record<string, number> = {};
    requirements.forEach((r) => {
      const prog = getStatusProgress(r.status);
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
      if (prog >= 100) completed++;
      sumProgress += prog;
      const m = getMonth(r);
      if (!byMonth[m]) byMonth[m] = { total: 0, sumProgress: 0, completed: 0, statuses: {}, totalWorkload: 0, devWorkload: 0, testWorkload: 0, noTestCount: 0, terminatedCount: 0 };
      byMonth[m].total++;
      byMonth[m].sumProgress += prog;
      if (prog >= 100) byMonth[m].completed++;
      byMonth[m].statuses[r.status] = (byMonth[m].statuses[r.status] || 0) + 1;
      byMonth[m].totalWorkload += r.workload;
      byMonth[m].devWorkload += r.devWorkload;
      byMonth[m].testWorkload += r.testWorkload;
      if (r.noTest) byMonth[m].noTestCount++;
      if (isTerminated(r.status)) byMonth[m].terminatedCount++;
    });
    const total = requirements.length;
    const activeRisks = risks.filter((r) => !r.status.includes("解除") && !r.status.includes("关闭") && !r.status.includes("已关闭") && !r.status.includes("完成")).length;
    const msByMonth: Record<string, number> = {};
    milestones.forEach(m => { if (m.month) msByMonth[m.month] = (msByMonth[m.month] || 0) + 1; });
    const riskByMonth: Record<string, number> = {};
    risks.forEach(r => { const km = r.iteration; if (km) riskByMonth[km] = (riskByMonth[km] || 0) + 1; });
    return { total, sumProgress, completed, activeRisks, pct: total > 0 ? Math.round(sumProgress / total) : 0, byMonth, statusCounts, msByMonth, riskByMonth };
  }, [requirements, risks, milestones]);

  const monthOrder = ["2&3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月", "未参与排期"];

  /*  月度迭代情况 (全量、加权进度) */
  const monthDetails: MonthDetail[] = useMemo(() => {
    return Object.entries(stats.byMonth)
      .map(([month, d]) => {
        const st = Object.entries(d.statuses).sort(([, a], [, b]) => b - a).slice(0, 4);
        const cRate = d.total > 0 ? Math.round(d.completed / d.total * 100) : 0;
        const ntRatio = d.total > 0 ? Math.round(d.noTestCount / d.total * 100) : 0;
        return {
          month,
          total: d.total,
          completed: d.completed,
          pct: d.total > 0 ? Math.round(d.sumProgress / d.total) : 0,
          completionRate: cRate,
          topStatuses: st.map(([name, count], i) => ({ name, count, color: STATUS_COLORS[i % STATUS_COLORS.length] })),
          milestoneCount: stats.msByMonth[month] || 0,
          riskCount: stats.riskByMonth[month] || 0,
          totalWorkload: d.totalWorkload,
          devWorkload: d.devWorkload,
          testWorkload: d.testWorkload,
          noTestCount: d.noTestCount,
          noTestRatio: ntRatio,
          terminatedCount: d.terminatedCount,
        };
      })
      .sort((a, b) => {
        const ai = monthOrder.indexOf(a.month), bi = monthOrder.indexOf(b.month);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
  }, [stats]);

  /* === 柱状图数据 === */
  const barData = useMemo(() =>
    Object.entries(stats.statusCounts).sort(([, a], [, b]) => b - a),
    [stats.statusCounts]
  );
  const barMax = Math.max(...barData.map(([, c]) => c), 1);

  /* === 筛选需求列表 === */
  const filteredReqs = useMemo(() => {
    let list = [...requirements];
    list.sort((a, b) => b.modTime.localeCompare(a.modTime));

    if (filterTag === "completed") {
      list = list.filter(r => isComplete(r.status));
    } else if (filterTag === "risk") {
      //  风险关联需求：ONES ID 匹配
      const riskOnesIds = new Set(risks.map(r => r.onesId).filter(Boolean));
      list = list.filter(r => r.onesId && riskOnesIds.has(r.onesId));
    } else if (filterTag === "bar") {
      // 柱状图点击传入的状态
      list = list; // 由 selectedStatuses 处理
    }

    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter(r =>
        r.title.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q) ||
        r.project.toLowerCase().includes(q) ||
        r.devOwner.toLowerCase().includes(q) ||
        r.testOwner.toLowerCase().includes(q) ||
        r.onesId.toLowerCase().includes(q) ||
        r.iteration.toLowerCase().includes(q) ||
        r.level.toLowerCase().includes(q)
      );
    }

    if (selectedIterations.length > 0) list = list.filter(r => selectedIterations.includes(r.month));
    if (selectedStatuses.length > 0) list = list.filter(r => selectedStatuses.includes(r.status));
    if (selectedOwners.length > 0) list = list.filter(r => selectedOwners.some(o => r.devOwner === o || r.testOwner === o));

    return list;
  }, [requirements, filterTag, searchText, selectedIterations, selectedStatuses, selectedOwners, risks]);

  // 筛选条件变化时重置分页
  useEffect(() => { setReqPage(0); }, [filterTag, searchText, selectedIterations, selectedStatuses, selectedOwners]);

  // 需求列表分页
  const reqTotalPages = Math.max(1, Math.ceil(filteredReqs.length / REQ_PAGE_SIZE));
  const safeReqPage = Math.min(reqPage, reqTotalPages - 1);
  const paginatedReqs = filteredReqs.slice(safeReqPage * REQ_PAGE_SIZE, (safeReqPage + 1) * REQ_PAGE_SIZE);

  const allIterations = useMemo(() => uniqSorted(requirements.map(r => getMonth(r))), [requirements]);
  const allStatuses = useMemo(() => uniqSorted(requirements.map(r => r.status)), [requirements]);
  const allOwners = useMemo(() => {
    const s = new Set<string>();
    requirements.forEach(r => { if (r.devOwner) s.add(r.devOwner); if (r.testOwner) s.add(r.testOwner); });
    return Array.from(s).sort();
  }, [requirements]);

  const riskOnesIdSet = useMemo(() => new Set(risks.map(r => r.onesId).filter(Boolean)), [risks]);

  /* === 里程碑 (sheet23) === */
  const milestoneMonths = useMemo(() => {
    const s = new Set<string>();
    milestones.forEach(m => { if (m.month) s.add(m.month); });
    return Array.from(s).sort((a, b) => parseInt(a) - parseInt(b));
  }, [milestones]);

  const filteredMilestones = useMemo(() => {
    const list = milestoneMonth === "全部" ? milestones : milestones.filter(m => m.month === milestoneMonth);
    return [...list].sort((a, b) => (a.eventDate || "zzzz").localeCompare(b.eventDate || "zzzz"));
  }, [milestones, milestoneMonth]);

  /* === 跳转 === */
  const goToList = (tag: FilterTag) => {
    setSelectedIterations([]);
    setSelectedStatuses([]);
    setSelectedOwners([]);
    setSearchText("");
    setFilterTag(tag);
    setTab(TAB_LIST);
  };

  /** 导出当前 Tab 内容为 PNG */
  const handleExportImage = useCallback(async () => {
    if (exportingImage || !tabContentRef.current) return;
    setExportingImage(true);
    setExportTip("正在生成图片，请稍候...");
    try {
      let extraSuffix: string | undefined;
      if (tab === TAB_MONTHLY && monthlyMonthFilter !== "全部") extraSuffix = monthlyMonthFilter;
      if (tab === TAB_MILESTONE && milestoneMonth !== "全部") extraSuffix = milestoneMonth;
      const filename = buildImageExportFilename(tab, extraSuffix);
      await captureElementAsPng(tabContentRef.current, filename);
      setExportTip("图片已导出");
      setTimeout(() => setExportTip(null), 2000);
    } catch (err) {
      console.error("[导出图片]", err);
      setExportTip("图片导出失败，请重试");
      setTimeout(() => setExportTip(null), 3000);
    } finally {
      setExportingImage(false);
    }
  }, [exportingImage, tab, monthlyMonthFilter, milestoneMonth]);

  /** 导出需求列表 Excel（当前筛选全部数据） */
  const handleExportExcel = useCallback(() => {
    if (exportingExcel || filteredReqs.length === 0) return;
    setExportingExcel(true);
    try {
      exportRequirementsToExcel(
        filteredReqs.map(r => ({
          onesId: r.onesId,
          onesUrl: r.onesUrl,
          title: r.title,
          status: r.status,
          level: r.level,
          project: r.project,
          productOwner: r.productOwner,
          devOwner: r.devOwner,
          testOwner: r.testOwner,
        })),
        buildExcelExportFilename(),
      );
    } catch (err) {
      console.error("[导出Excel]", err);
    } finally {
      setExportingExcel(false);
    }
  }, [exportingExcel, filteredReqs]);

  /* === 状态色 === */
  const sc = (s: string) => {
    if (!s) return "bg-slate-100 text-slate-500 border-slate-200";
    if (/已发布|完成|完结|解除/.test(s)) return "bg-emerald-50 text-emerald-600 border-emerald-200";
    if (/风险/.test(s)) return "bg-red-50 text-red-600 border-red-200";
    if (/开发|进行/.test(s)) return "bg-blue-50 text-blue-600 border-blue-200";
    if (/测试/.test(s)) return "bg-amber-50 text-amber-600 border-amber-200";
    if (/待|规划|需求/.test(s)) return "bg-slate-100 text-slate-500 border-slate-200";
    if (/暂停|取消|关闭/.test(s)) return "bg-red-50 text-red-400 border-red-200";
    return "bg-slate-100 text-slate-500 border-slate-200";
  };

  /* === 加载/错误页 === */
  if (!authChecked) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F8FAFC]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#2563EB] mx-auto mb-4" />
          <p className="text-[#64748B]">检查授权状态...</p>
        </div>
      </div>
    );
  }
  if (authError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F8FAFC]">
        <div className="text-center max-w-md p-8">
          <AlertTriangle className="w-12 h-12 text-[#DC2626] mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-[#0F172A] mb-2">授权失败</h2>
          <p className="text-[#64748B] text-sm">{authError}</p>
        </div>
      </div>
    );
  }

  const NAV_ITEMS = [
    { key: TAB_OVERVIEW, label: "迭代概览", icon: BarChart3 },
    { key: TAB_MONTHLY, label: "月度迭代情况", icon: CalendarDays },
    { key: TAB_LIST, label: "需求列表", icon: ListChecks },
    { key: TAB_MILESTONE, label: "里程碑", icon: Milestone },
  ] as const;

  /* ==================== 渲染 ==================== */
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      {/* 移动端遮罩 */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* 侧边栏 */}
      <aside className={`fixed md:sticky top-0 left-0 z-40 h-screen bg-white border-r border-[#E4ECFC] flex flex-col shrink-0 transition-all duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"} ${sidebarCollapsed ? "md:w-[68px]" : "md:w-[260px]"} w-[260px]`}>
        {/* 标题区域 */}
        <div className={`border-b border-[#E4ECFC] ${sidebarCollapsed ? "px-3 py-4" : "px-5 py-5"}`}>
          <div className="flex items-center justify-between">
            <div className={`flex items-center ${sidebarCollapsed ? "justify-center w-full" : "gap-3"}`}>
              <div className={`rounded-lg bg-[#1E3A5F] flex items-center justify-center shrink-0 ${sidebarCollapsed ? "w-9 h-9" : "w-10 h-10"}`}>
                <BarChart3 className={`text-white ${sidebarCollapsed ? "w-4.5 h-4.5" : "w-5 h-5"}`} />
              </div>
              {!sidebarCollapsed && (
                <div>
                  <h1 className="text-base font-bold text-[#0F172A] leading-snug tracking-tight">政务产研迭代进度看板</h1>
                  <p className="text-[11px] text-[#94A3B8] leading-tight mt-0.5">2026 研发迭代规划</p>
                </div>
              )}
            </div>
            <button className="md:hidden p-1 rounded hover:bg-[#F1F5FD]" onClick={() => setSidebarOpen(false)}>
              <PanelLeftClose className="w-4 h-4 text-[#94A3B8]" />
            </button>
          </div>
        </div>

        {/* 导航项 */}
        <nav className={`flex-1 py-4 space-y-1 ${sidebarCollapsed ? "px-2" : "px-3"}`}>
          {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => { setTab(key); setSidebarOpen(false); }}
              title={sidebarCollapsed ? label : undefined}
              className={`w-full flex items-center rounded-lg transition-colors ${sidebarCollapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5"} text-sm ${tab === key ? "bg-[#F1F5FD] text-[#2563EB] font-medium" : "text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A]"}`}>
              <Icon className={`w-[18px] h-[18px] shrink-0 ${tab === key ? "text-[#2563EB]" : "text-[#94A3B8]"}`} />
              {!sidebarCollapsed && label}
            </button>
          ))}
        </nav>

        {/* 底部 */}
        <div className={`border-t border-[#E4ECFC] space-y-2 ${sidebarCollapsed ? "px-2 py-3" : "px-4 py-4"}`}>
          {!sidebarCollapsed && lastRefreshTime && (
            <div className="text-[11px] text-[#94A3B8] space-y-0.5">
              <p className="flex items-center gap-1">
                {silentRefreshing ? <><span className="inline-block w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-pulse" /> 同步中...</> : <>
                  更新于 {lastRefreshTime.getFullYear()}-{(lastRefreshTime.getMonth() + 1).toString().padStart(2, "0")}-{lastRefreshTime.getDate().toString().padStart(2, "0")}{" "}
                  {lastRefreshTime.getHours().toString().padStart(2, "0")}:{lastRefreshTime.getMinutes().toString().padStart(2, "0")}:{lastRefreshTime.getSeconds().toString().padStart(2, "0")}
                </>}
              </p>
              <p>{(() => { const h = new Date().getHours(); return h >= 8 && h < 21 ? "工作时段 · 每5分钟自动刷新" : "非工作时段 · 每小时自动刷新"; })()}</p>
            </div>
          )}
          <button
            onClick={() => loadData(requirements.length > 0)}
            disabled={loading || silentRefreshing}
            title={sidebarCollapsed ? "刷新数据" : undefined}
            className={`w-full flex items-center justify-center gap-2 text-xs text-[#64748B] hover:text-[#2563EB] hover:bg-[#F1F5FD] rounded-lg border border-[#E4ECFC] transition-colors ${sidebarCollapsed ? "p-2.5" : "px-3 py-2"}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${loading || silentRefreshing ? "animate-spin" : ""}`} />
            {!sidebarCollapsed && "刷新数据"}
          </button>
          {/* 收起/展开按钮 */}
          <button
            onClick={() => setSidebarCollapsed(c => !c)}
            className="hidden md:flex w-full items-center justify-center gap-2 px-3 py-2 text-xs text-[#94A3B8] hover:text-[#64748B] hover:bg-[#F8FAFC] rounded-lg transition-colors"
          >
            <PanelLeftClose className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${sidebarCollapsed ? "rotate-180" : ""}`} />
            {!sidebarCollapsed && "收起侧栏"}
          </button>
        </div>
      </aside>

      {/* 右侧主内容区 */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* 顶部栏 */}
        <header className="bg-white border-b border-[#E4ECFC] sticky top-0 z-20">
          <div className="px-6 md:px-8 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button className="md:hidden p-1.5 rounded-lg hover:bg-[#F1F5FD]" onClick={() => setSidebarOpen(true)}>
                <Menu className="w-5 h-5 text-[#64748B]" />
              </button>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold text-[#0F172A] tracking-tight">
                  {NAV_ITEMS.find(n => n.key === tab)?.label || "政务产研迭代进度看板"}
                </h1>
                <p className="text-xs text-[#94A3B8] mt-0.5">2026政务产品研发迭代规划 · 实时追踪</p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {exportTip && (
                <span className="text-xs text-[#64748B] hidden sm:inline">{exportTip}</span>
              )}
              {tab !== TAB_LIST && (
                <button
                  type="button"
                  onClick={handleExportImage}
                  disabled={exportingImage || loading}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-[#1E3A5F] border border-[#CBD5E1] rounded-lg bg-white hover:bg-[#F8FAFC] hover:border-[#94A3B8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ImageDown className={`w-4 h-4 ${exportingImage ? "animate-pulse" : ""}`} />
                  {exportingImage ? "生成中..." : "导出图片"}
                </button>
              )}
            </div>
          </div>
          {exportTip && (
            <p className="px-6 md:px-8 pb-2 text-xs text-[#64748B] sm:hidden">{exportTip}</p>
          )}
        </header>

        <main ref={tabContentRef} data-export-root className="flex-1 overflow-y-auto px-6 md:px-8 py-6 bg-[#F8FAFC]">
          {/* ============ TAB 1: 迭代概览 ============ */}
          {tab === TAB_OVERVIEW && (
            <div className="space-y-6">
              {/* 4 卡片 */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {loading ? [...Array(4)].map((_, i) => <Card key={i}><CardContent className="p-6"><Skeleton className="h-16" /></CardContent></Card>) : (
                  <>
                    <Card className="shadow-sm border-[#E4ECFC] hover:shadow-md hover:border-[#2563EB]/30 cursor-pointer transition-all" onClick={() => goToList(null)}>
                      <CardContent className="p-5 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider">需求总数</p>
                          <p className="text-3xl font-bold text-[#0F172A] mt-1">{stats.total}</p>
                          <p className="text-xs text-[#94A3B8] mt-0.5">点击查看全部</p>
                        </div>
                        <div className="w-11 h-11 rounded-xl bg-[#F1F5FD] flex items-center justify-center"><Layers className="w-5 h-5 text-[#2563EB]" /></div>
                      </CardContent>
                    </Card>
                    <Card className="shadow-sm border-[#E4ECFC] hover:shadow-md hover:border-emerald-300 cursor-pointer transition-all" onClick={() => goToList("completed")}>
                      <CardContent className="p-5 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider">已完成</p>
                          <p className="text-3xl font-bold text-[#059669] mt-1">{stats.completed}</p>
                          <p className="text-xs text-[#94A3B8] mt-0.5">点击查看已完成需求</p>
                        </div>
                        <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-[#059669]" /></div>
                      </CardContent>
                    </Card>
                    <Card className="shadow-sm border-[#E4ECFC] hover:shadow-md hover:border-red-300 cursor-pointer transition-all" onClick={() => goToList("risk")}>
                      <CardContent className="p-5 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider">剩余风险</p>
                          <p className="text-3xl font-bold text-[#DC2626] mt-1">{stats.activeRisks}</p>
                          <p className="text-xs text-[#94A3B8] mt-0.5">全部 {risks.length} 项</p>
                        </div>
                        <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-[#DC2626]" /></div>
                      </CardContent>
                    </Card>
                    <Card className="shadow-sm border-[#E4ECFC] hover:shadow-md hover:border-blue-300 cursor-pointer transition-all" onClick={() => goToList("completed")}>
                      <CardContent className="p-5 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider">完成进度</p>
                          <p className="text-3xl font-bold text-[#2563EB] mt-1">{stats.total > 0 ? Math.round(stats.completed / stats.total * 100) : 0}%</p>
                          <p className="text-xs text-[#94A3B8] mt-0.5">已完成 {stats.completed} / 总计 {stats.total}</p>
                        </div>
                        <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-[#2563EB]" /></div>
                      </CardContent>
                    </Card>
                  </>
                )}
              </div>

              {/*  状态分布柱状图 */}
              <Card className="shadow-sm border-[#E4ECFC]">
                <CardHeader className="pb-2"><CardTitle className="text-base font-semibold text-[#0F172A]">状态分布</CardTitle></CardHeader>
                <CardContent>
                  {loading ? <Skeleton className="h-64 w-full rounded-lg" /> : (
                    <div className="space-y-2">
                      {barData.map(([name, count], i) => {
                        const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
                        const color = STATUS_COLORS[i % STATUS_COLORS.length];
                        const isHovered = hoveredBar === name;
                        return (
                          <div
                            key={name}
                            className="group relative flex items-center gap-3 cursor-pointer"
                            onMouseEnter={() => setHoveredBar(name)}
                            onMouseLeave={() => setHoveredBar(null)}
                            onClick={() => { setSelectedStatuses([name]); setFilterTag(null); setSearchText(""); setTab(TAB_LIST); }}
                          >
                            <span className="text-xs text-[#64748B] w-16 text-right shrink-0">{name}</span>
                            <div className="flex-1 h-7 bg-[#F1F5FD] rounded-md overflow-hidden relative">
                              <div
                                className="h-full rounded-md transition-all duration-300"
                                style={{ width: `${Math.max((count / barMax) * 100, 2)}%`, background: color, opacity: isHovered ? 1 : 0.82 }}
                              />
                            </div>
                            <span className="text-xs font-medium text-[#0F172A] w-12 shrink-0">{count}</span>
                            <span className="text-xs text-[#94A3B8] w-10 shrink-0">{pct}%</span>
                            {/* hover tooltip */}
                            {isHovered && (
                              <div className="absolute left-20 -top-10 z-50 px-3 py-1.5 bg-[#0F172A] text-white text-xs rounded-lg shadow-lg whitespace-nowrap pointer-events-none"
                                style={{ borderColor: color }}>
                                <span className="font-semibold">{name}</span>：{count} 条 ({pct}%)
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 风险跟踪 */}
              {risks.length > 0 && (() => {
                const activeRisks = risks.filter(r => !r.status.includes("解除") && !r.status.includes("关闭") && !r.status.includes("已关闭"));
                const closedRisks = risks.filter(r => r.status.includes("解除") || r.status.includes("关闭") || r.status.includes("已关闭"));
                // 按应对策略分组统计
                const strategyMap: Record<string, { total: number; statuses: Record<string, number> }> = {};
                activeRisks.forEach(r => {
                  const key = r.strategy || "未填写策略";
                  if (!strategyMap[key]) strategyMap[key] = { total: 0, statuses: {} };
                  strategyMap[key].total++;
                  strategyMap[key].statuses[r.status] = (strategyMap[key].statuses[r.status] || 0) + 1;
                });
                return (
                <Card className="shadow-sm border-[#E4ECFC]">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold text-[#0F172A] flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-[#DC2626]" />风险跟踪
                      <Badge className="bg-red-50 text-red-600 border-red-200 text-xs font-normal">{activeRisks.length} 项活跃</Badge>
                      {closedRisks.length > 0 && <Badge className="bg-slate-100 text-slate-500 border-slate-200 text-xs font-normal">{closedRisks.length} 项已解除</Badge>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* 按策略汇总 */}
                    {Object.keys(strategyMap).length > 0 && (
                      <div className="mb-4 p-3 bg-[#FFFBEB] rounded-lg border border-[#FDE68A]">
                        <p className="text-xs font-semibold text-[#92400E] mb-2">按应对策略汇总</p>
                        <div className="space-y-1.5">
                          {Object.entries(strategyMap).map(([strategy, data]) => (
                            <div key={strategy} className="flex items-start gap-2 text-xs">
                              <span className="font-medium text-[#92400E] min-w-[120px] shrink-0">{strategy}</span>
                              <span className="text-[#78716C]">{data.total} 项</span>
                              <span className="text-[#94A3B8]">— {Object.entries(data.statuses).map(([s, c]) => `${s}×${c}`).join("，")}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* 风险列表 */}
                    <div className="space-y-2">
                      {activeRisks.map((r) => {
                        const matchCount = r.onesId ? requirements.filter(req => req.onesId === r.onesId).length : 0;
                        return (
                        <div key={r.id} className="flex items-center justify-between py-3 px-4 bg-red-50/50 rounded-lg border border-red-100 cursor-pointer hover:bg-red-50 transition-colors"
                          onClick={() => {
                            setFilterTag("risk");
                            setSelectedIterations([]);
                            setSelectedStatuses([]);
                            setSelectedOwners([]);
                            setSearchText(r.onesId);
                            setTab(TAB_LIST);
                          }}
                        >
                          <div className="flex-1 min-w-0 mr-4">
                            <p className="text-sm text-[#0F172A] line-clamp-1">{r.title}</p>
                            <p className="text-xs text-[#94A3B8] mt-0.5">
                              {r.date} · {r.product} · {r.iteration}
                              {r.strategy && <span className="ml-2 text-[#92400E]">策略: {r.strategy}</span>}
                              {r.onesId ? (
                                <span className="ml-2 inline-flex items-center gap-1">
                                  <span className="text-[#2563EB] font-medium">ONES: {r.onesId}</span>
                                  {matchCount > 0 ? (
                                    <span className="text-[#059669]">(关联 {matchCount} 条需求)</span>
                                  ) : (
                                    <span className="text-[#DC2626]">(未匹配到需求!)</span>
                                  )}
                                </span>
                              ) : (
                                <span className="ml-2 text-[#DC2626] font-medium">⚠ 未提取到 ONES ID</span>
                              )}
                            </p>
                          </div>
                          <Badge className={`text-xs font-normal border ${sc(r.status)}`}>{r.status}</Badge>
                        </div>
                      )})}
                    </div>
                  </CardContent>
                </Card>
                );
              })()}
            </div>
          )}

          {/* ============ TAB 2: 月度迭代情况 ============ */}
          {tab === TAB_MONTHLY && (
            <div className="space-y-6">
              {/* 月份筛选器 */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium text-[#0F172A]">迭代月份：</span>
                <Select value={monthlyMonthFilter} onValueChange={(val) => setMonthlyMonthFilter(val as string)}>
                  <SelectTrigger className="w-[140px] border-[#E4ECFC]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="全部">全部</SelectItem>
                    {monthDetails.map(md => (
                      <SelectItem key={md.month} value={md.month}>{md.month}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 月份内容 */}
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-44" />)}</div>
              ) : monthlyMonthFilter === "全部" ? (
                /* === 全部月份：概览卡片 + 整合对比视图 === */
                monthDetails.length === 0 ? <p className="text-sm text-[#94A3B8] py-4 text-center">暂无迭代数据</p> : (() => {
                  const CHART_COLORS = { total: "#2563EB", completed: "#059669", rate: "#F59E0B", workload: "#8B5CF6", noTest: "#EC4899" };
                  const chartData = monthDetails.filter(d => d.month !== "未参与排期");
                  const totalAll = chartData.reduce((s, d) => s + d.total, 0);
                  const completedAll = chartData.reduce((s, d) => s + d.completed, 0);
                  const workloadAll = chartData.reduce((s, d) => s + d.totalWorkload, 0);
                  const noTestAll = chartData.reduce((s, d) => s + d.noTestCount, 0);
                  const terminatedAll = chartData.reduce((s, d) => s + d.terminatedCount, 0);
                  const sorted = [...chartData].sort((a, b) => {
                    const key = monthTableSortCol as keyof MonthDetail;
                    const va = a[key] ?? 0, vb = b[key] ?? 0;
                    const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
                    return monthTableSortAsc ? cmp : -cmp;
                  });
                  const toggleSort = (col: string) => { if (monthTableSortCol === col) setMonthTableSortAsc(!monthTableSortAsc); else { setMonthTableSortCol(col); setMonthTableSortAsc(true); } };
                  const SortIcon = ({ col }: { col: string }) => monthTableSortCol === col ? <span className="ml-0.5 text-[10px]">{monthTableSortAsc ? "▲" : "▼"}</span> : null;

                  return (
                  <div className="space-y-5">
                    {/* 可折叠月份概览卡片 */}
                    <Card className="shadow-sm border-[#E4ECFC]">
                      <CardHeader className="pb-1 cursor-pointer select-none" onClick={() => setMonthCardsCollapsed(!monthCardsCollapsed)}>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-semibold text-[#0F172A]">各迭代概览</CardTitle>
                          <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
                            <span>{monthDetails.length} 个迭代</span>
                            <ChevronDown className={`w-4 h-4 transition-transform ${monthCardsCollapsed ? "-rotate-90" : ""}`} />
                          </div>
                        </div>
                      </CardHeader>
                      {!monthCardsCollapsed && (
                        <CardContent className="pt-2">
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {monthDetails.map((md) => (
                              <div
                                key={md.month}
                                className="p-3 rounded-lg border border-[#E4ECFC] bg-white hover:shadow-md hover:border-[#2563EB]/20 cursor-pointer transition-all group"
                                onClick={() => setMonthlyMonthFilter(md.month)}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-sm font-bold text-[#0F172A]">{md.month}</span>
                                  <ChevronRight className="w-3.5 h-3.5 text-[#CBD5E1] group-hover:text-[#2563EB] transition-colors" />
                                </div>
                                <div className="flex items-center gap-3 mb-2">
                                  <div className="text-center">
                                    <p className="text-[10px] text-[#94A3B8]">总数</p>
                                    <p className="text-sm font-bold text-[#2563EB]">{md.total}</p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-[10px] text-[#94A3B8]">完成</p>
                                    <p className="text-sm font-bold text-[#059669]">{md.completed}</p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-[10px] text-[#94A3B8]">完成率</p>
                                    <p className="text-sm font-bold text-[#2563EB]">{md.completionRate}%</p>
                                  </div>
                                </div>
                                <div className="w-full h-1.5 bg-[#F1F5FD] rounded-full overflow-hidden mb-2">
                                  <div className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#059669] transition-all duration-500" style={{ width: `${md.completionRate}%` }} />
                                </div>
                                {md.topStatuses.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {md.topStatuses.slice(0, 3).map(s => (
                                      <span key={s.name} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px]"
                                        style={{ background: s.color + "18", color: s.color, border: `1px solid ${s.color}30` }}>
                                        {s.name} {s.count}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      )}
                    </Card>

                    {/* 组合图表：需求总数/已完成（柱状）+ 完成率（折线） — 排除"未参与排期" */}
                    <Card className="shadow-sm border-[#E4ECFC]">
                      <CardHeader className="pb-1">
                        <CardTitle className="text-sm font-semibold text-[#0F172A]">需求规模与产出对比</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-2">
                        <RechartResponsive width="100%" height={300}>
                          <RechartComposed data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                            <RechartCartesianGrid strokeDasharray="3 3" stroke="#E4ECFC" />
                            <RechartXAxis dataKey="month" tick={{ fontSize: 12, fill: "#64748B" }} />
                            <RechartYAxisLeft yAxisId="left" tick={{ fontSize: 11, fill: "#94A3B8" }} />
                            <RechartYAxisRight yAxisId="right" tick={{ fontSize: 11, fill: "#94A3B8" }} domain={[0, 100]} unit="%" />
                            <RechartTooltip contentStyle={{ fontSize: 12, borderColor: "#E4ECFC" }} />
                            <RechartLegend wrapperStyle={{ fontSize: 12 }} />
                            <RechartBar yAxisId="left" dataKey="total" name="需求总数" fill={CHART_COLORS.total} radius={[3, 3, 0, 0]} barSize={28} />
                            <RechartBar yAxisId="left" dataKey="completed" name="已完成" fill={CHART_COLORS.completed} radius={[3, 3, 0, 0]} barSize={28} />
                            <RechartLine yAxisId="right" type="monotone" dataKey="completionRate" name="完成率(%)" stroke={CHART_COLORS.rate} strokeWidth={2} dot={{ r: 4 }} label={{ position: "top", fontSize: 11, fill: CHART_COLORS.rate }} />
                          </RechartComposed>
                        </RechartResponsive>
                      </CardContent>
                    </Card>

                    {/* 工作量分布：柱状图（按总工作量降序）+ 环形图占比 */}
                    {(() => {
                      const wlData = [...chartData].filter(d => d.totalWorkload > 0).sort((a, b) => b.totalWorkload - a.totalWorkload);
                      const devAll = chartData.reduce((s, d) => s + d.devWorkload, 0);
                      const testAll = chartData.reduce((s, d) => s + d.testWorkload, 0);
                      return (
                      <div className="space-y-5">
                        {/* 柱状图：开发/测试并列 */}
                        <Card className="shadow-sm border-[#E4ECFC]">
                          <CardHeader className="pb-1">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <CardTitle className="text-sm font-semibold text-[#0F172A]">工作量对比（人/天）</CardTitle>
                              {workloadAll > 0 && <span className="text-xs text-[#94A3B8]">合计 {workloadAll.toFixed(1)} 人天（开发 {devAll.toFixed(1)} + 测试 {testAll.toFixed(1)}）</span>}
                            </div>
                          </CardHeader>
                          <CardContent className="pt-2">
                            {workloadAll > 0 ? (
                              <RechartResponsive width="100%" height={300}>
                                <RechartComposed data={wlData} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                                  <RechartCartesianGrid strokeDasharray="3 3" stroke="#E4ECFC" />
                                  <RechartXAxis dataKey="month" tick={{ fontSize: 12, fill: "#64748B" }} />
                                  <RechartYAxisLeft tick={{ fontSize: 11, fill: "#94A3B8" }} unit=" 天" />
                                  <RechartTooltip contentStyle={{ fontSize: 12, borderColor: "#E4ECFC" }} formatter={(v) => `${Number(v).toFixed(1)} 人天`} />
                                  <RechartLegend wrapperStyle={{ fontSize: 12 }} />
                                  <RechartBar dataKey="devWorkload" name="开发工作量" fill="#2563EB" radius={[3, 3, 0, 0]} barSize={28} label={{ position: "top", fontSize: 10, fill: "#2563EB", formatter: (v: unknown) => Number(v) > 0 ? Number(v).toFixed(1) : "" }} />
                                  <RechartBar dataKey="testWorkload" name="测试工作量" fill="#8B5CF6" radius={[3, 3, 0, 0]} barSize={28} label={{ position: "top", fontSize: 10, fill: "#8B5CF6", formatter: (v: unknown) => Number(v) > 0 ? Number(v).toFixed(1) : "" }} />
                                </RechartComposed>
                              </RechartResponsive>
                            ) : (
                              <div className="h-[300px] flex flex-col items-center justify-center text-[#94A3B8]">
                                <Layers className="w-8 h-8 mb-2 opacity-40" />
                                <p className="text-xs">暂无工作量数据</p>
                                <p className="text-[11px] mt-1">多维表格中添加"实际工作量"字段后自动展示</p>
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        {/* 开发/测试工作量占比：两个独立环形图 */}
                        {workloadAll > 0 && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <Card className="shadow-sm border-[#E4ECFC]">
                              <CardHeader className="pb-1">
                                <div className="flex items-center justify-between">
                                  <CardTitle className="text-sm font-semibold text-[#2563EB]">开发工作量占比</CardTitle>
                                  <span className="text-xs text-[#94A3B8]">合计 {devAll.toFixed(1)} 人天</span>
                                </div>
                              </CardHeader>
                              <CardContent className="pt-2">
                                {devAll > 0 ? (
                                  <RechartResponsive width="100%" height={220}>
                                    <RechartPie>
                                      <RechartPieShape data={wlData.filter(d => d.devWorkload > 0).map(d => ({ name: d.month, value: d.devWorkload }))}
                                        cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2} dataKey="value"
                                        label={({ name, percent }: PieLabelRenderProps) => { const p = ((Number(percent) || 0) * 100); return p >= 5 ? `${name ?? ""} ${p.toFixed(0)}%` : ""; }} labelLine={false}>
                                        {wlData.filter(d => d.devWorkload > 0).map((_, i) => (
                                          <RechartCell key={i} fill={["#2563EB", "#3B82F6", "#60A5FA", "#93C5FD", "#BFDBFE", "#1D4ED8"][i % 6]} />
                                        ))}
                                      </RechartPieShape>
                                      <RechartTooltip contentStyle={{ fontSize: 12, borderColor: "#E4ECFC" }} formatter={(v) => `${Number(v).toFixed(1)} 人天`} />
                                    </RechartPie>
                                  </RechartResponsive>
                                ) : (
                                  <div className="h-[220px] flex items-center justify-center text-xs text-[#94A3B8]">暂无开发工作量</div>
                                )}
                              </CardContent>
                            </Card>

                            <Card className="shadow-sm border-[#E4ECFC]">
                              <CardHeader className="pb-1">
                                <div className="flex items-center justify-between">
                                  <CardTitle className="text-sm font-semibold text-[#8B5CF6]">测试工作量占比</CardTitle>
                                  <span className="text-xs text-[#94A3B8]">合计 {testAll.toFixed(1)} 人天</span>
                                </div>
                              </CardHeader>
                              <CardContent className="pt-2">
                                {testAll > 0 ? (
                                  <RechartResponsive width="100%" height={220}>
                                    <RechartPie>
                                      <RechartPieShape data={wlData.filter(d => d.testWorkload > 0).map(d => ({ name: d.month, value: d.testWorkload }))}
                                        cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2} dataKey="value"
                                        label={({ name, percent }: PieLabelRenderProps) => { const p = ((Number(percent) || 0) * 100); return p >= 5 ? `${name ?? ""} ${p.toFixed(0)}%` : ""; }} labelLine={false}>
                                        {wlData.filter(d => d.testWorkload > 0).map((_, i) => (
                                          <RechartCell key={i} fill={["#8B5CF6", "#A78BFA", "#C4B5FD", "#DDD6FE", "#7C3AED", "#6D28D9"][i % 6]} />
                                        ))}
                                      </RechartPieShape>
                                      <RechartTooltip contentStyle={{ fontSize: 12, borderColor: "#E4ECFC" }} formatter={(v) => `${Number(v).toFixed(1)} 人天`} />
                                    </RechartPie>
                                  </RechartResponsive>
                                ) : (
                                  <div className="h-[220px] flex items-center justify-center text-xs text-[#94A3B8]">暂无测试工作量</div>
                                )}
                              </CardContent>
                            </Card>
                          </div>
                        )}
                      </div>
                      );
                    })()}

                    {/* 免测需求对比 — 排除"未参与排期" */}
                    <Card className="shadow-sm border-[#E4ECFC]">
                      <CardHeader className="pb-1">
                        <CardTitle className="text-sm font-semibold text-[#0F172A]">免测需求对比</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-2">
                        {noTestAll > 0 ? (
                          <RechartResponsive width="100%" height={220}>
                            <RechartComposed data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                              <RechartCartesianGrid strokeDasharray="3 3" stroke="#E4ECFC" />
                              <RechartXAxis dataKey="month" tick={{ fontSize: 12, fill: "#64748B" }} />
                              <RechartYAxisLeft yAxisId="left" tick={{ fontSize: 11, fill: "#94A3B8" }} />
                              <RechartYAxisRight yAxisId="right" tick={{ fontSize: 11, fill: "#94A3B8" }} domain={[0, 100]} unit="%" />
                              <RechartTooltip contentStyle={{ fontSize: 12, borderColor: "#E4ECFC" }} />
                              <RechartBar yAxisId="left" dataKey="noTestCount" name="免测需求数" fill={CHART_COLORS.noTest} radius={[3, 3, 0, 0]} barSize={32} />
                              <RechartLine yAxisId="right" type="monotone" dataKey="noTestRatio" name="免测比例(%)" stroke="#6366F1" strokeWidth={2} dot={{ r: 4 }} />
                            </RechartComposed>
                          </RechartResponsive>
                        ) : (
                          <div className="py-8 text-center text-[#94A3B8]">
                            <p className="text-xs">暂无免测数据</p>
                            <p className="text-[11px] mt-1">多维表格中添加"是否免测"字段后自动展示</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* 详细数据表格（包含全部月份含未参与排期） */}
                    <Card className="shadow-sm border-[#E4ECFC]">
                      <CardHeader className="pb-1">
                        <CardTitle className="text-sm font-semibold text-[#0F172A]">月度数据总表</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-2">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b-2 border-[#E4ECFC] bg-[#F8FAFC] text-left">
                                {[
                                  { key: "month", label: "月份" },
                                  { key: "total", label: "需求总数" },
                                  { key: "completed", label: "已完成" },
                                  { key: "pct", label: "完成率" },
                                  { key: "totalWorkload", label: "总工作量" },
                                  { key: "devWorkload", label: "开发工作量" },
                                  { key: "testWorkload", label: "测试工作量" },
                                  { key: "noTestCount", label: "免测数" },
                                  { key: "terminatedCount", label: "终止数" },
                                  { key: "milestoneCount", label: "里程碑" },
                                  { key: "riskCount", label: "风险" },
                                ].map(h => (
                                  <th key={h.key} className="py-2.5 px-3 font-semibold text-[#0F172A] whitespace-nowrap cursor-pointer hover:text-[#2563EB] select-none text-xs" onClick={() => toggleSort(h.key)}>
                                    {h.label}<SortIcon col={h.key} />
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {sorted.map((d, i) => {
                                const cRate = d.total > 0 ? Math.round(d.completed / d.total * 100) : 0;
                                return (
                                <tr key={d.month} className={`border-b border-[#F1F5FD] hover:bg-[#F8FAFC] transition-colors cursor-pointer ${i % 2 !== 0 ? "bg-[#FAFBFF]" : ""}`} onClick={() => setMonthlyMonthFilter(d.month)}>
                                  <td className="py-2.5 px-3 font-medium text-[#0F172A] text-xs">{d.month}</td>
                                  <td className="py-2.5 px-3 text-xs">{d.total}</td>
                                  <td className="py-2.5 px-3 text-xs text-[#059669] font-medium">{d.completed}</td>
                                  <td className="py-2.5 px-3 text-xs">
                                    <div className="flex items-center gap-2">
                                      <div className="w-16 h-1.5 bg-[#F1F5FD] rounded-full overflow-hidden">
                                        <div className="h-full rounded-full bg-[#2563EB]" style={{ width: `${cRate}%` }} />
                                      </div>
                                      <span className="text-[#2563EB] font-medium">{cRate}%</span>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 text-xs text-[#64748B]">{d.totalWorkload > 0 ? d.totalWorkload.toFixed(1) : "—"}</td>
                                  <td className="py-2.5 px-3 text-xs text-[#2563EB]">{d.devWorkload > 0 ? d.devWorkload.toFixed(1) : "—"}</td>
                                  <td className="py-2.5 px-3 text-xs text-[#8B5CF6]">{d.testWorkload > 0 ? d.testWorkload.toFixed(1) : "—"}</td>
                                  <td className="py-2.5 px-3 text-xs text-[#64748B]">{d.noTestCount || "—"}</td>
                                  <td className="py-2.5 px-3 text-xs text-[#64748B]">{d.terminatedCount || "—"}</td>
                                  <td className="py-2.5 px-3 text-xs text-[#64748B]">{d.milestoneCount}</td>
                                  <td className="py-2.5 px-3 text-xs text-[#64748B]">{d.riskCount}</td>
                                </tr>
                                );
                              })}
                              <tr className="border-t-2 border-[#E4ECFC] bg-[#F8FAFC] font-semibold">
                                <td className="py-2.5 px-3 text-xs text-[#0F172A]">合计</td>
                                <td className="py-2.5 px-3 text-xs">{totalAll}</td>
                                <td className="py-2.5 px-3 text-xs text-[#059669]">{completedAll}</td>
                                <td className="py-2.5 px-3 text-xs">
                                  <div className="flex items-center gap-2">
                                    <div className="w-16 h-1.5 bg-[#F1F5FD] rounded-full overflow-hidden">
                                      <div className="h-full rounded-full bg-[#2563EB]" style={{ width: `${totalAll > 0 ? Math.round(completedAll / totalAll * 100) : 0}%` }} />
                                    </div>
                                    <span className="text-[#2563EB]">{totalAll > 0 ? Math.round(completedAll / totalAll * 100) : 0}%</span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-xs text-[#64748B]">{workloadAll > 0 ? workloadAll.toFixed(1) : "—"}</td>
                                <td className="py-2.5 px-3 text-xs text-[#2563EB]">{chartData.reduce((s, d) => s + d.devWorkload, 0) > 0 ? chartData.reduce((s, d) => s + d.devWorkload, 0).toFixed(1) : "—"}</td>
                                <td className="py-2.5 px-3 text-xs text-[#8B5CF6]">{chartData.reduce((s, d) => s + d.testWorkload, 0) > 0 ? chartData.reduce((s, d) => s + d.testWorkload, 0).toFixed(1) : "—"}</td>
                                <td className="py-2.5 px-3 text-xs text-[#64748B]">{noTestAll || "—"}</td>
                                <td className="py-2.5 px-3 text-xs text-[#64748B]">{terminatedAll || "—"}</td>
                                <td className="py-2.5 px-3 text-xs text-[#64748B]">{chartData.reduce((s, d) => s + d.milestoneCount, 0)}</td>
                                <td className="py-2.5 px-3 text-xs text-[#64748B]">{chartData.reduce((s, d) => s + d.riskCount, 0)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                  );
                })()
              ) : (() => {
                /* === 单月详情视图 === */
                const md = monthDetails.find(d => d.month === monthlyMonthFilter);
                if (!md) return <p className="text-sm text-[#94A3B8] py-4 text-center">该月份暂无迭代数据</p>;
                const allStatuses = Object.entries(stats.byMonth[md.month]?.statuses || {}).sort(([, a], [, b]) => b - a);
                const statusMax = Math.max(...allStatuses.map(([, c]) => c), 1);
                const monthMilestones = milestones.filter(m => m.month === md.month).sort((a, b) => (a.eventDate || "zzzz").localeCompare(b.eventDate || "zzzz"));
                const monthRisks = risks.filter(r => r.iteration === md.month);
                const monthReqs = requirements.filter(r => getMonth(r) === md.month).sort((a, b) => b.modTime.localeCompare(a.modTime));
                return (
                  <div className="space-y-6">
                    {/* 核心指标卡片 */}
                    {(() => {
                      const doneMilCount = monthMilestones.filter(m => m.status === "已完成" || m.status.includes("已完成") || m.status.includes("正常") || (m.hasActual && m.delayDays > 0)).length;
                      const activeRiskCount = monthRisks.filter(r => !r.status.includes("解除") && !r.status.includes("关闭") && !r.status.includes("已关闭")).length;
                      return (
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                      <Card className="shadow-sm border-[#E4ECFC] hover:shadow-md hover:border-[#2563EB]/30 cursor-pointer transition-all"
                        onClick={() => { setSelectedIterations([md.month]); setFilterTag(null); setSelectedStatuses([]); setSelectedOwners([]); setSearchText(""); setTab(TAB_LIST); }}>
                        <CardContent className="p-4 text-center">
                          <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider">需求总数</p>
                          <p className="text-3xl font-bold text-[#2563EB] mt-1">{md.total}</p>
                          <p className="text-xs text-[#94A3B8] mt-0.5">点击查看</p>
                        </CardContent>
                      </Card>
                      <Card className="shadow-sm border-[#E4ECFC] hover:shadow-md hover:border-emerald-300 cursor-pointer transition-all"
                        onClick={() => { setSelectedIterations([md.month]); setFilterTag("completed"); setSelectedStatuses([]); setSelectedOwners([]); setSearchText(""); setTab(TAB_LIST); }}>
                        <CardContent className="p-4 text-center">
                          <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider">已完成</p>
                          <p className="text-3xl font-bold text-[#059669] mt-1">{md.completed}</p>
                          <p className="text-xs text-[#94A3B8] mt-0.5">点击查看</p>
                        </CardContent>
                      </Card>
                      <Card className="shadow-sm border-[#E4ECFC]">
                        <CardContent className="p-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider">进度</p>
                            <Popover>
                              <PopoverTrigger
                                render={<button type="button" className="inline-flex items-center justify-center rounded-full p-0.5 hover:bg-[#F1F5FD] transition-colors">
                                  <Info className="w-3.5 h-3.5 text-[#CBD5E1] hover:text-[#94A3B8]" />
                                </button>}
                              />
                              <PopoverContent className="bg-white text-[#0F172A] border border-[#E4ECFC] shadow-lg p-0 min-w-[340px]" side="bottom" align="start">
                                <div className="px-3 pt-3 pb-2 border-b border-[#E4ECFC]">
                                  <p className="text-xs font-semibold">进度权重说明</p>
                                  <p className="text-[11px] text-[#94A3B8] mt-0.5">完成进度 = 所有需求按状态加权平均</p>
                                </div>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-y border-[#E4ECFC] bg-[#F8FAFC]">
                                      <th className="py-1.5 px-3 text-left font-medium text-[#64748B]">阶段</th>
                                      <th className="py-1.5 px-2 text-center font-medium text-[#64748B]">权重</th>
                                      <th className="py-1.5 px-3 text-center font-medium text-[#64748B]">累计进度</th>
                                    </tr>
                                  </thead>
                                  <tbody className="text-[#64748B]">
                                    {[
                                      ["未开始 / 待排期","0%","0%"],
                                      ["需求立项中","6%","6%"],
                                      ["需求分析中","9%","15%"],
                                      ["开发方案设计中（含Open API设计）","8%","23%"],
                                      ["开发中","45%","68%"],
                                      ["测试中","12%","80%"],
                                      ["验收中","5%","85%"],
                                      ["待合并","3%","88%"],
                                      ["版本测试中","5%","93%"],
                                      ["灰度发布","3%","96%"],
                                      ["已发布","4%","100%"],
                                      ["需求终止","0%","0%"],
                                    ].map(([s,w,p],i) => (
                                      <tr key={s} className={i % 2 === 0 ? "bg-white" : "bg-[#FAFBFF]"}>
                                        <td className="py-1 px-3">{s}</td>
                                        <td className="py-1 px-2 text-center">{w}</td>
                                        <td className="py-1 px-3 text-center font-medium text-[#2563EB]">{p}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </PopoverContent>
                            </Popover>
                          </div>
                          <p className="text-3xl font-bold text-[#2563EB] mt-1">{md.pct}%</p>
                        </CardContent>
                      </Card>
                      <Card className="shadow-sm border-[#E4ECFC]">
                        <CardContent className="p-4 text-center">
                          <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider">里程碑完成</p>
                          <p className="text-3xl font-bold text-[#8B5CF6] mt-1">{doneMilCount}</p>
                          <p className="text-xs text-[#94A3B8] mt-0.5">本期共 {monthMilestones.length} 项</p>
                        </CardContent>
                      </Card>
                      <Card className="shadow-sm border-[#E4ECFC]">
                        <CardContent className="p-4 text-center">
                          <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider">未关闭风险</p>
                          <p className="text-3xl font-bold text-[#DC2626] mt-1">{activeRiskCount}</p>
                          <p className="text-xs text-[#94A3B8] mt-0.5">本期共 {monthRisks.length} 项</p>
                        </CardContent>
                      </Card>
                    </div>
                      );
                    })()}

                    {/* 状态分布：饼状图 + 数值表格 */}
                    <Card className="shadow-sm border-[#E4ECFC]">
                      <CardHeader className="pb-2"><CardTitle className="text-base font-semibold text-[#0F172A]">状态分布</CardTitle></CardHeader>
                      <CardContent>
                        {(() => {
                          const pieR = 80;
                          const pieSize = pieR * 2 + 20;
                          const pieCx = pieSize / 2;
                          const pieCy = pieSize / 2;
                          const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;
                          const pol = (cx: number, cy: number, r: number, deg: number) => ({ x: cx + r * Math.cos(toRad(deg)), y: cy + r * Math.sin(toRad(deg)) });

                          let cum = 0;
                          const segments = allStatuses.map(([name, count], i) => {
                            const pct = md.total > 0 ? count / md.total : 0;
                            const angle = pct * 360;
                            const startAngle = cum;
                            cum += angle;
                            return { name, count, pct, angle, startAngle, endAngle: cum, color: STATUS_COLORS[i % STATUS_COLORS.length] };
                          });

                          return (
                            <div className="flex flex-col lg:flex-row items-start gap-6">
                              {/* 饼状图 */}
                              <div className="relative shrink-0" style={{ width: pieSize, height: pieSize }}>
                                <svg width={pieSize} height={pieSize} viewBox={`0 0 ${pieSize} ${pieSize}`}>
                                  {segments.map(seg => {
                                    if (seg.angle <= 0) return null;
                                    const isHovered = hoveredPie === seg.name;
                                    const scale = isHovered ? 1.045 : 1;
                                    if (seg.angle >= 359.99) {
                                      return (
                                        <circle key={seg.name} cx={pieCx} cy={pieCy} r={pieR} fill={seg.color}
                                          opacity={hoveredPie && !isHovered ? 0.5 : 0.85}
                                          className="transition-all duration-200 cursor-pointer"
                                          style={{ transform: `scale(${scale})`, transformOrigin: `${pieCx}px ${pieCy}px` }}
                                          onMouseEnter={() => setHoveredPie(seg.name)}
                                          onMouseLeave={() => setHoveredPie(null)}
                                          onClick={() => { setSelectedStatuses([seg.name]); setSelectedIterations([md.month]); setFilterTag(null); setSearchText(""); setTab(TAB_LIST); }}
                                        />
                                      );
                                    }
                                    const s = pol(pieCx, pieCy, pieR, seg.startAngle);
                                    const e = pol(pieCx, pieCy, pieR, seg.endAngle);
                                    const large = seg.angle > 180 ? 1 : 0;
                                    const d = `M ${pieCx} ${pieCy} L ${s.x} ${s.y} A ${pieR} ${pieR} 0 ${large} 1 ${e.x} ${e.y} Z`;
                                    return (
                                      <path key={seg.name} d={d} fill={seg.color}
                                        opacity={hoveredPie && !isHovered ? 0.5 : 0.85}
                                        className="transition-all duration-200 cursor-pointer"
                                        style={{ transform: `scale(${scale})`, transformOrigin: `${pieCx}px ${pieCy}px` }}
                                        onMouseEnter={() => setHoveredPie(seg.name)}
                                        onMouseLeave={() => setHoveredPie(null)}
                                        onClick={() => { setSelectedStatuses([seg.name]); setSelectedIterations([md.month]); setFilterTag(null); setSearchText(""); setTab(TAB_LIST); }}
                                      />
                                    );
                                  })}
                                </svg>
                                {hoveredPie && (() => {
                                  const seg = segments.find(s => s.name === hoveredPie);
                                  if (!seg) return null;
                                  return (
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none bg-[#0F172A] text-white px-3 py-1.5 rounded-lg shadow-lg text-xs whitespace-nowrap z-10">
                                      <span className="font-semibold">{seg.name}</span>：{seg.count} 条 ({Math.round(seg.pct * 100)}%)
                                    </div>
                                  );
                                })()}
                              </div>
                              {/* 数值表格 */}
                              <div className="flex-1 min-w-0 w-full">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b-2 border-[#E4ECFC] text-left">
                                      <th className="py-2 px-2 font-semibold text-[#0F172A] text-xs">状态</th>
                                      <th className="py-2 px-2 font-semibold text-[#0F172A] text-xs text-right">数量</th>
                                      <th className="py-2 px-2 font-semibold text-[#0F172A] text-xs text-right">占比</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {segments.map((seg, i) => (
                                      <tr key={seg.name}
                                        className={`border-b border-[#F1F5FD] cursor-pointer transition-colors ${hoveredPie === seg.name ? "bg-[#F1F5FD]" : i % 2 === 0 ? "" : "bg-[#FAFBFF]"}`}
                                        onMouseEnter={() => setHoveredPie(seg.name)}
                                        onMouseLeave={() => setHoveredPie(null)}
                                        onClick={() => { setSelectedStatuses([seg.name]); setSelectedIterations([md.month]); setFilterTag(null); setSearchText(""); setTab(TAB_LIST); }}>
                                        <td className="py-2 px-2 text-xs flex items-center gap-2">
                                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: seg.color }} />
                                          {seg.name}
                                        </td>
                                        <td className="py-2 px-2 text-xs text-right font-medium text-[#0F172A]">{seg.count}</td>
                                        <td className="py-2 px-2 text-xs text-right text-[#64748B]">{Math.round(seg.pct * 100)}%</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr className="border-t-2 border-[#E4ECFC]">
                                      <td className="py-2 px-2 text-xs font-semibold text-[#0F172A]">合计</td>
                                      <td className="py-2 px-2 text-xs text-right font-bold text-[#2563EB]">{md.total}</td>
                                      <td className="py-2 px-2 text-xs text-right text-[#64748B]">100%</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            </div>
                          );
                        })()}
                      </CardContent>
                    </Card>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* 里程碑进展 */}
                      {(() => {
                        const isMileDone = (m: MilestoneRow) => m.status === "已完成" || m.status.includes("已完成") || m.status.includes("正常") || (m.hasActual && m.delayDays > 0);
                        const activeMiles = monthMilestones.filter(m => !isMileDone(m));
                        const doneMiles = monthMilestones.filter(m => isMileDone(m));
                        const nextMile = activeMiles.find(m => m.eventDate && m.daysLeft >= 0);
                        return (
                      <Card className="shadow-sm border-[#E4ECFC]">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base font-semibold text-[#0F172A] flex items-center gap-2 flex-wrap">
                            <Milestone className="w-4 h-4 text-[#8B5CF6]" />里程碑进展
                            <Badge className="bg-emerald-50 text-emerald-600 border-emerald-200 font-normal">{doneMiles.length}/{monthMilestones.length} 已完成</Badge>
                          </CardTitle>
                          {nextMile && (
                            <p className="text-xs text-[#64748B] mt-1 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-[#2563EB]" />
                              下一节点：<span className="font-medium text-[#0F172A]">{nextMile.name}</span>
                              <span className="text-[#94A3B8]">（{nextMile.eventDate}，剩余 {nextMile.daysLeft} 工作日）</span>
                            </p>
                          )}
                        </CardHeader>
                        <CardContent>
                          {monthMilestones.length === 0 ? (
                            <p className="text-sm text-[#94A3B8] py-6 text-center">该月暂无里程碑</p>
                          ) : (
                            <div className="space-y-2">
                              {activeMiles.map(m => {
                                const isOverdue = m.delayDays > 0;
                                return (
                                  <div key={`${m.id}-${m.month}`} className={`p-3 rounded-lg border transition-colors ${isOverdue ? "border-red-200 bg-red-50/30" : "border-[#E4ECFC] bg-white"}`}>
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-[#0F172A] truncate">{m.name}</p>
                                        <div className="flex items-center gap-2 mt-1 text-xs text-[#94A3B8] flex-wrap">
                                          {m.eventDate && <span className="flex items-center gap-0.5"><Calendar className="w-3 h-3" />{m.eventDate}</span>}
                                          {m.daysLeft > 0 && <span className="text-[#059669] font-medium">剩余 {m.daysLeft} 工作日</span>}
                                          {m.delayDays > 0 && <span className="text-[#DC2626] font-medium">{m.hasActual ? `延期 ${m.delayDays} 工作日完成` : `已延期 ${m.delayDays} 工作日`}</span>}
                                        </div>
                                      </div>
                                      {isOverdue ? <Badge className="bg-red-50 text-red-600 border-red-200 text-xs font-normal shrink-0">{m.hasActual ? "延期完成" : "延期中"}</Badge>
                                        : <Badge className="bg-blue-50 text-blue-600 border-blue-200 text-xs font-normal shrink-0">进行中</Badge>}
                                    </div>
                                  </div>
                                );
                              })}
                              {doneMiles.length > 0 && (
                                <div className="pt-1">
                                  <button
                                    type="button"
                                    onClick={() => setMilestoneCompletedExpanded(!milestoneCompletedExpanded)}
                                    className="flex items-center gap-1.5 w-full py-2 px-1 text-xs font-medium text-[#94A3B8] hover:text-[#64748B] transition-colors rounded-md hover:bg-[#F8FAFC]"
                                  >
                                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${milestoneCompletedExpanded ? "rotate-0" : "-rotate-90"}`} />
                                    已完成 ({doneMiles.length} 项)
                                  </button>
                                  {milestoneCompletedExpanded && (
                                    <div className="space-y-2 mt-1">
                                      {doneMiles.map(m => {
                                        const isDelayed = m.hasActual && m.delayDays > 0;
                                        return (
                                        <div key={`${m.id}-${m.month}`} className={`p-3 rounded-lg border transition-colors ${isDelayed ? "border-amber-200 bg-amber-50/30" : "border-emerald-200 bg-emerald-50/30"}`}>
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                              <p className="text-sm font-medium text-[#0F172A] truncate">{m.name}</p>
                                              <div className="flex items-center gap-2 mt-1 text-xs text-[#94A3B8] flex-wrap">
                                                {m.eventDate && <span className="flex items-center gap-0.5"><Calendar className="w-3 h-3" />{m.eventDate}</span>}
                                                {isDelayed && <span className="text-amber-600 font-medium">延期 {m.delayDays} 工作日完成</span>}
                                                {m.note && <span className="text-emerald-600">{m.note}</span>}
                                              </div>
                                            </div>
                                            {isDelayed
                                              ? <Badge className="bg-amber-50 text-amber-600 border-amber-200 text-xs font-normal shrink-0">延期完成</Badge>
                                              : <Badge className="bg-emerald-50 text-emerald-600 border-emerald-200 text-xs font-normal shrink-0">已完成</Badge>}
                                          </div>
                                        </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                        );
                      })()}

                      {/* 风险跟踪 */}
                      <Card className="shadow-sm border-[#E4ECFC]">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base font-semibold text-[#0F172A] flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-[#DC2626]" />风险跟踪
                            <Badge className="bg-red-50 text-red-600 border-red-200 font-normal">{monthRisks.length} 项</Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {monthRisks.length === 0 ? (
                            <p className="text-sm text-[#94A3B8] py-6 text-center">该月暂无风险项</p>
                          ) : (
                            <div className="space-y-2">
                              {monthRisks.map(r => (
                                <div key={r.id} className={`p-3 rounded-lg border transition-colors ${r.status.includes("解除") || r.status.includes("关闭") ? "border-[#E4ECFC] bg-[#F8FAFC]" : "border-red-200 bg-red-50/30"}`}>
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm text-[#0F172A] line-clamp-2">{r.title}</p>
                                      <div className="flex items-center gap-2 mt-1 text-xs text-[#94A3B8] flex-wrap">
                                        {r.date && <span>{r.date}</span>}
                                        {r.product && <span>· {r.product}</span>}
                                        {r.strategy && <span className="text-[#92400E]">策略: {r.strategy}</span>}
                                      </div>
                                    </div>
                                    <Badge className={`text-xs font-normal border shrink-0 ${sc(r.status)}`}>{r.status}</Badge>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>

                    {/* 需求列表 */}
                    <Card className="shadow-sm border-[#E4ECFC]">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base font-semibold text-[#0F172A] flex items-center gap-2">
                            <ListChecks className="w-4 h-4 text-[#2563EB]" />需求列表
                            <Badge className="bg-[#F1F5FD] text-[#2563EB] border-none font-normal">{monthReqs.length} 条</Badge>
                          </CardTitle>
                          {monthReqs.length > 10 && (
                            <button className="text-xs text-[#2563EB] hover:text-[#1D4ED8] flex items-center gap-1 transition-colors"
                              onClick={() => { setSelectedIterations([md.month]); setFilterTag(null); setSearchText(""); setTab(TAB_LIST); }}>
                              查看全部 <ChevronRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b-2 border-[#E4ECFC] bg-[#F8FAFC] text-left">
                                {["ONES ID", "标题", "状态", "优先级", "提测时间", "开发负责人", "测试负责人"].map(h => (
                                  <th key={h} className="py-2.5 px-3 font-semibold text-[#0F172A] whitespace-nowrap text-xs">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {monthReqs.slice(0, 10).map((r, i) => (
                                <tr key={r.id} className={`border-b border-[#F1F5FD] hover:bg-[#F8FAFC] transition-colors ${i % 2 === 0 ? "" : "bg-[#FAFBFF]"}`}>
                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    {r.onesUrl ? (
                                      <a href={r.onesUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#2563EB] hover:underline text-xs font-medium">
                                        {r.onesId || "查看"} <ExternalLink className="w-3 h-3" />
                                      </a>
                                    ) : <span className="text-[#94A3B8] text-xs">-</span>}
                                  </td>
                                  <td className="py-2.5 px-3 text-[#0F172A] max-w-[200px] truncate text-xs" title={r.title}>{r.title || "-"}</td>
                                  <td className="py-2.5 px-3 whitespace-nowrap"><Badge className={`text-xs font-normal border ${sc(r.status)}`}>{r.status || "-"}</Badge></td>
                                  <td className="py-2.5 px-3 text-[#64748B] whitespace-nowrap text-xs">{r.level || "-"}</td>
                                  <td className="py-2.5 px-3 text-[#64748B] whitespace-nowrap text-xs">{r.testDate || "-"}</td>
                                  <td className="py-2.5 px-3 text-[#64748B] whitespace-nowrap text-xs">{r.devOwner || "-"}</td>
                                  <td className="py-2.5 px-3 text-[#64748B] whitespace-nowrap text-xs">{r.testOwner || "-"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {monthReqs.length > 10 && (
                            <div className="text-center py-3 border-t border-[#F1F5FD]">
                              <button className="text-xs text-[#2563EB] hover:text-[#1D4ED8] transition-colors"
                                onClick={() => { setSelectedIterations([md.month]); setFilterTag(null); setSearchText(""); setTab(TAB_LIST); }}>
                                还有 {monthReqs.length - 10} 条，点击查看全部 →
                              </button>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ============ TAB 3: 需求列表 ============ */}
          {tab === TAB_LIST && (
            <Card className="shadow-sm border-[#E4ECFC]">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <CardTitle className="text-base font-semibold text-[#0F172A] flex items-center gap-2">
                    需求列表
                    <Badge className="bg-[#F1F5FD] text-[#2563EB] border-none font-normal">
                      {filteredReqs.length}{filterTag ? ` / ${requirements.length}` : ""} 条
                    </Badge>
                  </CardTitle>
                </div>
                {/* 筛选栏 */}
                <div className="flex items-center gap-3 mt-3 flex-wrap">
                  <MultiSelect allLabel="全部排期月度" options={allIterations.map(v => ({ value: v, label: v }))} value={selectedIterations} onChange={setSelectedIterations} />
                  <MultiSelect allLabel="全部状态" options={allStatuses.map(v => ({ value: v, label: v }))} value={selectedStatuses} onChange={setSelectedStatuses} />
                  <MultiSelect allLabel="全部负责人" options={allOwners.map(v => ({ value: v, label: v }))} value={selectedOwners} onChange={setSelectedOwners} />
                  <div className="relative flex-1 min-w-[220px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                    <Input
                      placeholder="搜标题/ONES ID/状态/项目/负责人/迭代/优先级"
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      className="pl-9 h-9 text-sm border-[#E4ECFC]"
                    />
                    {searchText && (
                      <button onClick={() => setSearchText("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                        <X className="w-4 h-4 text-[#94A3B8] hover:text-[#64748B]" />
                      </button>
                    )}
                  </div>
                  {filterTag && (
                    <Badge className="h-8 gap-1 cursor-pointer bg-[#F1F5FD] text-[#2563EB] border-[#2563EB]/20"
                      onClick={() => { setFilterTag(null); setSelectedIterations([]); setSelectedStatuses([]); setSearchText(""); }}>
                      {filterTag === "completed" ? "已完成" : filterTag === "risk" ? "风险关联" : ""}
                      <X className="w-3 h-3" />
                    </Badge>
                  )}
                  <button
                    type="button"
                    onClick={handleExportExcel}
                    disabled={exportingExcel || loading || filteredReqs.length === 0}
                    className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    <Download className={`w-4 h-4 ${exportingExcel ? "animate-pulse" : ""}`} />
                    {exportingExcel ? "导出中..." : "导出 Excel"}
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
                ) : filteredReqs.length === 0 ? (
                  <div className="text-center py-12 text-[#94A3B8]">
                    <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">没有匹配的需求</p>
                  </div>
                ) : (
                  <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-[#E4ECFC] bg-[#F8FAFC] text-left">
                          {["ONES ID","标题","状态","优先级","所属项目","提测时间","开发负责人","测试负责人"].map(h => (
                            <th key={h} className="py-3 px-4 font-semibold text-[#0F172A] whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedReqs.map((r, i) => {
                          const isRiskRelated = !!(r.onesId && riskOnesIdSet.has(r.onesId));
                          return (
                          <tr key={r.id} className={`border-b transition-colors ${isRiskRelated ? "bg-red-50/60 border-red-100 hover:bg-red-50" : i % 2 === 0 ? "border-[#F1F5FD] hover:bg-[#F8FAFC]" : "bg-[#FAFBFF] border-[#F1F5FD] hover:bg-[#F8FAFC]"}`}>
                            <td className="py-3 px-4 whitespace-nowrap">
                              {r.onesUrl ? (
                                <a href={r.onesUrl} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[#2563EB] hover:text-[#1D4ED8] hover:underline text-xs font-medium"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {r.onesId || "查看"} <ExternalLink className="w-3 h-3" />
                                </a>
                              ) : (
                                <span className="text-[#94A3B8] text-xs">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-[#0F172A] max-w-xs truncate" title={r.title}>{r.title || "-"}</td>
                            <td className="py-3 px-4 whitespace-nowrap"><Badge className={`text-xs font-normal border ${sc(r.status)}`}>{r.status || "-"}</Badge></td>
                            <td className="py-3 px-4 text-[#64748B] whitespace-nowrap text-xs">{r.level || "-"}</td>
                            <td className="py-3 px-4 text-[#0F172A] whitespace-nowrap text-xs max-w-[120px] truncate" title={r.project}>{r.project || "-"}</td>
                            <td className="py-3 px-4 text-[#64748B] whitespace-nowrap text-xs">{r.testDate || "-"}</td>
                            <td className="py-3 px-4 text-[#64748B] whitespace-nowrap text-xs">{r.devOwner || "-"}</td>
                            <td className="py-3 px-4 text-[#64748B] whitespace-nowrap text-xs">{r.testOwner || "-"}</td>
                            {isRiskRelated && <td className="py-3 px-1 whitespace-nowrap"><AlertTriangle className="w-3.5 h-3.5 text-[#DC2626]" /></td>}
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {reqTotalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-[#F1F5FD]">
                      <span className="text-xs text-[#94A3B8]">共 {filteredReqs.length} 条，第 {safeReqPage + 1}/{reqTotalPages} 页</span>
                      <div className="flex items-center gap-1">
                        <button disabled={safeReqPage === 0} onClick={() => setReqPage(0)} className="h-8 px-2 text-xs rounded border border-[#E4ECFC] text-[#64748B] hover:bg-[#F8FAFC] disabled:opacity-40 disabled:cursor-not-allowed">首页</button>
                        <button disabled={safeReqPage === 0} onClick={() => setReqPage(p => Math.max(0, p - 1))} className="h-8 px-2 text-xs rounded border border-[#E4ECFC] text-[#64748B] hover:bg-[#F8FAFC] disabled:opacity-40 disabled:cursor-not-allowed">上一页</button>
                        <button disabled={safeReqPage >= reqTotalPages - 1} onClick={() => setReqPage(p => Math.min(reqTotalPages - 1, p + 1))} className="h-8 px-2 text-xs rounded border border-[#E4ECFC] text-[#64748B] hover:bg-[#F8FAFC] disabled:opacity-40 disabled:cursor-not-allowed">下一页</button>
                        <button disabled={safeReqPage >= reqTotalPages - 1} onClick={() => setReqPage(reqTotalPages - 1)} className="h-8 px-2 text-xs rounded border border-[#E4ECFC] text-[#64748B] hover:bg-[#F8FAFC] disabled:opacity-40 disabled:cursor-not-allowed">末页</button>
                      </div>
                    </div>
                  )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* ============ TAB 4: 里程碑 ============ */}
          {tab === TAB_MILESTONE && (
            <div className="space-y-4">
              {/* 顶部工具栏 */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium text-[#0F172A]">迭代月份：</span>
                <Select value={milestoneMonth} onValueChange={(val) => { setMilestoneMonth(val as string); setMilestoneSearchText(""); setMilestoneQuickFilter("全部"); }}>
                  <SelectTrigger className="w-[140px] border-[#E4ECFC]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="全部">全部</SelectItem>
                    {milestoneMonths.map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {milestoneMonth === "全部" ? (
                  <>
                    <Select value={milestoneQuickFilter} onValueChange={(val) => { if (val) setMilestoneQuickFilter(val); }}>
                      <SelectTrigger className="w-[110px] border-[#E4ECFC] ml-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="全部">全部</SelectItem>
                        <SelectItem value="近7天">近7天</SelectItem>
                        <SelectItem value="待完成">待完成</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="relative ml-auto min-w-[180px]">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94A3B8]" />
                      <Input placeholder="搜索里程碑名称" value={milestoneSearchText} onChange={(e) => setMilestoneSearchText(e.target.value)} className="pl-8 h-8 text-xs border-[#E4ECFC]" />
                      {milestoneSearchText && <button onClick={() => setMilestoneSearchText("")} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="w-3.5 h-3.5 text-[#94A3B8] hover:text-[#64748B]" /></button>}
                    </div>
                  </>
                ) : (
                  <Badge className="bg-[#F1F5FD] text-[#2563EB] border-none font-normal ml-auto">{filteredMilestones.length} 项</Badge>
                )}
              </div>

              {milestoneMonth === "全部" ? (
                /* === 全部：时间视图 === */
                loading ? <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div> : (() => {
                  const today = new Date(); today.setHours(0, 0, 0, 0);
                  const todayTime = today.getTime();
                  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
                  const tomorrowTime = tomorrow.getTime();
                  const endOfWeek = new Date(today); endOfWeek.setDate(today.getDate() + (today.getDay() === 0 ? 0 : 7 - today.getDay()));
                  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                  const weekNames = ["日", "一", "二", "三", "四", "五", "六"];
                  const fmtD = (d: Date) => `${d.getMonth() + 1}月${d.getDate()}日 周${weekNames[d.getDay()]}`;

                  const mileStatus = (m: MilestoneRow) => {
                    const isDone = m.status.includes("已完成") || m.status.includes("正常") || m.hasActual;
                    if (isDone) return { label: "已完成", cls: "bg-emerald-50 text-emerald-600 border-emerald-200", pri: 3 };
                    const d = parseDate(m.eventDate);
                    if (d && d.getTime() < todayTime) return { label: "已逾期", cls: "bg-red-50 text-red-600 border-red-200", pri: 0 };
                    if (m.status.includes("进行") || m.status.includes("开发") || m.status.includes("测试")) return { label: "进行中", cls: "bg-blue-50 text-blue-600 border-blue-200", pri: 1 };
                    return { label: "待开始", cls: "bg-amber-50 text-amber-600 border-amber-200", pri: 2 };
                  };

                  let all = milestones.filter(m => m.eventDate);
                  if (milestoneSearchText.trim()) {
                    const q = milestoneSearchText.trim().toLowerCase();
                    all = all.filter(m => m.name.toLowerCase().includes(q));
                  }
                  if (milestoneQuickFilter === "近7天") {
                    const d7 = new Date(today); d7.setDate(d7.getDate() + 7);
                    all = all.filter(m => { const s = mileStatus(m); const d = parseDate(m.eventDate); return s.label === "已逾期" || (d && d.getTime() >= todayTime && d.getTime() <= d7.getTime()); });
                  } else if (milestoneQuickFilter === "待完成") {
                    all = all.filter(m => mileStatus(m).label !== "已完成");
                  }

                  type MileItem = MilestoneRow & { ds: ReturnType<typeof mileStatus> };
                  const groups: { key: string; label: string; defOpen: boolean; items: MileItem[] }[] = [
                    { key: "overdue", label: "已逾期", defOpen: true, items: [] },
                    { key: "today", label: `今日 · ${fmtD(today)}`, defOpen: true, items: [] },
                    { key: "tomorrow", label: `明日 · ${fmtD(tomorrow)}`, defOpen: true, items: [] },
                    { key: "thisWeek", label: "本周剩余", defOpen: true, items: [] },
                    { key: "thisMonth", label: "本月剩余", defOpen: false, items: [] },
                    { key: "later", label: "下月及以后", defOpen: false, items: [] },
                    { key: "done", label: "已完成", defOpen: false, items: [] },
                  ];

                  all.forEach(m => {
                    const ds = mileStatus(m);
                    const item: MileItem = { ...m, ds };
                    if (ds.label === "已完成") { groups[6].items.push(item); return; }
                    const d = parseDate(m.eventDate);
                    if (!d) { groups[5].items.push(item); return; }
                    const t = d.getTime();
                    if (t < todayTime) { groups[0].items.push(item); return; }
                    if (t === todayTime) { groups[1].items.push(item); return; }
                    if (t === tomorrowTime) { groups[2].items.push(item); return; }
                    if (t <= endOfWeek.getTime()) { groups[3].items.push(item); return; }
                    if (t <= endOfMonth.getTime()) { groups[4].items.push(item); return; }
                    groups[5].items.push(item);
                  });

                  groups.forEach(g => g.items.sort((a, b) => a.ds.pri !== b.ds.pri ? a.ds.pri - b.ds.pri : (a.eventDate || "").localeCompare(b.eventDate || "")));

                  const isOpen = (k: string, def: boolean) => milestoneGroupExpanded[k] ?? def;
                  const toggle = (k: string, def: boolean) => setMilestoneGroupExpanded(prev => ({ ...prev, [k]: !(prev[k] ?? def) }));
                  const total = groups.reduce((s, g) => s + g.items.length, 0);

                  // 找到最近一个待完成的里程碑
                  const nextMile = [...groups[0].items, ...groups[1].items, ...groups[2].items, ...groups[3].items, ...groups[4].items, ...groups[5].items]
                    .sort((a, b) => {
                      const da = parseDate(a.eventDate)?.getTime() ?? Infinity;
                      const db = parseDate(b.eventDate)?.getTime() ?? Infinity;
                      return da - db;
                    })[0] || null;

                  if (total === 0) return (
                    <Card className="shadow-sm border-[#E4ECFC]">
                      <CardContent className="p-8 text-center">
                        <Milestone className="w-8 h-8 mx-auto mb-2 opacity-40 text-[#94A3B8]" />
                        <p className="text-sm text-[#94A3B8]">没有匹配的里程碑</p>
                      </CardContent>
                    </Card>
                  );

                  return (
                    <div className="space-y-2.5">
                      {/* 最近里程碑提示卡片 */}
                      {nextMile && (
                        <div className={`rounded-md border-2 px-5 py-4 flex items-center justify-between gap-4 ${nextMile.ds.label === "已逾期" ? "border-red-300 bg-red-50" : "border-[#2563EB]/40 bg-[#F1F5FD]"}`}>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${nextMile.ds.label === "已逾期" ? "bg-red-100" : "bg-[#2563EB]/10"}`}>
                              <Clock className={`w-4.5 h-4.5 ${nextMile.ds.label === "已逾期" ? "text-[#DC2626]" : "text-[#2563EB]"}`} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs text-[#64748B]">{nextMile.ds.label === "已逾期" ? "最紧急 · 已逾期" : "下一个里程碑"}</p>
                              <p className="text-sm font-semibold text-[#0F172A] truncate">{nextMile.name}</p>
                              <p className="text-xs text-[#94A3B8] mt-0.5">{nextMile.eventDate} · {nextMile.month}</p>
                            </div>
                          </div>
                          <Badge className={`text-xs font-normal border shrink-0 ${nextMile.ds.cls}`}>{nextMile.ds.label}</Badge>
                        </div>
                      )}

                      {groups.map(g => {
                        if (g.items.length === 0) return null;
                        const expanded = isOpen(g.key, g.defOpen);
                        const isOD = g.key === "overdue";
                        const isTD = g.key === "today";
                        return (
                          <div key={g.key} className={`rounded-md border overflow-hidden ${isOD ? "border-red-200" : isTD ? "border-[#2563EB]/30" : "border-[#E4ECFC]"}`}>
                            <button type="button" onClick={() => toggle(g.key, g.defOpen)}
                              className={`w-full flex items-center justify-between px-4 py-2.5 transition-colors ${isOD ? "bg-red-50 hover:bg-red-100/80" : isTD ? "bg-[#F1F5FD] hover:bg-[#E8EDFB]" : "bg-[#F8FAFC] hover:bg-[#F1F5FD]"}`}>
                              <div className="flex items-center gap-2">
                                <ChevronDown className={`w-4 h-4 text-[#94A3B8] transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`} />
                                <span className={`text-sm font-semibold ${isOD ? "text-[#DC2626]" : isTD ? "text-[#2563EB]" : "text-[#0F172A]"}`}>{g.label}</span>
                              </div>
                              <Badge className={`font-normal text-xs ${isOD ? "bg-red-100 text-red-600 border-red-200" : "bg-[#F1F5FD] text-[#64748B] border-none"}`}>{g.items.length} 项</Badge>
                            </button>
                            {expanded && (
                              <div className="bg-white">
                                <div className="flex items-center px-4 py-2 border-b border-[#E4ECFC] bg-[#FAFBFF] text-xs font-medium text-[#94A3B8]">
                                  <span className="w-28 shrink-0">日期</span>
                                  <span className="flex-1">里程碑</span>
                                  <span className="w-16 shrink-0 text-center">迭代</span>
                                  <span className="w-20 text-right">状态</span>
                                </div>
                                <div className="divide-y divide-[#F1F5FD]">
                                  {g.items.map((m, idx) => (
                                    <div key={`${m.id}-${m.month}-${idx}`} className={`flex items-center px-4 py-3 transition-colors hover:bg-[#F8FAFC] ${isTD ? "bg-blue-50/20" : ""}`}>
                                      <span className="text-xs text-[#64748B] w-28 shrink-0">{m.eventDate}</span>
                                      <span className="flex-1 text-sm text-[#0F172A] truncate pr-2" title={m.name}>{m.name}</span>
                                      <span className="text-xs text-[#94A3B8] w-16 shrink-0 text-center">{m.month}</span>
                                      <Badge className={`text-xs font-normal border shrink-0 ${m.ds.cls}`}>{m.ds.label}</Badge>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              ) : (
                /* === 单月视图 === */
                <Card className="shadow-sm border-[#E4ECFC]">
                  <CardContent className="p-6">
                    {loading ? <div className="space-y-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div> : (
                      filteredMilestones.length === 0 ? (
                        <div className="text-center py-12 text-[#94A3B8]">
                          <Milestone className="w-8 h-8 mx-auto mb-2 opacity-40" />
                          <p className="text-sm">该月份暂无里程碑</p>
                        </div>
                      ) : (
                        <div className="relative pl-8">
                          <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-[#2563EB] via-[#94A3B8] to-[#E4ECFC]" />
                          <div className="space-y-3">
                            {filteredMilestones.map((m) => {
                              const isDone = m.status === "已完成" || m.status.includes("已完成") || m.status.includes("正常");
                              const isOverdue = m.delayDays > 0;
                              const isActive = !isDone && !isOverdue;
                              return (
                                <div key={`${m.id}-${m.month}`} className="relative group">
                                  <div className={`absolute -left-[23px] top-3 w-4 h-4 rounded-full border-2 z-10 transition-colors ${
                                    isDone ? "bg-[#059669] border-[#059669]"
                                    : isOverdue ? "bg-[#DC2626] border-[#DC2626]"
                                    : isActive ? "bg-white border-[#2563EB] group-hover:border-[#1D4ED8]"
                                    : "bg-white border-[#D1D5DB]"
                                  }`} />
                                  <div className={`p-4 rounded-lg border bg-white transition-all hover:shadow-md ${isOverdue ? "border-red-200" : "border-[#E4ECFC]"}`}>
                                    <div className="flex items-start justify-between gap-4">
                                      <div className="flex-1 min-w-0">
                                        <h4 className="text-sm font-medium text-[#0F172A]">{m.name}</h4>
                                        <div className="flex items-center gap-3 mt-1.5 text-xs text-[#94A3B8] flex-wrap">
                                          {m.eventDate && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{m.eventDate}</span>}
                                          {m.daysLeft > 0 && !isDone && <span className="flex items-center gap-1 font-medium text-[#059669]"><Clock className="w-3 h-3" />剩余 {m.daysLeft} 工作日</span>}
                                          {m.delayDays > 0 && <span className="flex items-center gap-1 font-medium text-[#DC2626]"><Clock className="w-3 h-3" />{m.hasActual ? `延期 ${m.delayDays} 工作日完成` : `已延期 ${m.delayDays} 工作日`}</span>}
                                          {m.month && <span className="flex items-center gap-1"><Milestone className="w-3 h-3" />归属: {m.month}</span>}
                                        </div>
                                      </div>
                                      <div className="flex-shrink-0">
                                        {isDone ? <Badge className="bg-emerald-50 text-emerald-600 border-emerald-200 text-xs font-normal">已完成</Badge>
                                          : isOverdue ? <Badge className="bg-red-50 text-red-600 border-red-200 text-xs font-normal">{m.hasActual ? "延期完成" : "延期中"}</Badge>
                                          : isActive ? <Badge className="bg-blue-50 text-blue-600 border-blue-200 text-xs font-normal">进行中</Badge>
                                          : <Badge className="bg-slate-100 text-slate-400 border-slate-200 text-xs font-normal">未开始</Badge>}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

/* ==================== Helpers ==================== */
type RawRec = { id?: string; fields?: string | Record<string, unknown>; last_modified_time?: string; created_time?: string };

function fld(r: RawRec): Record<string, unknown> {
  if (typeof r.fields === "string") { try { return JSON.parse(r.fields); } catch { return {}; } }
  return (r.fields || {}) as Record<string, unknown>;
}
function str(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(x => typeof x === "object" && x ? (x as Record<string, unknown>).displayText || "" : String(x)).join(", ");
  return v != null ? String(v) : "";
}
function summary(v: unknown): string {
  if (typeof v === "object" && v && "summary" in v) return String((v as Record<string, unknown>).summary || "");
  return str(v);
}
/** 状态 → 累计进度% 映射 (模糊匹配) */
function getStatusProgress(s: string): number {
  if (!s) return 0;
  if (/终止|作废|废弃/.test(s)) return 0;
  if (/已发布/.test(s)) return 100;
  if (/灰度发布/.test(s)) return 96;
  if (/版本测试/.test(s)) return 93;
  if (/待合并/.test(s)) return 88;
  if (/验收中/.test(s)) return 85;
  if (/测试中/.test(s)) return 80;
  if (/开发中/.test(s)) return 68;
  if (/开发方案|Open\s*API/i.test(s)) return 23;
  if (/需求分析/.test(s)) return 15;
  if (/需求立项/.test(s)) return 6;
  if (/未开始|待排期|待规划/.test(s)) return 0;
  return 0;
}
function isComplete(s: string): boolean { return getStatusProgress(s) >= 100; }
function isTerminated(s: string): boolean { return /终止|作废|废弃/.test(s); }
function getMonth(r: ReqRow): string { return r.month || "未参与排期"; }
function uniqSorted(arr: string[]): string[] { return [...new Set(arr.filter(Boolean))].sort(); }

/** 通用 ONES ID 解析 */
function parseOnes(f: Record<string, unknown>): { id: string; url: string } {
  const raw = f["ONES ID"];
  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0] as Record<string, unknown>;
    return { id: String(first.displayText || ""), url: String(first.address || "") };
  }
  return { id: "", url: "" };
}

/** 解析日期字符串为本地时间 Date（避免 UTC 偏移） */
function parseDate(s: string): Date | null {
  const m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

/** 计算两个日期之间的工作日天数（不含节假日，含调休上班日） */
function workingDaysBetween(from: Date, to: Date): number {
  const holidays = [
    // 元旦 2026-01-01 ~ 01-03
    ["2026-01-01", "2026-01-03"],
    // 春节 2026-02-15 ~ 02-23
    ["2026-02-15", "2026-02-23"],
    // 清明节 2026-04-04 ~ 04-06
    ["2026-04-04", "2026-04-06"],
    // 劳动节 2026-05-01 ~ 05-05
    ["2026-05-01", "2026-05-05"],
    // 端午节 2026-06-19 ~ 06-21
    ["2026-06-19", "2026-06-21"],
    // 中秋节 2026-09-25 ~ 09-27
    ["2026-09-25", "2026-09-27"],
    // 国庆节 2026-10-01 ~ 10-07
    ["2026-10-01", "2026-10-07"],
  ];
  // 调休上班日（周末变工作日）
  const workdayOverrides = new Set([
    "2026-01-04", "2026-02-14", "2026-02-28",
    "2026-05-09", "2026-09-20", "2026-10-10",
  ]);
  // 用本地时间取日期字符串，避免 toISOString 的 UTC 偏移
  function localDateStr(d: Date): string {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function isWorkday(d: Date): boolean {
    const ds = localDateStr(d);
    for (const [s, e] of holidays) {
      if (ds >= s && ds <= e) return false;
    }
    const dow = d.getDay();
    if (dow === 0 || dow === 6) return workdayOverrides.has(ds);
    return true;
  }
  let count = 0;
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  const endTime = end.getTime();
  if (cur.getTime() === endTime) return 0;
  const step = cur.getTime() < endTime ? 1 : -1;
  while (true) {
    cur.setDate(cur.getDate() + step);
    if (cur.getTime() === endTime) break;
    if (isWorkday(cur)) count += step;
  }
  return count;
}

/** sheet23 里程碑解析：从列头提取月份，每个(里程碑, 月)生成一条记录 */
function parseMils(records: RawRec[]): MilestoneRow[] {
  const result: MilestoneRow[] = [];
  const monthRe = /^(\d+)月/;
  for (const r of records) {
    const f = fld(r);
    const name = str(f["里程碑"]);
    if (!name) continue;
    // 按字段名前缀提取月份
    const monthData: Record<string, { plan: string; actual: string; progress: string; involved: boolean; days: string; note: string }> = {};
    for (const [key, val] of Object.entries(f)) {
      const m = key.match(monthRe);
      if (!m) continue;
      const month = m[1] + "月";
      if (!monthData[month]) monthData[month] = { plan: "", actual: "", progress: "", involved: false, days: "", note: "" };
      if (key.endsWith("计划完成日期")) monthData[month].plan = str(val);
      else if (key.endsWith("实际完成日期")) monthData[month].actual = str(val);
      else if (key.endsWith("进度")) monthData[month].progress = str(val);
      else if (key.endsWith("迭代是否涉及")) monthData[month].involved = val === true || val === "true" || val === "True";
      else if (key.endsWith("剩余天数")) monthData[month].days = str(val);
      else if (key.endsWith("备注")) monthData[month].note = str(val);
    }
    for (const [month, d] of Object.entries(monthData)) {
      // 跳过：不涉及且无任何日期数据的月份
      if (!d.plan) continue;
      const eventDate = (d.actual || d.plan || "").replace(/\//g, "-");
      let status = d.progress;
      if (!status && d.actual) status = "已完成";
      else if (!status && d.plan) status = "待完成";
      // 剩余天数 / 延期天数
      const planDate = parseDate(d.plan.replace(/\//g, "-"));
      let daysLeft = 0;
      let delayDays = 0;
      if (planDate) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        daysLeft = workingDaysBetween(today, planDate);
        const isNormal = status.includes("正常");
        if (isNormal) {
          // 正常完成：不显示任何延期
          delayDays = 0;
        } else if (d.actual) {
          // 有实际完成时间就用实际完成时间计算延期
          const actualDate = parseDate(d.actual.replace(/\//g, "-"));
          if (actualDate) delayDays = workingDaysBetween(planDate, actualDate);
        } else {
          // 无实际完成时间：用今天计算延期
          delayDays = workingDaysBetween(planDate, today);
        }
      }
      result.push({ id: r.id || "", name, month, status, eventDate, hasActual: !!d.actual, note: d.note, daysLeft, delayDays });
    }
  }
  return result;
}

/** sheet21 需求解析 */
function parseReqs(records: RawRec[]): ReqRow[] {
  // 调试：打印前2条记录的 created_time 和 fields 中所有时间相关字段
  if (records.length > 0) {
    const r0 = records[0];
    console.log("[需求-created_time]", r0.created_time || "(空)");
    console.log("[需求-last_modified_time]", r0.last_modified_time || "(空)");
    const f0 = fld(r0);
    const allKeys = Object.keys(f0);
    console.log("[需求-fields所有key]", allKeys);
    const timeKeys = allKeys.filter(k => /时间|日期|time|date|提测|完成|更新|修改|创建/i.test(k));
    console.log("[需求-fields时间字段]", timeKeys.map(k => k + "=" + String(f0[k]).substring(0, 40)));
  }
  const result = records.map(r => {
    const f = fld(r);
    const o = parseOnes(f);
    return {
      id: r.id || "", title: str(f["标题"]), status: str(f["状态"]),
      level: str(f["需求级别"]), project: str(f["所属项目"]), iteration: str(f["迭代"]),
      testDate: str(f["计划提测时间"]), devOwner: str(f["开发负责人"]), testOwner: str(f["测试负责人"]),
      productOwner: str(f["产品负责人"]),
      onesId: o.id, onesUrl: o.url, modTime: r.last_modified_time || "", month: str(f["排期月度"]),
      ...(() => {
        const keys = Object.keys(f);
        const devKey = keys.find(k => /开发.*实际工作量/.test(k));
        const testKey = keys.find(k => /测试.*实际工作量/.test(k));
        const devWl = devKey ? (parseFloat(str(f[devKey])) || 0) : 0;
        const testWl = testKey ? (parseFloat(str(f[testKey])) || 0) : 0;
        return { devWorkload: devWl, testWorkload: testWl, workload: devWl + testWl };
      })(),
      noTest: str(f["是否免测"]) === "是",
    };
  });
  // 调试：打印前5条的modTime格式
  console.log("[需求modTime样本]", result.slice(0, 5).map(r => ({ title: r.title?.substring(0, 15), modTime: r.modTime })));
  return result;
}

/** sheet24 风险解析：强鲁棒 ONES ID — 超链接文本即为 ONES ID */
function parseRisks(records: RawRec[]): RiskRow[] {
  return records.map((r, idx) => {
    const f = fld(r);
    let onesId = "";
    // 策略1：标准 ONES ID 数组字段
    const o1 = parseOnes(f);
    if (o1.id) onesId = o1.id;
    // 策略2：尝试常见字段名（ONES ID / ONES / ONES链接 / 链接 / 关联需求）
    const fieldNames = ["ONES", "ONES链接", "链接", "关联需求", "ONES ID"];
    if (!onesId) {
      for (const fn of fieldNames) {
        const v = parseOnesField(f, fn);
        if (v) { onesId = v; break; }
      }
    }
    // 策略3：遍历所有 key 含 ONES/ones 的字段
    if (!onesId) {
      for (const key of Object.keys(f)) {
        if (/ones/i.test(key)) {
          const v = parseOnesField(f, key);
          if (v) { onesId = v; break; }
        }
      }
    }
    // 策略4：遍历所有字段值，提取任何超链接对象的 text/displayText/value
    if (!onesId) {
      for (const v of Object.values(f)) {
        const t = extractLinkText(v);
        if (t) { onesId = t; break; }
      }
    }
    // 调试：打印完整字段 key+值摘要
    if (idx < 5) {
      const summary: Record<string, string> = {};
      for (const [k, v] of Object.entries(f)) {
        const vs = typeof v === "object" ? JSON.stringify(v).substring(0, 80) : String(v).substring(0, 80);
        summary[k] = vs;
      }
      console.log(`[Risk #${idx}] onesId=「${onesId || "(none)"}」 fields:`, summary);
    }
    return {
      id: r.id || "", title: summary(f["事项"]), status: str(f["状态"]),
      date: str(f["提报日期"]), product: str(f["归属产品"]), iteration: str(f["迭代"]),
      onesId,
      strategy: str(f["应对策略"]),
    };
  });
}

/** 从任意值中提取超链接文本（text/displayText/value 优先） */
function extractLinkText(v: unknown): string {
  if (!v || typeof v !== "object") return "";
  const obj = v as Record<string, unknown>;
  // 单个超链接对象
  const display = String(obj.displayText || obj.text || obj.value || "");
  if (display) return display;
  // 数组格式
  if (Array.isArray(v)) {
    for (const item of v) {
      if (typeof item === "object" && item) {
        const t = String((item as Record<string, unknown>).displayText || (item as Record<string, unknown>).text || (item as Record<string, unknown>).value || "");
        if (t) return t;
      }
    }
  }
  return "";
}

/** 从指定字段名解析 ONES ID（数组 / 单对象 / 字符串） */
function parseOnesField(f: Record<string, unknown>, key: string): string {
  const raw = f[key];
  if (!raw) return "";
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const t = extractLinkText(item);
      if (t) return t;
    }
  }
  const t = extractLinkText(raw);
  if (t) return t;
  if (typeof raw === "string") return raw;
  return "";
}