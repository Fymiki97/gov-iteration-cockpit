import { useEffect, useState, useMemo } from "react";
import { createWps365 } from "@ks-open/capability/client/wps365";
import type { Wps365Client } from "@ks-open/capability/client/wps365";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Layers,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  Users,
  Target,
  ListChecks,
  Milestone,
  BarChart3,
} from "lucide-react";

/* ==================== 常量 ==================== */
const FILE_ID = "Dm5Wx1ph11MNih2SbwZurxjFLUZTboQEF";
const SHEET_REQUIREMENTS = 21;
const SHEET_MILESTONES = 14;
const SHEET_ITER_MILESTONES = 23;
const SHEET_RISKS = 24;

/* ==================== 类型 ==================== */
interface ReqRow {
  id: string;
  title: string;
  status: string;
  level: string;
  iteration: string;
  owner: string;
  testDate: string;
  conclusion: string;
  category: string;
  planMonth: string;
}

interface Milestone {
  id: string;
  name: string;
  date: string;
  actualDate: string;
  involved: boolean;
}

interface RiskItem {
  id: string;
  title: string;
  status: string;
  date: string;
  product: string;
  iteration: string;
}

/* ==================== 主组件 ==================== */
export function DashboardPage() {
  const [wps, setWps] = useState<Wps365Client | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [requirements, setRequirements] = useState<ReqRow[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [risks, setRisks] = useState<RiskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "list" | "milestone">("overview");

  /* ==================== 初始化 SDK ==================== */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const client = createWps365({
          proxyBase: import.meta.env.DEV ? "/base-proxy" : "/app/app-base/base-proxy",
        });
        const authResult = await client.ensureAuthorized({
          scope: "kso.dbsheet.readwrite",
        });
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

  /* ==================== 加载数据 ==================== */
  const loadData = async () => {
    if (!wps) return;
    setLoading(true);
    try {
      const [reqRes, milRes, riskRes] = await Promise.all([
        wps.dbsheet.listRecords({
          file_id: FILE_ID, sheet_id: SHEET_REQUIREMENTS,
          prefer_id: false, max_records: 500, page_size: 500,
        }),
        wps.dbsheet.listRecords({
          file_id: FILE_ID, sheet_id: SHEET_MILESTONES,
          prefer_id: false, max_records: 50,
        }),
        wps.dbsheet.listRecords({
          file_id: FILE_ID, sheet_id: SHEET_RISKS,
          prefer_id: false, max_records: 50,
        }),
      ]);

      if (reqRes.data?.records) {
        setRequirements(reqRes.data.records.map((r) => {
          const f = asFields(r);
          return {
            id: r.id || "",
            title: s(f["标题"]),
            status: s(f["状态"]),
            level: s(f["需求级别"]),
            iteration: s(f["所属迭代"]),
            owner: s(f["负责人"]),
            testDate: s(f["计划提测时间"]),
            conclusion: s(f["排期结论"]),
            category: s(f["需求分类"]),
            planMonth: s(f["规划月度"]),
          };
        }));
      }
      if (milRes.data?.records) {
        setMilestones(milRes.data.records.map((r) => {
          const f = asFields(r);
          return {
            id: r.id || "",
            name: s(f["文本"]),
            date: s(f["计划完成日期"]),
            actualDate: s(f["实际完成日期"]),
            involved: Boolean(f["本期迭代是否涉及"]),
          };
        }));
      }
      if (riskRes.data?.records) {
        setRisks(riskRes.data.records.map((r) => {
          const f = asFields(r);
          return {
            id: r.id || "",
            title: parseSummary(f["事项"]),
            status: s(f["状态"]),
            date: s(f["提报日期"]),
            product: s(f["归属产品"]),
            iteration: s(f["迭代"]),
          };
        }));
      }
    } catch (err) {
      console.error("加载失败:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (wps) loadData(); }, [wps]);

  /* ==================== 统计 ==================== */
  const stats = useMemo(() => {
    const total = requirements.length;
    let completed = 0;
    const byMonth: Record<string, { total: number; completed: number }> = {};
    const statusCounts: Record<string, number> = {};

    requirements.forEach((r) => {
      const s = r.status;
      statusCounts[s] = (statusCounts[s] || 0) + 1;
      if (s.includes("已发布") || s.includes("完成") || s.includes("完结")) completed++;

      const month = r.planMonth || "未分配";
      if (!byMonth[month]) byMonth[month] = { total: 0, completed: 0 };
      byMonth[month].total++;
      if (s.includes("已发布") || s.includes("完成") || s.includes("完结")) byMonth[month].completed++;
    });

    const activeRisks = risks.filter((r) =>
      r.status === "风险接受" || r.status.includes("风险")
    ).length;

    return {
      total,
      completed,
      activeRisks,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
      byMonth,
      statusCounts,
    };
  }, [requirements, risks]);

  /* ==================== 月份排序 ==================== */
  const monthOrder = ["2&3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月", "未参与规划", "未分配"];
  const sortedMonths = useMemo(() => {
    return Object.entries(stats.byMonth).sort(([a], [b]) => {
      const ai = monthOrder.indexOf(a), bi = monthOrder.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [stats.byMonth]);

  /* ==================== 饼图颜色 ==================== */
  const pieColors = ["#2563EB", "#059669", "#F59E0B", "#DC2626", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16", "#94A3B8", "#64748B"];
  const statusPie = useMemo(() => {
    const entries = Object.entries(stats.statusCounts).sort(([, a], [, b]) => b - a);
    let cumulative = 0;
    return entries.map(([name, count], i) => {
      const startAngle = (cumulative / stats.total) * 360;
      cumulative += count;
      const endAngle = (cumulative / stats.total) * 360;
      return { name, count, startAngle, endAngle, color: pieColors[i % pieColors.length] };
    });
  }, [stats.statusCounts, stats.total]);

  /* ==================== 状态色 ==================== */
  const statusColor = (s: string) => {
    if (!s) return "bg-gray-100 text-gray-500 border-gray-200";
    if (s.includes("已发布") || s.includes("完成") || s.includes("完结") || s.includes("风险解除"))
      return "bg-emerald-50 text-emerald-600 border-emerald-200";
    if (s.includes("风险接受") || s.includes("阻塞"))
      return "bg-red-50 text-red-600 border-red-200";
    if (s.includes("开发") || s.includes("进行"))
      return "bg-blue-50 text-blue-600 border-blue-200";
    if (s.includes("测试"))
      return "bg-amber-50 text-amber-600 border-amber-200";
    if (s.includes("待") || s.includes("规划") || s.includes("需求"))
      return "bg-slate-100 text-slate-500 border-slate-200";
    if (s.includes("暂停") || s.includes("取消") || s.includes("关闭"))
      return "bg-red-50 text-red-500 border-red-200";
    return "bg-slate-100 text-slate-500 border-slate-200";
  };

  /* ==================== 进度条 ==================== */
  const ProgressBar = ({ value, max, color = "#2563EB" }: { value: number; max: number; color?: string }) => (
    <div className="w-full h-2 bg-[#F1F5FD] rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%`, backgroundColor: color }}
      />
    </div>
  );

  /* ==================== 饼图 ==================== */
  const PieChart = ({ segments, size = 200 }: { segments: typeof statusPie; size?: number }) => {
    const cx = size / 2, cy = size / 2, r = size / 2 - 4;
    return (
      <div className="flex flex-col items-center gap-4">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {segments.map((seg, i) => {
            const sr = (seg.startAngle * Math.PI) / 180;
            const er = (seg.endAngle * Math.PI) / 180;
            const x1 = cx + r * Math.sin(sr), y1 = cy - r * Math.cos(sr);
            const x2 = cx + r * Math.sin(er), y2 = cy - r * Math.cos(er);
            const large = seg.endAngle - seg.startAngle > 180 ? 1 : 0;
            const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
            return <path key={i} d={path} fill={seg.color} stroke="#fff" strokeWidth="1.5" />;
          })}
        </svg>
        <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center text-xs">
          {segments.slice(0, 10).map((seg, i) => (
            <span key={i} className="flex items-center gap-1.5 text-[#64748B]">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
              {seg.name}({seg.count})
            </span>
          ))}
        </div>
      </div>
    );
  };

  /* ==================== 加载/错误页 ==================== */
  if (!authChecked) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-[#F8FAFC] to-[#EEF2FF]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#2563EB] mx-auto mb-4" />
          <p className="text-[#64748B]">检查授权状态...</p>
        </div>
      </div>
    );
  }
  if (authError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-[#F8FAFC] to-[#EEF2FF]">
        <div className="text-center max-w-md p-8">
          <AlertTriangle className="w-12 h-12 text-[#DC2626] mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-[#0F172A] mb-2">授权失败</h2>
          <p className="text-[#64748B] text-sm">{authError}</p>
        </div>
      </div>
    );
  }

  /* ==================== Top Nav ==================== */
  const tabs: { key: typeof activeTab; label: string; icon: React.ReactNode }[] = [
    { key: "overview", label: "迭代概览", icon: <BarChart3 className="w-4 h-4" /> },
    { key: "list", label: "需求列表", icon: <ListChecks className="w-4 h-4" /> },
    { key: "milestone", label: "里程碑", icon: <Milestone className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F8FAFC] to-[#EEF2FF]">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-[#E4ECFC] sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#0F172A]">政务产研迭代进度看板</h1>
            <p className="text-sm text-[#94A3B8] mt-0.5">2026政务产品研发迭代规划 · 实时追踪</p>
          </div>
          <button
            onClick={() => { setLoading(true); setRequirements([]); setMilestones([]); setRisks([]); loadData(); }}
            className="flex items-center gap-2 px-4 py-2 text-sm text-[#64748B] hover:text-[#2563EB] hover:bg-[#F1F5FD] rounded-lg transition-colors"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            刷新
          </button>
        </div>

        {/* Tab Bar */}
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex gap-1 -mb-px">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === t.key
                    ? "border-[#2563EB] text-[#2563EB]"
                    : "border-transparent text-[#64748B] hover:text-[#0F172A] hover:border-[#E4ECFC]"
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* ==================== TAB 1: 迭代概览 ==================== */}
        {activeTab === "overview" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* 统计卡片 */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {loading ? [...Array(4)].map((_, i) => (
                <Card key={i} className="border-[#E4ECFC] bg-white"><CardContent className="p-6"><Skeleton className="h-16" /></CardContent></Card>
              )) : (
                <>
                  <Card className="border-[#E4ECFC] bg-white hover:shadow-lg transition-shadow">
                    <CardContent className="p-6 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider">需求总数</p>
                        <p className="text-3xl font-bold text-[#0F172A] mt-1">{stats.total}</p>
                        <p className="text-xs text-[#94A3B8] mt-1">全年度政务产品需求</p>
                      </div>
                      <div className="w-11 h-11 rounded-xl bg-[#F1F5FD] flex items-center justify-center flex-shrink-0">
                        <Layers className="w-5 h-5 text-[#2563EB]" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-[#E4ECFC] bg-white hover:shadow-lg transition-shadow">
                    <CardContent className="p-6 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider">已完成</p>
                        <p className="text-3xl font-bold text-[#059669] mt-1">{stats.completed}</p>
                        <p className="text-xs text-[#94A3B8] mt-1">已发布或测试通过</p>
                      </div>
                      <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 className="w-5 h-5 text-[#059669]" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-[#E4ECFC] bg-white hover:shadow-lg transition-shadow">
                    <CardContent className="p-6 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider">风险项</p>
                        <p className="text-3xl font-bold text-[#DC2626] mt-1">{stats.activeRisks}</p>
                        <p className="text-xs text-[#94A3B8] mt-1">当前阻塞或待解决</p>
                      </div>
                      <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle className="w-5 h-5 text-[#DC2626]" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-[#E4ECFC] bg-white hover:shadow-lg transition-shadow">
                    <CardContent className="p-6 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider">完成进度</p>
                        <p className="text-3xl font-bold text-[#2563EB] mt-1">{stats.percent}%</p>
                        <p className="text-xs text-[#94A3B8] mt-1">{stats.completed}/{stats.total}</p>
                      </div>
                      <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <TrendingUp className="w-5 h-5 text-[#2563EB]" />
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {/* 月度迭代进展 + 状态分布饼图 */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* 月度迭代进展 */}
              <Card className="lg:col-span-3 border-[#E4ECFC] bg-white">
                <div className="p-6 pb-2">
                  <h3 className="text-base font-semibold text-[#0F172A] flex items-center gap-2">
                    <Target className="w-4 h-4 text-[#2563EB]" />月度迭代进展
                  </h3>
                </div>
                <CardContent>
                  {loading ? (
                    <div className="space-y-4">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
                  ) : (
                    <div className="space-y-4">
                      {sortedMonths.map(([month, { total, completed }], idx) => {
                        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                        return (
                          <div key={month}>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-sm font-medium text-[#0F172A]">{month}</span>
                              <span className="text-xs text-[#94A3B8]">{completed}/{total} · {pct}%</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <ProgressBar value={completed} max={total} color={idx % 2 === 0 ? "#2563EB" : "#059669"} />
                              <span className="text-xs font-mono text-[#64748B] w-10 text-right">{pct}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 状态分布饼图 */}
              <Card className="lg:col-span-2 border-[#E4ECFC] bg-white">
                <div className="p-6 pb-2">
                  <h3 className="text-base font-semibold text-[#0F172A]">状态分布</h3>
                </div>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-48 w-full rounded-lg" />
                  ) : (
                    <PieChart segments={statusPie} size={180} />
                  )}
                </CardContent>
              </Card>
            </div>

            {/* 风险列表 */}
            {risks.length > 0 && (
              <Card className="border-[#E4ECFC] bg-white">
                <div className="p-6 pb-2">
                  <h3 className="text-base font-semibold text-[#0F172A] flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-[#DC2626]" />风险跟踪
                  </h3>
                </div>
                <CardContent>
                  <div className="space-y-2">
                    {risks.map((r) => (
                      <div key={r.id} className="flex items-center justify-between py-3 px-4 bg-red-50/50 rounded-lg border border-red-100">
                        <div className="flex-1 min-w-0 mr-4">
                          <p className="text-sm text-[#0F172A] truncate" title={r.title}>{r.title}</p>
                          <p className="text-xs text-[#94A3B8] mt-0.5">{r.date} · {r.product} · {r.iteration}</p>
                        </div>
                        <Badge className={`text-xs font-normal border ${statusColor(r.status)} flex-shrink-0`}>{r.status}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ==================== TAB 2: 需求列表 ==================== */}
        {activeTab === "list" && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <Card className="border-[#E4ECFC] bg-white">
              <div className="p-6 pb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-[#0F172A] flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-[#2563EB]" />
                  需求列表
                  <Badge className="bg-[#F1F5FD] text-[#2563EB] border-none font-normal ml-2">
                    {requirements.length} 条
                  </Badge>
                </h3>
              </div>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-[#E4ECFC] text-left bg-[#F8FAFC]">
                          <th className="py-3 px-4 font-semibold text-[#0F172A]">标题</th>
                          <th className="py-3 px-4 font-semibold text-[#0F172A] whitespace-nowrap">状态</th>
                          <th className="py-3 px-4 font-semibold text-[#0F172A] whitespace-nowrap">优先级</th>
                          <th className="py-3 px-4 font-semibold text-[#0F172A] whitespace-nowrap">迭代</th>
                          <th className="py-3 px-4 font-semibold text-[#0F172A] whitespace-nowrap">月度</th>
                          <th className="py-3 px-4 font-semibold text-[#0F172A] whitespace-nowrap">负责人</th>
                          <th className="py-3 px-4 font-semibold text-[#0F172A] whitespace-nowrap">排期结论</th>
                        </tr>
                      </thead>
                      <tbody>
                        {requirements.map((r, idx) => (
                          <tr
                            key={r.id}
                            className={`border-b border-[#F1F5FD] hover:bg-[#F8FAFC] transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-[#FAFBFF]"}`}
                          >
                            <td className="py-3 px-4 text-[#0F172A] max-w-sm truncate" title={r.title}>
                              {r.title || "-"}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <Badge className={`text-xs font-normal border ${statusColor(r.status)}`}>
                                {r.status || "-"}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-[#64748B] whitespace-nowrap text-xs">{r.level || "-"}</td>
                            <td className="py-3 px-4 text-[#64748B] whitespace-nowrap text-xs">{r.iteration || "-"}</td>
                            <td className="py-3 px-4 text-[#64748B] whitespace-nowrap text-xs">{r.planMonth || "-"}</td>
                            <td className="py-3 px-4 text-[#64748B] whitespace-nowrap text-xs">{r.owner || "-"}</td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <Badge className={`text-xs font-normal border ${
                                r.conclusion === "必保" ? "bg-green-50 text-green-600 border-green-200" :
                                r.conclusion === "待定" ? "bg-amber-50 text-amber-600 border-amber-200" :
                                r.conclusion === "取消" ? "bg-red-50 text-red-400 border-red-200" :
                                "bg-slate-100 text-slate-500 border-slate-200"
                              }`}>{r.conclusion || "-"}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ==================== TAB 3: 里程碑 ==================== */}
        {activeTab === "milestone" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* 里程碑时间线 */}
            <Card className="border-[#E4ECFC] bg-white">
              <div className="p-6 pb-3">
                <h3 className="text-base font-semibold text-[#0F172A] flex items-center gap-2">
                  <Target className="w-4 h-4 text-[#2563EB]" />
                  迭代里程碑
                  <Badge className="bg-[#F1F5FD] text-[#2563EB] border-none font-normal ml-2">
                    {milestones.filter(m => m.involved).length} 项活跃
                  </Badge>
                </h3>
              </div>
              <CardContent>
                {loading ? (
                  <div className="space-y-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
                ) : (
                  <div className="relative pl-8">
                    <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-[#2563EB] via-[#94A3B8] to-[#E4ECFC]" />
                    <div className="space-y-3">
                      {milestones.map((m) => (
                        <div key={m.id} className="relative group">
                          <div
                            className={`absolute -left-[23px] top-3 w-4 h-4 rounded-full border-2 z-10 transition-colors ${
                              m.actualDate
                                ? "bg-[#059669] border-[#059669]"
                                : m.involved
                                  ? "bg-white border-[#2563EB] group-hover:border-[#1D4ED8]"
                                  : "bg-white border-[#D1D5DB]"
                            }`}
                          />
                          <div className={`p-4 rounded-xl border transition-all ${
                            m.involved
                              ? "bg-white border-[#E4ECFC] hover:shadow-md hover:border-[#2563EB]/20"
                              : "bg-[#F8FAFC] border-[#E4ECFC]/50 opacity-80"
                          }`}>
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <h4 className={`text-sm font-medium ${m.involved ? "text-[#0F172A]" : "text-[#94A3B8]"}`}>
                                  {m.name}
                                </h4>
                                <div className="flex items-center gap-4 mt-1.5 text-xs text-[#94A3B8]">
                                  {m.date && (
                                    <span className="flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB]" />
                                      计划: {m.date}
                                    </span>
                                  )}
                                  {m.actualDate && (
                                    <span className="flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-[#059669]" />
                                      实际: {m.actualDate}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex-shrink-0">
                                {m.actualDate ? (
                                  <Badge className="bg-emerald-50 text-emerald-600 border-emerald-200 text-xs font-normal">已完成</Badge>
                                ) : m.involved ? (
                                  <Badge className="bg-blue-50 text-blue-600 border-blue-200 text-xs font-normal">进行中</Badge>
                                ) : (
                                  <Badge className="bg-slate-100 text-slate-400 border-slate-200 text-xs font-normal">未涉及</Badge>
                                )}
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

            {/* 月度里程碑分组 */}
            <Card className="border-[#E4ECFC] bg-white">
              <div className="p-6 pb-3">
                <h3 className="text-base font-semibold text-[#0F172A] flex items-center gap-2">
                  <Milestone className="w-4 h-4 text-[#2563EB]" />
                  按月迭代里程碑
                </h3>
              </div>
              <CardContent>
                {loading ? (
                  <div className="space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {sortedMonths.filter(([, d]) => d.total > 0).map(([month, { total, completed }]) => {
                      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                      const mtc = milestones.filter(m => m.involved);
                      return (
                        <div key={month} className="p-4 rounded-xl border border-[#E4ECFC] bg-white hover:shadow-sm transition-shadow">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-semibold text-[#0F172A]">{month}</h4>
                            <Badge className={pct >= 80 ? "bg-emerald-50 text-emerald-600 border-emerald-200" : pct >= 50 ? "bg-blue-50 text-blue-600 border-blue-200" : "bg-amber-50 text-amber-600 border-amber-200"}>
                              {pct}%
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-xs text-[#64748B] mb-2">
                            <span>{completed}/{total} 已完成</span>
                            <span>{total - completed} 剩余</span>
                          </div>
                          <ProgressBar value={completed} max={total} />
                          {mtc.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-[#F1F5FD] space-y-1">
                              {mtc.slice(0, 3).map((m) => (
                                <div key={m.id} className="flex items-center gap-2 text-xs">
                                  <span className={`w-1.5 h-1.5 rounded-full ${m.actualDate ? "bg-[#059669]" : "bg-[#2563EB]"}`} />
                                  <span className="text-[#64748B] flex-1 truncate">{m.name}</span>
                                  {m.date && <span className="text-[#94A3B8]">{m.date}</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

/* ==================== Helpers ==================== */
function asFields(r: { fields?: string | Record<string, unknown> }): Record<string, unknown> {
  if (typeof r.fields === "string") {
    try { return JSON.parse(r.fields); } catch { return {}; }
  }
  return (r.fields || {}) as Record<string, unknown>;
}

function s(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(x => typeof x === "object" && x ? (x as Record<string, unknown>).text || "" : String(x)).join(", ");
  return v != null ? String(v) : "";
}

function parseSummary(v: unknown): string {
  if (typeof v === "object" && v && "summary" in v) return String((v as Record<string, unknown>).summary || "");
  return s(v);
}
