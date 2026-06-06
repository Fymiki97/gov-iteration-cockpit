import { useEffect, useState, useMemo, useCallback } from "react";
import { createWps365 } from "@ks-open/capability/client/wps365";
import type { Wps365Client } from "@ks-open/capability/client/wps365";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
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
  Info,
} from "lucide-react";

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
  onesId: string;
  onesUrl: string;
  modTime: string;
  month: string;
}

interface MilestoneRow {
  id: string;
  name: string;
  month: string;
  status: string;
  eventDate: string;   // 事件日期
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
}

interface MonthDetail {
  month: string;
  total: number;
  completed: number;
  pct: number;
  topStatuses: { name: string; count: number; color: string }[];
  milestoneCount: number;
  riskCount: number;
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

  /* === 加载数据 === */
  const loadData = useCallback(async () => {
    if (!wps) return;
    setLoading(true);
    try {
      const [reqRes, milRes, riskRes] = await Promise.all([
        wps.dbsheet.listRecords({ file_id: FILE_ID, sheet_id: 21, prefer_id: false, max_records: 2000, page_size: 1000 }),
        wps.dbsheet.listRecords({ file_id: FILE_ID, sheet_id: 23, prefer_id: false, max_records: 200 }),
        wps.dbsheet.listRecords({ file_id: FILE_ID, sheet_id: 24, prefer_id: false, max_records: 50 }),
      ]);
      if (reqRes.data?.records) {
        const reqs = parseReqs(reqRes.data.records);
        setRequirements(reqs);
        // 月份分布诊断
        const monthDist: Record<string, number> = {};
        reqs.forEach(r => { const m = r.month || "(空)"; monthDist[m] = (monthDist[m] || 0) + 1; });
        console.log("[需求-月份分布]", monthDist, "| 规则: 读取「排期月度」字段, 空值→「未参与排期」");
        // 打印前3条记录的原始字段 keys 和 month 相关值
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
      if (milRes.data?.records) {
        const mils = parseMils(milRes.data.records);
        setMilestones(mils);
        if (milRes.data.records.length > 0) {
          const raw = milRes.data.records.slice(0, 5).map(r => {
            const f = fld(r as RawRec);
            return { id: r.id, keys: Object.keys(f), values: Object.fromEntries(Object.entries(f).map(([k,v]) => [k, str(v).substring(0, 50)])) };
          });
          console.log("[里程碑-原始字段样本]", JSON.stringify(raw));
        }
      }
      if (riskRes.data?.records) setRisks(parseRisks(riskRes.data.records));
    } catch (err) {
      console.error("加载失败:", err);
    } finally {
      setLoading(false);
    }
  }, [wps]);

  useEffect(() => { if (wps) loadData(); }, [wps, loadData]);

  /* === 全量统计 (加权进度) === */
  const stats = useMemo(() => {
    const total = requirements.length;
    let sumProgress = 0;
    let completed = 0;
    const byMonth: Record<string, { total: number; sumProgress: number; completed: number; statuses: Record<string, number> }> = {};
    const statusCounts: Record<string, number> = {};
    requirements.forEach((r) => {
      const prog = getStatusProgress(r.status);
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
      if (prog >= 100) completed++;
      sumProgress += prog;
      const m = getMonth(r);
      if (!byMonth[m]) byMonth[m] = { total: 0, sumProgress: 0, completed: 0, statuses: {} };
      byMonth[m].total++;
      byMonth[m].sumProgress += prog;
      if (prog >= 100) byMonth[m].completed++;
      byMonth[m].statuses[r.status] = (byMonth[m].statuses[r.status] || 0) + 1;
    });
    const activeRisks = risks.filter((r) => r.status.includes("风险") && !r.status.includes("解除")).length;
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
        return {
          month,
          total: d.total,
          completed: d.completed,
          pct: d.total > 0 ? Math.round(d.sumProgress / d.total) : 0,
          topStatuses: st.map(([name, count], i) => ({ name, count, color: STATUS_COLORS[i % STATUS_COLORS.length] })),
          milestoneCount: stats.msByMonth[month] || 0,
          riskCount: stats.riskByMonth[month] || 0,
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

  const allIterations = useMemo(() => uniqSorted(requirements.map(r => getMonth(r))), [requirements]);
  const allStatuses = useMemo(() => uniqSorted(requirements.map(r => r.status)), [requirements]);
  const allOwners = useMemo(() => {
    const s = new Set<string>();
    requirements.forEach(r => { if (r.devOwner) s.add(r.devOwner); if (r.testOwner) s.add(r.testOwner); });
    return Array.from(s).sort();
  }, [requirements]);

  /* === 里程碑 (sheet23) === */
  const milestoneMonths = useMemo(() => {
    const s = new Set<string>();
    milestones.forEach(m => { if (m.month) s.add(m.month); });
    return Array.from(s).sort((a, b) => parseInt(a) - parseInt(b));
  }, [milestones]);

  const filteredMilestones = useMemo(() => {
    if (milestoneMonth === "全部") return milestones;
    return milestones.filter(m => m.month === milestoneMonth);
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

  /* ==================== 渲染 ==================== */
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* 顶部 */}
      <header className="bg-white border-b border-[#E4ECFC]">
        <div className="max-w-7xl mx-auto px-8 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[#0F172A] tracking-tight">政务产研迭代进度看板</h1>
            <p className="text-sm text-[#94A3B8] mt-1">2026政务产品研发迭代规划 · 实时追踪</p>
          </div>
          <button
            onClick={() => { setLoading(true); setRequirements([]); setMilestones([]); setRisks([]); loadData(); }}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm text-[#64748B] hover:text-[#2563EB] hover:bg-[#F1F5FD] rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            刷新数据
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-8 py-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
          <TabsList variant="line" className="mb-6">
            <TabsTrigger value={TAB_OVERVIEW}><BarChart3 className="w-4 h-4" />迭代概览</TabsTrigger>
            <TabsTrigger value={TAB_MONTHLY}><CalendarDays className="w-4 h-4" />月度迭代情况</TabsTrigger>
            <TabsTrigger value={TAB_LIST}><ListChecks className="w-4 h-4" />需求列表</TabsTrigger>
            <TabsTrigger value={TAB_MILESTONE}><Milestone className="w-4 h-4" />里程碑</TabsTrigger>
          </TabsList>

          {/* ============ TAB 1: 迭代概览 ============ */}
          <TabsContent value={TAB_OVERVIEW}>
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
                          <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider">风险项</p>
                          <p className="text-3xl font-bold text-[#DC2626] mt-1">{stats.activeRisks}</p>
                          <p className="text-xs text-[#94A3B8] mt-0.5">点击查看关联需求(ONES ID)</p>
                        </div>
                        <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-[#DC2626]" /></div>
                      </CardContent>
                    </Card>
                    <Card className="shadow-sm border-[#E4ECFC] hover:shadow-md hover:border-blue-300 cursor-pointer transition-all" onClick={() => goToList("completed")}>
                      <CardContent className="p-5 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-1">
                            <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider">完成进度</p>
                            <Popover>
                              <PopoverTrigger
                                render={<button type="button" className="inline-flex items-center justify-center rounded-full p-0.5 hover:bg-[#F1F5FD] transition-colors" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
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
                                      ["需求立项中","8%","0%"],
                                      ["需求分析中","12%","8%"],
                                      ["UX设计中","10%","20%"],
                                      ["开发方案设计中","10%","30%"],
                                      ["开发中","30%","40%"],
                                      ["验收中","7%","70%"],
                                      ["测试中","8%","77%"],
                                      ["待合并","5%","85%"],
                                      ["版本测试中","5%","90%"],
                                      ["灰度发布","3%","95%"],
                                      ["已发布","2%","100%"],
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
                          <p className="text-3xl font-bold text-[#2563EB] mt-1">{stats.pct}%</p>
                          <p className="text-xs text-[#94A3B8] mt-0.5">{stats.completed}/{stats.total}</p>
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
              {risks.length > 0 && (
                <Card className="shadow-sm border-[#E4ECFC]">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold text-[#0F172A] flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-[#DC2626]" />风险跟踪
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {risks.map((r) => {
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
              )}
            </div>
          </TabsContent>

          {/* ============ TAB 2: 月度迭代情况 ============ */}
          <TabsContent value={TAB_MONTHLY}>
            <div className="space-y-6">
              {/* 月份选择器 */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium text-[#0F172A]">选择迭代月份：</span>
                <button onClick={() => setMonthlyMonthFilter("全部")}
                  className={`h-9 px-4 text-sm rounded-lg border transition-colors ${monthlyMonthFilter === "全部" ? "border-[#2563EB] bg-[#F1F5FD] text-[#2563EB]" : "border-[#E4ECFC] text-[#64748B] hover:border-[#CBD5E1]"}`}>全部</button>
                {monthDetails.map(md => (
                  <button key={md.month} onClick={() => setMonthlyMonthFilter(md.month)}
                    className={`h-9 px-4 text-sm rounded-lg border transition-colors ${monthlyMonthFilter === md.month ? "border-[#2563EB] bg-[#F1F5FD] text-[#2563EB]" : "border-[#E4ECFC] text-[#64748B] hover:border-[#CBD5E1]"}`}>{md.month}</button>
                ))}
              </div>

              {/* 月份详情卡片 */}
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-44" />)}</div>
              ) : (() => {
                const filtered = monthlyMonthFilter === "全部" ? monthDetails : monthDetails.filter(md => md.month === monthlyMonthFilter);
                if (filtered.length === 0) return <p className="text-sm text-[#94A3B8] py-4 text-center">该月份暂无迭代数据</p>;
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filtered.map((md) => (
                      <div
                        key={md.month}
                        className="p-5 rounded-xl border border-[#E4ECFC] bg-white hover:shadow-md hover:border-[#2563EB]/20 cursor-pointer transition-all group"
                        onClick={() => { setSelectedIterations([md.month]); setFilterTag(null); setSearchText(""); setTab(TAB_LIST); }}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-lg font-bold text-[#0F172A]">{md.month}</span>
                          <ChevronRight className="w-4 h-4 text-[#CBD5E1] group-hover:text-[#2563EB] transition-colors" />
                        </div>
                        {/* 核心指标 */}
                        <div className="grid grid-cols-3 gap-3 mb-4">
                          <div className="text-center p-2 rounded-lg bg-[#F1F5FD]">
                            <p className="text-xs text-[#94A3B8]">需求总数</p>
                            <p className="text-lg font-bold text-[#2563EB]">{md.total}</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-emerald-50">
                            <p className="text-xs text-[#94A3B8]">已完成</p>
                            <p className="text-lg font-bold text-[#059669]">{md.completed}</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-blue-50">
                            <p className="text-xs text-[#94A3B8]">完成度</p>
                            <p className="text-lg font-bold text-[#2563EB]">{md.pct}%</p>
                          </div>
                        </div>
                        {/* 进度条 */}
                        <div className="w-full h-2.5 bg-[#F1F5FD] rounded-full overflow-hidden mb-3">
                          <div className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#059669] transition-all duration-500" style={{ width: `${md.pct}%` }} />
                        </div>
                        {/* 状态标签 */}
                        {md.topStatuses.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {md.topStatuses.map(s => (
                              <span key={s.name} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs"
                                style={{ background: s.color + "18", color: s.color, border: `1px solid ${s.color}30` }}>
                                {s.name} {s.count}
                              </span>
                            ))}
                          </div>
                        )}
                        {/* 底部指标 */}
                        <div className="flex items-center gap-4 text-xs text-[#94A3B8]">
                          <span className="flex items-center gap-1"><Milestone className="w-3 h-3" />里程碑 {md.milestoneCount} 项</span>
                          <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" />风险 {md.riskCount} 项</span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </TabsContent>

          {/* ============ TAB 3: 需求列表 ============ */}
          <TabsContent value={TAB_LIST}>
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
                        {filteredReqs.map((r, i) => (
                          <tr key={r.id} className={`border-b border-[#F1F5FD] hover:bg-[#F8FAFC] transition-colors ${i % 2 === 0 ? "" : "bg-[#FAFBFF]"}`}>
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
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============ TAB 4: 里程碑 ============ */}
          <TabsContent value={TAB_MILESTONE} keepMounted>
            <div className="space-y-6">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium text-[#0F172A]">选择迭代月份：</span>
                <button onClick={() => setMilestoneMonth("全部")}
                  className={`h-9 px-4 text-sm rounded-lg border transition-colors ${milestoneMonth === "全部" ? "border-[#2563EB] bg-[#F1F5FD] text-[#2563EB]" : "border-[#E4ECFC] text-[#64748B] hover:border-[#CBD5E1]"}`}>全部</button>
                {milestoneMonths.map(m => (
                  <button key={m} onClick={() => setMilestoneMonth(m)}
                    className={`h-9 px-4 text-sm rounded-lg border transition-colors ${milestoneMonth === m ? "border-[#2563EB] bg-[#F1F5FD] text-[#2563EB]" : "border-[#E4ECFC] text-[#64748B] hover:border-[#CBD5E1]"}`}>{m}</button>
                ))}
                <Badge className="bg-[#F1F5FD] text-[#2563EB] border-none font-normal ml-auto">{filteredMilestones.length} 项</Badge>
              </div>

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
                            const isDone = m.status === "已完成" || m.status.includes("正常");
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
                                <div className={`p-4 rounded-xl border bg-white transition-all hover:shadow-md ${isOverdue ? "border-red-200" : "border-[#E4ECFC]"}`}>
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                      <h4 className="text-sm font-medium text-[#0F172A]">{m.name}</h4>
                                      <div className="flex items-center gap-3 mt-1.5 text-xs text-[#94A3B8] flex-wrap">
                                        {m.eventDate && (
                                          <span className="flex items-center gap-1">
                                            <Calendar className="w-3 h-3" />事件日: {m.eventDate}
                                          </span>
                                        )}
                                        {m.daysLeft > 0 && !isDone && (
                                          <span className="flex items-center gap-1 font-medium text-[#059669]">
                                            <Clock className="w-3 h-3" />剩余 {m.daysLeft} 工作日
                                          </span>
                                        )}
                                        {m.delayDays > 0 && (
                                          <span className="flex items-center gap-1 font-medium text-[#DC2626]">
                                            <Clock className="w-3 h-3" />已延期 {m.delayDays} 工作日
                                          </span>
                                        )}
                                        {m.month && (
                                          <span className="flex items-center gap-1">
                                            <Milestone className="w-3 h-3" />归属: {m.month}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex-shrink-0">
                                      {isDone ? <Badge className="bg-emerald-50 text-emerald-600 border-emerald-200 text-xs font-normal">已完成</Badge>
                                        : isOverdue ? <Badge className="bg-red-50 text-red-600 border-red-200 text-xs font-normal">已延期</Badge>
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
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/* ==================== Helpers ==================== */
type RawRec = { id?: string; fields?: string | Record<string, unknown>; last_modified_time?: string };

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
  if (/已发布/.test(s)) return 100;
  if (/灰度发布/.test(s)) return 95;
  if (/版本测试/.test(s)) return 90;
  if (/待合并/.test(s)) return 85;
  if (/测试中/.test(s)) return 77;
  if (/验收中/.test(s)) return 70;
  if (/开发中/.test(s)) return 40;
  if (/开发方案/.test(s)) return 30;
  if (/ux设计|ui设计/i.test(s)) return 20;
  if (/需求分析/.test(s)) return 8;
  if (/需求立项/.test(s)) return 0;
  if (/未开始|待排期|待规划/.test(s)) return 0;
  return 0;
}
function isComplete(s: string): boolean { return getStatusProgress(s) >= 100; }
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

/** 解析日期字符串为 Date */
function parseDate(s: string): Date | null {
  const m = s.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
  if (!m) return null;
  const d = new Date(m[1].replace(/\//g, "-"));
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
  const step = cur.getTime() <= endTime ? 1 : -1;
  while (cur.getTime() !== endTime) {
    if (isWorkday(cur)) count += step;
    cur.setDate(cur.getDate() + step);
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
      if (!d.involved && !d.plan && !d.actual) continue;
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
        const isCompleted = status === "已完成";
        if (isNormal) {
          // 正常完成：不显示任何延期
          delayDays = 0;
        } else if (isCompleted && d.actual) {
          const actualDate = parseDate(d.actual.replace(/\//g, "-"));
          if (actualDate) delayDays = workingDaysBetween(planDate, actualDate);
        } else if (!isNormal && !isCompleted) {
          delayDays = workingDaysBetween(planDate, today);
        }
      }
      result.push({ id: r.id || "", name, month, status, eventDate, daysLeft, delayDays });
    }
  }
  return result;
}

/** sheet21 需求解析 */
function parseReqs(records: RawRec[]): ReqRow[] {
  return records.map(r => {
    const f = fld(r);
    const o = parseOnes(f);
    return {
      id: r.id || "", title: str(f["标题"]), status: str(f["状态"]),
      level: str(f["需求级别"]), project: str(f["所属项目"]), iteration: str(f["迭代"]),
      testDate: str(f["计划提测时间"]), devOwner: str(f["开发负责人"]), testOwner: str(f["测试负责人"]),
      onesId: o.id, onesUrl: o.url, modTime: r.last_modified_time || "", month: str(f["排期月度"]),
    };
  });
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