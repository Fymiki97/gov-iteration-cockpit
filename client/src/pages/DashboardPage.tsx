import { useEffect, useState, useMemo, useCallback } from "react";
import { createWps365 } from "@ks-open/capability/client/wps365";
import type { Wps365Client } from "@ks-open/capability/client/wps365";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Layers,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  Target,
  ListChecks,
  Milestone,
  BarChart3,
  Search,
  X,
  ExternalLink,
} from "lucide-react";

/* ==================== 常量 ==================== */
const FILE_ID = "Dm5Wx1ph11MNih2SbwZurxjFLUZTboQEF";
const TAB_OVERVIEW = "overview";
const TAB_LIST = "list";
const TAB_MILESTONE = "milestone";

/* ==================== 类型 ==================== */
interface ReqRow {
  id: string;
  title: string;
  status: string;
  level: string;
  project: string;
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
  date: string;
  actualDate: string;
  involved: boolean;
}

interface RiskRow {
  id: string;
  title: string;
  status: string;
  date: string;
  product: string;
  iteration: string;
}

type FilterTag = "total" | "completed" | "risk" | null;

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

  // 筛选状态
  const [filterTag, setFilterTag] = useState<FilterTag>(null);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [milestoneMonth, setMilestoneMonth] = useState("全部");

  /* === 初始化 SDK === */
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
        wps.dbsheet.listRecords({ file_id: FILE_ID, sheet_id: 21, prefer_id: false, max_records: 600, page_size: 600 }),
        wps.dbsheet.listRecords({ file_id: FILE_ID, sheet_id: 14, prefer_id: false, max_records: 50 }),
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

  /* === 统计 === */
  const stats = useMemo(() => {
    const total = requirements.length;
    let completed = 0;
    const byMonth: Record<string, { total: number; completed: number }> = {};
    const statusCounts: Record<string, number> = {};
    requirements.forEach((r) => {
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
      if (isComplete(r.status)) completed++;
      const m = getMonth(r);
      if (!byMonth[m]) byMonth[m] = { total: 0, completed: 0 };
      byMonth[m].total++;
      if (isComplete(r.status)) byMonth[m].completed++;
    });
    const activeRisks = risks.filter((r) => r.status.includes("风险") && !r.status.includes("解除")).length;
    return { total, completed, activeRisks, pct: total > 0 ? Math.round((completed / total) * 100) : 0, byMonth, statusCounts };
  }, [requirements, risks]);

  const monthOrder = ["2&3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月", "未参与规划"];
  const sortedMonths = useMemo(() =>
    Object.entries(stats.byMonth).sort(([a], [b]) => {
      const ai = monthOrder.indexOf(a), bi = monthOrder.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    }), [stats.byMonth]);

  /* === 饼图 === */
  const pieSegments = useMemo(() => {
    const colors = ["#2563EB", "#059669", "#F59E0B", "#DC2626", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16", "#94A3B8", "#64748B"];
    let cum = 0;
    return Object.entries(stats.statusCounts).sort(([, a], [, b]) => b - a).map(([name, count], i) => {
      const sa = (cum / stats.total) * 360;
      cum += count;
      return { name, count, sa, ea: (cum / stats.total) * 360, c: colors[i % colors.length] };
    });
  }, [stats.statusCounts, stats.total]);

  /* === 筛选后需求列表 === */
  const filteredReqs = useMemo(() => {
    let list = [...requirements];
    // 按最后修改时间降序
    list.sort((a, b) => b.modTime.localeCompare(a.modTime));

    // 标签筛选
    if (filterTag === "completed") {
      list = list.filter(r => isComplete(r.status));
    } else if (filterTag === "risk") {
      const riskTitles = risks.map(r => extractRiskKeyword(r.title));
      list = list.filter(r => riskTitles.some(kw => kw && r.title.includes(kw)));
    }

    // 文本搜索
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter(r =>
        r.title.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q) ||
        r.project.toLowerCase().includes(q) ||
        r.devOwner.toLowerCase().includes(q) ||
        r.testOwner.toLowerCase().includes(q) ||
        r.onesId.includes(q)
      );
    }

    // 状态筛选
    if (statusFilter !== "all") {
      list = list.filter(r => r.status === statusFilter);
    }

    // 优先级筛选
    if (levelFilter !== "all") {
      list = list.filter(r => r.level === levelFilter);
    }

    // 所属项目筛选
    if (projectFilter !== "all") {
      list = list.filter(r => r.project === projectFilter);
    }

    return list;
  }, [requirements, filterTag, searchText, statusFilter, levelFilter, projectFilter, risks]);

  const allStatuses = useMemo(() => {
    const set = new Set(requirements.map(r => r.status));
    return Array.from(set).sort();
  }, [requirements]);

  const allLevels = useMemo(() => {
    const set = new Set(requirements.map(r => r.level).filter(Boolean));
    return Array.from(set).sort();
  }, [requirements]);

  const allProjects = useMemo(() => {
    const set = new Set(requirements.map(r => r.project).filter(Boolean));
    return Array.from(set).sort();
  }, [requirements]);

  function extractMonthFromStr(s: string): string {
    // 先尝试匹配 N月 格式
    const mm = s.match(/(\d+)月/);
    if (mm) return mm[1] + "月";
    // 再尝试标准日期格式
    const d = new Date(s);
    if (!isNaN(d.getTime())) return `${d.getMonth() + 1}月`;
    return "";
  }

  const filteredMilestones = useMemo(() => {
    if (milestoneMonth === "全部") return milestones;
    return milestones.filter(m => {
      const m1 = extractMonthFromStr(m.date);
      const m2 = extractMonthFromStr(m.name);
      return m1 === milestoneMonth || m2 === milestoneMonth;
    });
  }, [milestones, milestoneMonth]);

  const milestoneMonths = useMemo(() => {
    const set = new Set<string>();
    milestones.forEach(m => {
      const m1 = extractMonthFromStr(m.date);
      const m2 = extractMonthFromStr(m.name);
      if (m1) set.add(m1);
      if (m2) set.add(m2);
    });
    return Array.from(set).sort((a, b) => parseInt(a) - parseInt(b));
  }, [milestones]);

  /* === 点击卡片跳转 === */
  const goToList = (tag: FilterTag) => {
    setFilterTag(tag);
    setSearchText("");
    setStatusFilter("all");
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
              {/* 4 卡片 - 可点击 */}
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
                        <div className="w-11 h-11 rounded-xl bg-[#F1F5FD] flex items-center justify-center">
                          <Layers className="w-5 h-5 text-[#2563EB]" />
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="shadow-sm border-[#E4ECFC] hover:shadow-md hover:border-emerald-300 cursor-pointer transition-all" onClick={() => goToList("completed")}>
                      <CardContent className="p-5 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider">已完成</p>
                          <p className="text-3xl font-bold text-[#059669] mt-1">{stats.completed}</p>
                          <p className="text-xs text-[#94A3B8] mt-0.5">点击查看已完成需求</p>
                        </div>
                        <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center">
                          <CheckCircle2 className="w-5 h-5 text-[#059669]" />
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="shadow-sm border-[#E4ECFC] hover:shadow-md hover:border-red-300 cursor-pointer transition-all" onClick={() => goToList("risk")}>
                      <CardContent className="p-5 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider">风险项</p>
                          <p className="text-3xl font-bold text-[#DC2626] mt-1">{stats.activeRisks}</p>
                          <p className="text-xs text-[#94A3B8] mt-0.5">点击查看关联需求</p>
                        </div>
                        <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center">
                          <AlertTriangle className="w-5 h-5 text-[#DC2626]" />
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="shadow-sm border-[#E4ECFC] hover:shadow-md hover:border-blue-300 cursor-pointer transition-all" onClick={() => goToList("completed")}>
                      <CardContent className="p-5 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider">完成进度</p>
                          <p className="text-3xl font-bold text-[#2563EB] mt-1">{stats.pct}%</p>
                          <p className="text-xs text-[#94A3B8] mt-0.5">{stats.completed}/{stats.total}</p>
                        </div>
                        <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center">
                          <TrendingUp className="w-5 h-5 text-[#2563EB]" />
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}
              </div>

              {/* 月度进展 + 饼图 */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <Card className="lg:col-span-3 shadow-sm border-[#E4ECFC]">
                  <CardHeader className="pb-2"><CardTitle className="text-base font-semibold text-[#0F172A]">月度迭代进展</CardTitle></CardHeader>
                  <CardContent>
                    {loading ? <div className="space-y-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div> : (
                      <div className="space-y-4">
                        {sortedMonths.map(([month, { total, completed }], idx) => {
                          const p = total > 0 ? Math.round((completed / total) * 100) : 0;
                          return (
                            <div key={month} className="cursor-pointer hover:bg-[#F8FAFC] rounded-lg p-2 -mx-2 transition-colors" onClick={() => goToList(null)}>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-sm font-medium text-[#0F172A]">{month}</span>
                                <span className="text-xs text-[#94A3B8]">{completed}/{total} · {p}%</span>
                              </div>
                              <div className="w-full h-2 bg-[#F1F5FD] rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${p}%`, background: idx % 2 === 0 ? "#2563EB" : "#059669" }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="lg:col-span-2 shadow-sm border-[#E4ECFC]">
                  <CardHeader className="pb-2"><CardTitle className="text-base font-semibold text-[#0F172A]">状态分布</CardTitle></CardHeader>
                  <CardContent>
                    {loading ? <Skeleton className="h-48 w-full rounded-lg" /> : (
                      <div className="flex flex-col items-center gap-3">
                        <svg width="170" height="170" viewBox="0 0 170 170">
                          {pieSegments.map((seg, i) => {
                            const sr = (seg.sa * Math.PI) / 180, er = (seg.ea * Math.PI) / 180;
                            const cx = 85, cy = 85, r = 80;
                            const x1 = cx + r * Math.sin(sr), y1 = cy - r * Math.cos(sr);
                            const x2 = cx + r * Math.sin(er), y2 = cy - r * Math.cos(er);
                            const large = seg.ea - seg.sa > 180 ? 1 : 0;
                            return <path key={i} d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`} fill={seg.c} stroke="#fff" strokeWidth="1.5" />;
                          })}
                        </svg>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center text-xs">
                          {pieSegments.slice(0, 10).map((s, i) => (
                            <span key={i} className="flex items-center gap-1.5 text-[#64748B]">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.c }} />{s.name}({s.count})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

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
                        <div key={r.id} className="flex items-center justify-between py-3 px-4 bg-red-50/50 rounded-lg border border-red-100 cursor-pointer hover:bg-red-50 transition-colors" onClick={() => goToList("risk")}>
                          <div className="flex-1 min-w-0 mr-4">
                            <p className="text-sm text-[#0F172A] line-clamp-1">{r.title}</p>
                            <p className="text-xs text-[#94A3B8] mt-0.5">{r.date} · {r.product} · {r.iteration}</p>
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
                  <div className="relative flex-1 min-w-[200px] max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                    <Input
                      placeholder="搜索标题、项目、负责人..."
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
                  <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v || "all"); setFilterTag(null); }}>
                    <SelectTrigger className="h-9 w-[130px] text-sm border-[#E4ECFC]">
                      <SelectValue placeholder="状态" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部状态</SelectItem>
                      {allStatuses.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={levelFilter} onValueChange={(v) => setLevelFilter(v || "all")}>
                    <SelectTrigger className="h-9 w-[120px] text-sm border-[#E4ECFC]">
                      <SelectValue placeholder="优先级" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部优先级</SelectItem>
                      {allLevels.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={projectFilter} onValueChange={(v) => setProjectFilter(v || "all")}>
                    <SelectTrigger className="h-9 w-[160px] text-sm border-[#E4ECFC]">
                      <SelectValue placeholder="所属项目" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部项目</SelectItem>
                      {allProjects.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {filterTag && (
                    <Badge className="h-8 gap-1 cursor-pointer bg-[#F1F5FD] text-[#2563EB] border-[#2563EB]/20" onClick={() => { setFilterTag(null); setStatusFilter("all"); }}>
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
                            <td className="py-3 px-4 whitespace-nowrap">
                              <Badge className={`text-xs font-normal border ${sc(r.status)}`}>{r.status || "-"}</Badge>
                            </td>
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
              {/* 月份选择器 */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-[#0F172A]">选择月份：</span>
                <Select value={milestoneMonth} onValueChange={(v) => setMilestoneMonth(v || "全部")}>
                  <SelectTrigger className="h-9 w-[140px] text-sm border-[#E4ECFC]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="全部">全部</SelectItem>
                    {milestoneMonths.map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Badge className="bg-[#F1F5FD] text-[#2563EB] border-none font-normal">
                  {filteredMilestones.filter(m => m.involved).length} 项活跃
                </Badge>
              </div>

              {/* 里程碑时间线 */}
              <Card className="shadow-sm border-[#E4ECFC]">
                <CardContent className="p-6">
                  {loading ? <div className="space-y-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div> : (
                    <div className="relative pl-8">
                      <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-[#2563EB] via-[#94A3B8] to-[#E4ECFC]" />
                      <div className="space-y-3">
                        {filteredMilestones.map((m) => (
                          <div key={m.id} className="relative group">
                            <div className={`absolute -left-[23px] top-3 w-4 h-4 rounded-full border-2 z-10 ${
                              m.actualDate ? "bg-[#059669] border-[#059669]" : m.involved ? "bg-white border-[#2563EB] group-hover:border-[#1D4ED8]" : "bg-white border-[#D1D5DB]"
                            }`} />
                            <div className={`p-4 rounded-xl border transition-all ${m.involved ? "bg-white border-[#E4ECFC] hover:shadow-md" : "bg-[#F8FAFC] border-[#E4ECFC]/50"}`}>
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <h4 className={`text-sm font-medium ${m.involved ? "text-[#0F172A]" : "text-[#94A3B8]"}`}>{m.name}</h4>
                                  <div className="flex items-center gap-4 mt-1.5 text-xs text-[#94A3B8]">
                                    {m.date && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#2563EB]" />计划: {m.date}</span>}
                                    {m.actualDate && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#059669]" />实际: {m.actualDate}</span>}
                                  </div>
                                </div>
                                <div className="flex-shrink-0">
                                  {m.actualDate ? <Badge className="bg-emerald-50 text-emerald-600 border-emerald-200 text-xs font-normal">已完成</Badge>
                                    : m.involved ? <Badge className="bg-blue-50 text-blue-600 border-blue-200 text-xs font-normal">进行中</Badge>
                                    : <Badge className="bg-slate-100 text-slate-400 border-slate-200 text-xs font-normal">未涉及</Badge>}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
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
function isComplete(s: string): boolean {
  return /已发布|完成|完结/.test(s);
}
function getMonth(r: ReqRow): string {
  return r.month || "未参与规划";
}

function parseOnes(f: Record<string, unknown>): { id: string; url: string } {
  const raw = f["ONES ID"];
  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0] as Record<string, unknown>;
    return { id: String(first.displayText || ""), url: String(first.address || "") };
  }
  return { id: "", url: "" };
}

function extractRiskKeyword(title: string): string {
  const m = title.match(/标签|格式校对|治理|改造/);
  return m ? m[0] : title.split("】")[0]?.replace("【", "") || title.substring(0, 6);
}

function parseReqs(records: RawRec[]): ReqRow[] {
  return records.map(r => {
    const f = fld(r);
    const o = parseOnes(f);
    return {
      id: r.id || "",
      title: str(f["标题"]),
      status: str(f["状态"]),
      level: str(f["需求级别"]),
      project: str(f["所属项目"]),
      testDate: str(f["计划提测时间"]),
      devOwner: str(f["开发负责人"]),
      testOwner: str(f["测试负责人"]),
      onesId: o.id,
      onesUrl: o.url,
      modTime: r.last_modified_time || "",
      month: str(f["规划月度"]),
    };
  });
}

function parseMils(records: RawRec[]): MilestoneRow[] {
  return records.map(r => {
    const f = fld(r);
    return {
      id: r.id || "",
      name: str(f["文本"]),
      date: str(f["计划完成日期"]),
      actualDate: str(f["实际完成日期"]),
      involved: Boolean(f["本期迭代是否涉及"]),
    };
  });
}

function parseRisks(records: RawRec[]): RiskRow[] {
  return records.map(r => {
    const f = fld(r);
    return {
      id: r.id || "",
      title: summary(f["事项"]),
      status: str(f["状态"]),
      date: str(f["提报日期"]),
      product: str(f["归属产品"]),
      iteration: str(f["迭代"]),
    };
  });
}