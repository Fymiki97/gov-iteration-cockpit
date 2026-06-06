import { useEffect, useState, useMemo, useCallback } from "react";
import { createWps365 } from "@ks-open/capability/client/wps365";
import type { Wps365Client } from "@ks-open/capability/client/wps365";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  Clock,
  ChevronRight,
} from "lucide-react";

/* ==================== 常量 ==================== */
const FILE_ID = "Dm5Wx1ph11MNih2SbwZurxjFLUZTboQEF";
const TAB_OVERVIEW = "overview";
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
  daysLeft: number;    // 剩余天数（负数=已超期）
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
      if (reqRes.data?.records) setRequirements(parseReqs(reqRes.data.records));
      if (milRes.data?.records) setMilestones(parseMils(milRes.data.records));
      if (riskRes.data?.records) setRisks(parseRisks(riskRes.data.records));
    } catch (err) {
      console.error("加载失败:", err);
    } finally {
      setLoading(false);
    }
  }, [wps]);

  useEffect(() => { if (wps) loadData(); }, [wps, loadData]);

  /* === 全量统计 === */
  const stats = useMemo(() => {
    const total = requirements.length;
    let completed = 0;
    const byMonth: Record<string, { total: number; completed: number; statuses: Record<string, number> }> = {};
    const statusCounts: Record<string, number> = {};
    requirements.forEach((r) => {
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
      if (isComplete(r.status)) completed++;
      const m = getMonth(r);
      if (!byMonth[m]) byMonth[m] = { total: 0, completed: 0, statuses: {} };
      byMonth[m].total++;
      if (isComplete(r.status)) byMonth[m].completed++;
      byMonth[m].statuses[r.status] = (byMonth[m].statuses[r.status] || 0) + 1;
    });
    const activeRisks = risks.filter((r) => r.status.includes("风险") && !r.status.includes("解除")).length;
    const msByMonth: Record<string, number> = {};
    milestones.forEach(m => { if (m.month) msByMonth[m.month] = (msByMonth[m.month] || 0) + 1; });
    const riskByMonth: Record<string, number> = {};
    risks.forEach(r => { const km = r.iteration; if (km) riskByMonth[km] = (riskByMonth[km] || 0) + 1; });
    return { total, completed, activeRisks, pct: total > 0 ? Math.round((completed / total) * 100) : 0, byMonth, statusCounts, msByMonth, riskByMonth };
  }, [requirements, risks, milestones]);

  const monthOrder = ["2&3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月", "未参与规划"];

  /*  月度迭代情况 (全量) */
  const monthDetails: MonthDetail[] = useMemo(() => {
    return Object.entries(stats.byMonth)
      .map(([month, d]) => {
        const st = Object.entries(d.statuses).sort(([, a], [, b]) => b - a).slice(0, 4);
        return {
          month,
          total: d.total,
          completed: d.completed,
          pct: d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0,
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

    if (selectedIterations.length > 0) list = list.filter(r => selectedIterations.includes(r.iteration));
    if (selectedStatuses.length > 0) list = list.filter(r => selectedStatuses.includes(r.status));
    if (selectedOwners.length > 0) list = list.filter(r => selectedOwners.some(o => r.devOwner === o || r.testOwner === o));

    return list;
  }, [requirements, filterTag, searchText, selectedIterations, selectedStatuses, selectedOwners, risks]);

  const allIterations = useMemo(() => uniqSorted(requirements.map(r => r.iteration)), [requirements]);
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
                          <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider">完成进度</p>
                          <p className="text-3xl font-bold text-[#2563EB] mt-1">{stats.pct}%</p>
                          <p className="text-xs text-[#94A3B8] mt-0.5">{stats.completed}/{stats.total}</p>
                        </div>
                        <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-[#2563EB]" /></div>
                      </CardContent>
                    </Card>
                  </>
                )}
              </div>

              {/*  月度迭代情况 */}
              <Card className="shadow-sm border-[#E4ECFC]">
                <CardHeader className="pb-2"><CardTitle className="text-base font-semibold text-[#0F172A]">月度迭代情况</CardTitle></CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
                  ) : monthDetails.length === 0 ? (
                    <p className="text-sm text-[#94A3B8] py-4 text-center">暂无迭代数据</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {monthDetails.map((md) => (
                        <div
                          key={md.month}
                          className="p-4 rounded-xl border border-[#E4ECFC] bg-white hover:shadow-md hover:border-[#2563EB]/20 cursor-pointer transition-all group"
                          onClick={() => { setSelectedIterations([md.month]); setFilterTag(null); setSearchText(""); setTab(TAB_LIST); }}
                        >
                          {/* 头部 */}
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-semibold text-[#0F172A]">{md.month}</span>
                            <ChevronRight className="w-4 h-4 text-[#CBD5E1] group-hover:text-[#2563EB] transition-colors" />
                          </div>

                          {/* 进度条 */}
                          <div className="flex items-center gap-3 mb-3">
                            <span className="text-2xl font-bold text-[#2563EB]">{md.pct}%</span>
                            <div className="flex-1">
                              <div className="flex justify-between text-xs text-[#94A3B8] mb-1">
                                <span>{md.completed}/{md.total}</span>
                              </div>
                              <div className="w-full h-2 bg-[#F1F5FD] rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-[#2563EB] transition-all duration-500" style={{ width: `${md.pct}%` }} />
                              </div>
                            </div>
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
                            <span className="flex items-center gap-1"><Milestone className="w-3 h-3" />里程碑 {md.milestoneCount}</span>
                            <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" />风险 {md.riskCount}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

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
                      {risks.map((r) => (
                        <div key={r.id} className="flex items-center justify-between py-3 px-4 bg-red-50/50 rounded-lg border border-red-100 cursor-pointer hover:bg-red-50 transition-colors"
                          onClick={() => {
                            // 按 ONES ID 筛选关联需求
                            setFilterTag("risk");
                            setSelectedIterations([]);
                            setSelectedStatuses([]);
                            setSelectedOwners([]);
                            setSearchText(r.onesId); // 搜索 ONES ID
                            setTab(TAB_LIST);
                          }}
                        >
                          <div className="flex-1 min-w-0 mr-4">
                            <p className="text-sm text-[#0F172A] line-clamp-1">{r.title}</p>
                            <p className="text-xs text-[#94A3B8] mt-0.5">{r.date} · {r.product} · {r.iteration}{r.onesId ? ` · ONES: ${r.onesId}` : ""}</p>
                          </div>
                          <Badge className={`text-xs font-normal border ${sc(r.status)}`}>{r.status}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* ============ TAB 2: 需求列表 ============ */}
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
                  <MultiSelect allLabel="全部迭代" options={allIterations.map(v => ({ value: v, label: v }))} value={selectedIterations} onChange={setSelectedIterations} />
                  <MultiSelect allLabel="全部状态" options={allStatuses.map(v => ({ value: v, label: v }))} value={selectedStatuses} onChange={setSelectedStatuses} />
                  <MultiSelect allLabel="全部负责人" options={allOwners.map(v => ({ value: v, label: v }))} value={selectedOwners} onChange={setSelectedOwners} />
                  <div className="relative flex-1 min-w-[200px] max-w-[280px] ml-auto">
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

          {/* ============ TAB 3: 里程碑 ============ */}
          <TabsContent value={TAB_MILESTONE}>
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
                            const isDone = m.status === "已完成";
                            const isActive = m.status === "进行中";
                            const isOverdue = !isDone && m.daysLeft < 0;
                            return (
                              <div key={m.id} className="relative group">
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
                                        {m.daysLeft !== 0 && (
                                          <span className={`flex items-center gap-1 font-medium ${m.daysLeft > 0 ? "text-[#059669]" : "text-[#DC2626]"}`}>
                                            <Clock className="w-3 h-3" />
                                            {m.daysLeft > 0 ? `剩余 ${m.daysLeft} 天` : `已超期 ${Math.abs(m.daysLeft)} 天`}
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
                                        : isOverdue ? <Badge className="bg-red-50 text-red-600 border-red-200 text-xs font-normal">已超期</Badge>
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
function isComplete(s: string): boolean { return /已发布|完成|完结/.test(s); }
function getMonth(r: ReqRow): string { return r.month || "未参与规划"; }
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

/** 提取字符串中的 x月 */
function extractMonthFromStr(s: string): string {
  const m = s.match(/(\d+)月/);
  return m ? m[1] + "月" : "";
}

/** 提取日期 (YYYY-MM-DD) 并计算剩余天数 */
function parseDateAndDays(s: string): { dateStr: string; daysLeft: number } {
  const m = s.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
  if (!m) return { dateStr: "", daysLeft: 0 };
  const d = new Date(m[1].replace(/\//g, "-"));
  if (isNaN(d.getTime())) return { dateStr: "", daysLeft: 0 };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((d.getTime() - today.getTime()) / 86400000);
  return { dateStr: m[1], daysLeft: diff };
}

/** sheet23 里程碑解析：全字段扫描提取月份和日期 */
function parseMils(records: RawRec[]): MilestoneRow[] {
  return records.map(r => {
    const f = fld(r);
    // 全字段拼接
    const allValues = Object.values(f).map(v => str(v)).filter(Boolean);
    const allText = allValues.join(" ");

    const name = str(f["文本"]) || str(f["名称"]) || str(f["标题"]) || str(f["里程碑"] || allText.substring(0, 30));
    const month = extractMonthFromStr(allText);
    const status = str(f["状态"]) || (Boolean(str(f["实际完成日期"])) ? "已完成" : "");
    const { dateStr, daysLeft } = parseDateAndDays(allText);

    return { id: r.id || "", name, month, status, eventDate: dateStr, daysLeft };
  });
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
      onesId: o.id, onesUrl: o.url, modTime: r.last_modified_time || "", month: str(f["规划月度"]),
    };
  });
}

/** sheet24 风险解析：增加 ONES ID */
function parseRisks(records: RawRec[]): RiskRow[] {
  return records.map(r => {
    const f = fld(r);
    const o = parseOnes(f);
    return {
      id: r.id || "", title: summary(f["事项"]), status: str(f["状态"]),
      date: str(f["提报日期"]), product: str(f["归属产品"]), iteration: str(f["迭代"]),
      onesId: o.id,
    };
  });
}