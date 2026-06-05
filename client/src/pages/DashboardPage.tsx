import { useEffect, useState, useMemo } from "react";
import { createWps365 } from "@ks-open/capability/client/wps365";
import type { Wps365Client } from "@ks-open/capability/client/wps365";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Layers,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Target,
  RefreshCw,
  Users,
} from "lucide-react";

/* ==================== 常量 ==================== */
const FILE_ID = "Dm5Wx1ph11MNih2SbwZurxjFLUZTboQEF";
const SHEET_REQUIREMENTS = 21; // 需求管理
const SHEET_MILESTONES = 14; // 里程碑

/* ==================== 类型 ==================== */
interface DbsheetRecord {
  id?: string;
  fields?: string | Record<string, unknown>;
}

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
  status: string;
  iteration: string;
}

/* ==================== 主组件 ==================== */
export function DashboardPage() {
  const [wps, setWps] = useState<Wps365Client | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [requirements, setRequirements] = useState<ReqRow[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);

  // 初始化 SDK + 授权
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
        if (!cancelled) {
          setAuthError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 加载数据
  useEffect(() => {
    if (!wps) return;
    (async () => {
      setLoading(true);
      try {
        // 并行加载需求 + 里程碑
        const [reqRes, milRes] = await Promise.all([
          wps.dbsheet.listRecords({
            file_id: FILE_ID,
            sheet_id: SHEET_REQUIREMENTS,
            prefer_id: false,
            max_records: 500,
            page_size: 500,
          }),
          wps.dbsheet.listRecords({
            file_id: FILE_ID,
            sheet_id: SHEET_MILESTONES,
            prefer_id: false,
            max_records: 50,
          }),
        ]);

        if (reqRes.data?.records) {
          const rows: ReqRow[] = reqRes.data.records.map((r: DbsheetRecord) => {
            const f = typeof r.fields === "string" ? JSON.parse(r.fields as string) : (r.fields || {}) as Record<string, unknown>;
            return {
              id: r.id || "",
              title: String(f["标题"] ?? ""),
              status: String(f["状态"] ?? ""),
              level: String(f["需求级别"] ?? ""),
              iteration: String(f["所属迭代"] ?? ""),
              owner: String(f["负责人"] ?? ""),
              testDate: String(f["计划提测时间"] ?? ""),
              conclusion: String(f["排期结论"] ?? ""),
              category: String(f["需求分类"] ?? ""),
              planMonth: String(f["规划月度"] ?? ""),
            };
          });
          setRequirements(rows);
        }

        if (milRes.data?.records) {
          const rows: Milestone[] = milRes.data.records.map((r: DbsheetRecord) => {
            const f = typeof r.fields === "string" ? JSON.parse(r.fields as string) : (r.fields || {}) as Record<string, unknown>;
            return {
              id: r.id || "",
              name: String(f["标题"] ?? f["名称"] ?? f["事项"] ?? ""),
              date: String(f["日期"] ?? f["时间"] ?? ""),
              status: String(f["状态"] ?? ""),
              iteration: String(f["迭代"] ?? f["所属迭代"] ?? ""),
            };
          });
          setMilestones(rows);
        }
      } catch (err) {
        console.error("加载数据失败:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [wps]);

  // 统计数据
  const stats = useMemo(() => {
    const total = requirements.length;
    const statusCounts: Record<string, number> = {};
    let completed = 0;
    let inProgress = 0;
    requirements.forEach((r) => {
      const s = r.status;
      statusCounts[s] = (statusCounts[s] || 0) + 1;
      if (s.includes("已发布") || s.includes("完成") || s.includes("完结")) completed++;
      else if (s.includes("开发") || s.includes("测试") || s.includes("进行")) inProgress++;
    });
    const aiCount = 0; // 需要字段支持，暂不计算
    return { total, completed, inProgress, aiCount, statusCounts };
  }, [requirements]);

  // 按迭代分组
  const iterationGroups = useMemo(() => {
    const groups: Record<string, number> = {};
    requirements.forEach((r) => {
      const iter = r.iteration || "未分配";
      groups[iter] = (groups[iter] || 0) + 1;
    });
    return Object.entries(groups)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6);
  }, [requirements]);

  // 按状态分布
  const statusList = useMemo(() => {
    return Object.entries(stats.statusCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8);
  }, [stats.statusCounts]);

  /* ==================== 授权状态页 ==================== */
  if (!authChecked) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F8FAFC]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#2563EB] mx-auto mb-4" />
          <p className="text-[#64748B]">正在检查授权状态...</p>
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

  /* ==================== 状态色映射 ==================== */
  const statusColor = (s: string) => {
    if (s.includes("已发布") || s.includes("完成") || s.includes("完结")) return "bg-[#059669]/10 text-[#059669] border-[#059669]/20";
    if (s.includes("开发") || s.includes("进行")) return "bg-[#2563EB]/10 text-[#2563EB] border-[#2563EB]/20";
    if (s.includes("测试")) return "bg-[#F59E0B]/10 text-[#D97706] border-[#F59E0B]/20";
    if (s.includes("待") || s.includes("规划") || s.includes("需求")) return "bg-[#94A3B8]/10 text-[#64748B] border-[#94A3B8]/20";
    if (s.includes("暂停") || s.includes("取消") || s.includes("关闭")) return "bg-[#DC2626]/10 text-[#DC2626] border-[#DC2626]/20";
    return "bg-[#94A3B8]/10 text-[#64748B] border-[#94A3B8]/20";
  };

  /* ==================== 渲染 ==================== */
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* 顶部导航 */}
      <header className="bg-white border-b border-[#E4ECFC] sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[#0F172A]">政务产研迭代进度看板</h1>
            <p className="text-sm text-[#94A3B8] mt-0.5">2026年政务产品研发迭代规划 — 实时数据</p>
          </div>
          <button
            onClick={() => { setLoading(true); setRequirements([]); setMilestones([]); }}
            className="flex items-center gap-2 px-4 py-2 text-sm text-[#64748B] hover:text-[#2563EB] hover:bg-[#F1F5FD] rounded-lg transition-colors"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            刷新数据
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* 统计卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="border-[#E4ECFC]">
                <CardContent className="p-6"><Skeleton className="h-16" /></CardContent>
              </Card>
            ))
          ) : (
            <>
              <Card className="border-[#E4ECFC] hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[#94A3B8]">需求总数</p>
                      <p className="text-3xl font-bold text-[#0F172A] mt-1">{stats.total}</p>
                    </div>
                    <div className="w-10 h-10 rounded-lg bg-[#F1F5FD] flex items-center justify-center">
                      <Layers className="w-5 h-5 text-[#2563EB]" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-[#E4ECFC] hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[#94A3B8]">进行中</p>
                      <p className="text-3xl font-bold text-[#2563EB] mt-1">{stats.inProgress}</p>
                    </div>
                    <div className="w-10 h-10 rounded-lg bg-[#EEF2FF] flex items-center justify-center">
                      <Clock className="w-5 h-5 text-[#2563EB]" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-[#E4ECFC] hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[#94A3B8]">已完成</p>
                      <p className="text-3xl font-bold text-[#059669] mt-1">{stats.completed}</p>
                    </div>
                    <div className="w-10 h-10 rounded-lg bg-[#059669]/10 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-[#059669]" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-[#E4ECFC] hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[#94A3B8]">负责人数</p>
                      <p className="text-3xl font-bold text-[#0F172A] mt-1">
                        {new Set(requirements.filter(r => r.owner).map(r => r.owner)).size}
                      </p>
                    </div>
                    <div className="w-10 h-10 rounded-lg bg-[#F1F5FD] flex items-center justify-center">
                      <Users className="w-5 h-5 text-[#2563EB]" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* 中间区域：需求列表 + 统计详情 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 需求列表 - 占2列 */}
          <Card className="lg:col-span-2 border-[#E4ECFC]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-[#0F172A]">需求列表</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#E4ECFC] text-left">
                        <th className="py-3 pr-4 font-medium text-[#64748B]">标题</th>
                        <th className="py-3 pr-4 font-medium text-[#64748B] whitespace-nowrap">状态</th>
                        <th className="py-3 pr-4 font-medium text-[#64748B] whitespace-nowrap">迭代</th>
                        <th className="py-3 pr-4 font-medium text-[#64748B] whitespace-nowrap">负责人</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requirements.slice(0, 50).map((r) => (
                        <tr key={r.id} className="border-b border-[#F1F5FD] hover:bg-[#F8FAFC] transition-colors">
                          <td className="py-3 pr-4 text-[#0F172A] max-w-xs truncate" title={r.title}>
                            {r.title || "-"}
                          </td>
                          <td className="py-3 pr-4 whitespace-nowrap">
                            <Badge className={`text-xs font-normal border ${statusColor(r.status)}`}>
                              {r.status || "-"}
                            </Badge>
                          </td>
                          <td className="py-3 pr-4 text-[#64748B] whitespace-nowrap">{r.iteration || "-"}</td>
                          <td className="py-3 pr-4 text-[#64748B] whitespace-nowrap">{r.owner || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {requirements.length > 50 && (
                    <p className="text-xs text-[#94A3B8] mt-3 text-center">
                      显示前 50 条，共 {requirements.length} 条需求
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 右侧统计 */}
          <div className="space-y-6">
            {/* 按迭代分布 */}
            <Card className="border-[#E4ECFC]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-[#0F172A] flex items-center gap-2">
                  <Target className="w-4 h-4 text-[#2563EB]" />
                  迭代分布
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
                ) : (
                  <div className="space-y-3">
                    {iterationGroups.map(([name, count]) => (
                      <div key={name} className="flex items-center justify-between">
                        <span className="text-sm text-[#64748B] truncate flex-1 mr-2">{name}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-[#F1F5FD] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#2563EB] rounded-full transition-all"
                              style={{ width: `${Math.min(100, (count / requirements.length) * 100)}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium text-[#0F172A] w-6 text-right">{count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 状态分布 */}
            <Card className="border-[#E4ECFC]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-[#0F172A]">状态分布</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6" />)}</div>
                ) : (
                  <div className="space-y-2">
                    {statusList.map(([name, count]) => (
                      <div key={name} className="flex items-center justify-between">
                        <Badge className={`text-xs font-normal border ${statusColor(name)}`}>{name}</Badge>
                        <span className="text-sm font-medium text-[#0F172A]">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* 里程碑时间线 */}
        <Card className="border-[#E4ECFC]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-[#0F172A] flex items-center gap-2">
              <Target className="w-4 h-4 text-[#2563EB]" />
              里程碑
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
              </div>
            ) : milestones.length === 0 ? (
              <p className="text-sm text-[#94A3B8] text-center py-8">暂无里程碑数据</p>
            ) : (
              <div className="relative">
                {/* 时间线 */}
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-[#E4ECFC]" />
                <div className="space-y-4">
                  {milestones.map((m, idx) => (
                    <div key={m.id} className="flex items-start gap-4 ml-2 relative">
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-1 z-10 ${
                        m.status.includes("完成") || m.status.includes("已发布")
                          ? "bg-[#059669] border-[#059669]"
                          : "bg-white border-[#2563EB]"
                      }`} />
                      <div className="flex-1 bg-white border border-[#E4ECFC] rounded-lg p-4 hover:shadow-sm transition-shadow">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium text-[#0F172A]">{m.name}</h4>
                          {m.status && (
                            <Badge className={`text-xs font-normal border ${statusColor(m.status)}`}>{m.status}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-[#94A3B8]">
                          {m.date && <span>📅 {m.date}</span>}
                          {m.iteration && <span>🔁 {m.iteration}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
