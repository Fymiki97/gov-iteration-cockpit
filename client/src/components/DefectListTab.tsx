import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bug,
  Clock,
  Download,
  RefreshCw,
  Search,
  TrendingUp,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DEFECT_TEAMS,
  PRIORITY_COLORS,
  PRIORITY_OPTIONS,
  SEED_DEFECTS,
  SEVERITY_COLORS,
  SEVERITY_OPTIONS,
  STATUS_COLORS,
  computeDefectStats,
  fetchOnesDefects,
  filterDefects,
  isOverdue,
  isUnrepaired,
  loadExtraDefects,
  mergeDefects,
  ownerAvatarColor,
  uniqueValues,
  type DefectTeam,
  type DefectRow,
  type DefectStatus,
} from "@/lib/defect";

const FILTER_ALL = "__all__";
const STATUSES: DefectStatus[] = ["待处理", "处理中", "待验证"];

function exportDefectsCsv(rows: DefectRow[]) {
  const headers = ["缺陷ID", "缺陷标题", "所属迭代", "优先级", "严重程度", "状态", "所属模块", "负责人", "创建时间", "截止日期"];
  const lines = [
    headers.join(","),
    ...rows.map((item) => [
      item.bugId,
      `"${item.title.replaceAll("\"", "\"\"")}"`,
      item.iteration,
      item.priority,
      item.severity,
      item.status,
      item.module,
      item.owner,
      item.createdAt,
      item.deadline,
    ].join(",")),
  ];
  const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `缺陷列表_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function DefectListTab() {
  const [defects, setDefects] = useState<DefectRow[]>(() => mergeDefects(SEED_DEFECTS, loadExtraDefects()));
  const [onesRows, setOnesRows] = useState<DefectRow[]>([]);
  const [onesLoading, setOnesLoading] = useState(false);
  const [onesSource, setOnesSource] = useState<"live" | "snapshot" | "">("");
  const [currentTeam, setCurrentTeam] = useState<DefectTeam>(DEFECT_TEAMS[0]);
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState<string[]>(["S-致命", "A-严重"]);
  const [status, setStatus] = useState<string[]>([]);
  const [priority, setPriority] = useState<string[]>([]);
  const [iteration, setIteration] = useState(FILTER_ALL);
  const [itersExpanded, setItersExpanded] = useState(false);
  const [unrepairedOnly, setUnrepairedOnly] = useState(false);
  const [detail, setDetail] = useState<DefectRow | null>(null);

  const teamDefects = defects.filter((item) => item.team === currentTeam);
  // 统计卡片跟随筛选条件（含迭代），但不受「仅看未修复」开关影响，
  // 避免勾选后修复率/待修复数互相矛盾
  const scoped = filterDefects({
    defects: teamDefects,
    search,
    severities: severity,
    statuses: status,
    priorities: priority,
    iterations: iteration === FILTER_ALL ? [] : [iteration],
  });
  // 统计含已关闭缺陷，但列表只展示未完成缺陷（待处理/处理中/待验证），
  // 已修复与已关闭不再出现在列表（避免大列表卡顿）
  const filtered = scoped
    .filter((item) => isUnrepaired(item.status))
    .filter((item) => !unrepairedOnly || isUnrepaired(item.status));
  const stats = computeDefectStats(scoped);
  // 按迭代内缺陷的最新创建时间降序，默认只展开最新变动的 3 个迭代
  const latestByIter = new Map<string, string>();
  for (const item of teamDefects) {
    if (!item.iteration) continue;
    const prev = latestByIter.get(item.iteration);
    if (!prev || item.createdAt > prev) latestByIter.set(item.iteration, item.createdAt);
  }
  const iterations = uniqueValues(teamDefects.map((item) => item.iteration))
    .sort((a, b) => (latestByIter.get(b) ?? "").localeCompare(latestByIter.get(a) ?? ""));
  const VISIBLE_ITER_COUNT = 3;
  const selectedIterHidden = iteration !== FILTER_ALL && !iterations.slice(0, VISIBLE_ITER_COUNT).includes(iteration);
  const visibleIters = itersExpanded || selectedIterHidden ? iterations : iterations.slice(0, VISIBLE_ITER_COUNT);
  const collapseIters = () => {
    setItersExpanded(false);
    if (iteration !== FILTER_ALL && !iterations.slice(0, VISIBLE_ITER_COUNT).includes(iteration)) setIteration(FILTER_ALL);
  };
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchOnesDefects();
        if (cancelled) return;
        setOnesRows(result.rows);
        setOnesSource(result.source);
        setDefects(mergeDefects(result.rows, loadExtraDefects()));
      } catch (err) {
        if (!cancelled) {
          const detail = err instanceof Error && err.message ? err.message : "";
          toast.error(detail ? `ONES 缺陷拉取失败：${detail}` : "ONES 缺陷拉取失败，当前显示本地数据");
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-6 border-b border-[#E4ECFC]">
        {DEFECT_TEAMS.map((team) => (
          <button
            key={team}
            type="button"
            onClick={() => {
              setCurrentTeam(team);
              setSeverity(["S-致命", "A-严重"]);
              setStatus([]);
              setPriority([]);
              setIteration(FILTER_ALL);
            }}
            className={`pb-3 text-sm ${currentTeam === team ? "font-medium text-[#2A6FDB] border-b-2 border-[#2A6FDB]" : "text-[#94A3B8] hover:text-[#64748B]"}`}
          >
            {team}
          </button>
        ))}
      </div>

      {iterations.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#94A3B8] mr-1">所属迭代</span>
          <button
            type="button"
            onClick={() => setIteration(FILTER_ALL)}
            className={`h-7 px-3 rounded-full text-xs border transition-colors ${iteration === FILTER_ALL ? "bg-[#2A6FDB] border-[#2A6FDB] text-white font-medium" : "bg-white border-[#E4ECFC] text-[#667085] hover:border-[#2A6FDB] hover:text-[#2A6FDB]"}`}
          >
            全部
          </button>
          {visibleIters.map((name) => {
            const count = teamDefects.filter((item) => item.iteration === name).length;
            const active = iteration === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => setIteration(active ? FILTER_ALL : name)}
                className={`h-7 px-3 rounded-full text-xs border transition-colors inline-flex items-center gap-1.5 ${active ? "bg-[#2A6FDB] border-[#2A6FDB] text-white font-medium" : "bg-white border-[#E4ECFC] text-[#667085] hover:border-[#2A6FDB] hover:text-[#2A6FDB]"}`}
              >
                {name}
                <span className={`px-1.5 rounded-full text-[10px] leading-4 ${active ? "bg-white/20" : "bg-[#F2F4F7] text-[#98A2B3]"}`}>{count}</span>
              </button>
            );
          })}
          {iterations.length > VISIBLE_ITER_COUNT && (
            <button
              type="button"
              onClick={() => (itersExpanded || selectedIterHidden ? collapseIters() : setItersExpanded(true))}
              className="h-7 px-3 rounded-full text-xs border border-dashed border-[#CBD5E1] text-[#667085] hover:border-[#2A6FDB] hover:text-[#2A6FDB] transition-colors inline-flex items-center gap-1"
            >
              {itersExpanded || selectedIterHidden ? "收起" : `展开全部 ${iterations.length} 个迭代`}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${itersExpanded || selectedIterHidden ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="缺陷总数"
          value={String(stats.total)}
          hint={`待处理 ${stats.pending} / 处理中 ${stats.processing}`}
          icon={<Bug className="w-5 h-5 text-[#2A6FDB]" />}
          iconClass="bg-[#EFF4FF]"
        />
        <StatCard
          label="待修复缺陷"
          value={String(stats.unrepaired)}
          hint="点击查看未修复缺陷"
          valueClass="text-[#F79009]"
          icon={<AlertTriangle className="w-5 h-5 text-[#F79009]" />}
          iconClass="bg-[#FFFAEB]"
          onClick={() => { setUnrepairedOnly(true); setStatus([]); setSeverity([]); }}
        />
        <StatCard
          label="严重缺陷"
          value={String(stats.fatal)}
          hint="需优先处理"
          valueClass="text-[#D92D20]"
          icon={<Clock className="w-5 h-5 text-[#D92D20]" />}
          iconClass="bg-[#FEF3F2]"
          onClick={() => { setSeverity(["S-致命", "A-严重"]); setStatus([]); setUnrepairedOnly(true); }}
        />
        <StatCard
          label="修复率"
          value={`${stats.fixRate}%`}
          hint={`已解决 ${stats.resolved} / 总计 ${stats.total}`}
          icon={<TrendingUp className="w-5 h-5 text-[#12B76A]" />}
          iconClass="bg-[#ECFDF3]"
        />
      </div>

      <Card className="shadow-sm border-[#E4ECFC] rounded-[10px] py-0 gap-0">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索缺陷ID或标题..."
                className="pl-9 h-9 text-sm border-[#E4ECFC]"
              />
              {search && (
                <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="w-4 h-4 text-[#94A3B8]" />
                </button>
              )}
            </div>
            <MultiSelect value={severity} onChange={setSeverity} allLabel="全部严重程度" options={SEVERITY_OPTIONS.map(s => ({ value: s, label: s }))} />
            <MultiSelect value={status} onChange={setStatus} allLabel="全部状态" options={STATUSES.map(s => ({ value: s, label: s }))} />
            <MultiSelect value={priority} onChange={setPriority} allLabel="全部优先级" options={PRIORITY_OPTIONS.map(p => ({ value: p, label: p }))} />
            <FilterSelect value={iteration} onChange={setIteration} allLabel="全部迭代" options={iterations} />
            {unrepairedOnly && (
              <Badge
                className="h-9 gap-1 cursor-pointer bg-[#FFFAEB] text-[#B54708] border-[#FEDF89] font-normal"
                onClick={() => setUnrepairedOnly(false)}
              >
                仅未修复 <X className="w-3 h-3" />
              </Badge>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={() => { exportDefectsCsv(filtered); toast.success("已导出当前筛选结果"); }}
                className="h-9 px-3 inline-flex items-center gap-1.5 text-sm text-[#344054] border border-[#E4ECFC] rounded-lg hover:bg-[#F8FAFC]"
              >
                <Download className="w-4 h-4" /> 导出
              </button>
              <button
                type="button"
                disabled={onesLoading}
                onClick={async () => {
                  setOnesLoading(true);
                  try {
                    const result = await fetchOnesDefects({ refresh: true });
                    setOnesRows(result.rows);
                    setOnesSource(result.source);
                    setDefects(mergeDefects(result.rows, loadExtraDefects()));
                    toast.success(result.source === "snapshot"
                      ? `云端无法访问内网 ONES，已显示最近快照（${result.rows.length} 条）`
                      : `已刷新，ONES 共 ${result.rows.length} 条活跃缺陷`);
                  } catch (err) {
                    const detail = err instanceof Error && err.message ? err.message : "";
                    toast.error(detail ? `ONES 拉取失败：${detail}` : "ONES 拉取失败，已保留当前数据");
                  } finally {
                    setOnesLoading(false);
                  }
                }}
                className="h-9 px-3 inline-flex items-center gap-1.5 text-sm text-[#344054] border border-[#E4ECFC] rounded-lg hover:bg-[#F8FAFC] disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${onesLoading ? "animate-spin" : ""}`} /> 刷新
              </button>
              {onesSource === "snapshot" && (
                <span className="text-xs text-[#98A2B3]">云端无法访问内网 ONES，当前为最近快照</span>
              )}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-16 text-[#94A3B8]">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">没有匹配的缺陷</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E4ECFC] text-left text-[#667085]">
                    {["缺陷ID", "缺陷标题", "所属迭代", "优先级", "严重程度", "状态", "所属模块", "负责人", "创建时间", "截止日期", "操作"].map((head) => (
                      <th key={head} className="py-0 h-12 px-3 font-medium whitespace-nowrap">{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const overdue = isOverdue(item);
                    return (
                      <tr key={item.id} className="border-b border-[#F1F5FD] hover:bg-[#F8FAFC] h-12">
                        <td className="px-3 whitespace-nowrap font-medium">
                          {item.onesUrl ? (
                            <a href={item.onesUrl} target="_blank" rel="noreferrer" className="text-[#2A6FDB] hover:underline" title="在 ONES 中打开缺陷详情">{item.bugId}</a>
                          ) : (
                            <span className="text-[#2A6FDB]">{item.bugId}</span>
                          )}
                        </td>
                        <td className="px-3 text-[#0F172A] max-w-[280px] truncate" title={item.title}>{item.title}</td>
                        <td className="px-3 whitespace-nowrap text-[#344054] max-w-[180px] truncate" title={item.iteration}>{item.iteration || "-"}</td>
                        <td className="px-3 whitespace-nowrap">
                          <Badge className={`border font-normal ${PRIORITY_COLORS[item.priority]}`}>{item.priority}</Badge>
                        </td>
                        <td className="px-3 whitespace-nowrap">
                          <Badge className={`border font-normal ${SEVERITY_COLORS[item.severity]}`}>{item.severity}</Badge>
                        </td>
                        <td className="px-3 whitespace-nowrap">
                          <Badge className={`border font-normal ${STATUS_COLORS[item.status]}`}>{item.status}</Badge>
                        </td>
                        <td className="px-3 whitespace-nowrap text-[#344054]">{item.module}</td>
                        <td className="px-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <span className={`inline-flex size-6 items-center justify-center rounded-full text-[11px] text-white ${ownerAvatarColor(item.owner)}`}>
                              {item.owner.slice(0, 1)}
                            </span>
                            {item.owner}
                          </span>
                        </td>
                        <td className="px-3 whitespace-nowrap text-[#667085]">{item.createdAt}</td>
                        <td className={`px-3 whitespace-nowrap ${overdue ? "text-[#D92D20] font-semibold" : "text-[#667085]"}`}>
                          {item.deadline || "-"}
                        </td>
                        <td className="px-3 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <button type="button" onClick={() => setDetail(item)} className="text-[#2A6FDB] hover:underline">详情</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={(open) => { if (!open) setDetail(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detail?.bugId} {detail?.title}
              {detail?.onesUrl && (
                <a href={detail.onesUrl} target="_blank" rel="noreferrer" className="text-sm font-normal text-[#2A6FDB] hover:underline">在 ONES 中打开 ↗</a>
              )}
            </DialogTitle>
            <DialogDescription>{detail?.team} · {detail?.iteration || "-"} · {detail?.module} · {detail?.owner} · {detail?.status}</DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <p className="text-[#94A3B8]">所属迭代</p><p className="text-[#0F172A]">{detail.iteration || "-"}</p>
              <p className="text-[#94A3B8]">优先级</p><p className="text-[#0F172A]">{detail.priority}</p>
              <p className="text-[#94A3B8]">严重程度</p><p className="text-[#0F172A]">{detail.severity}</p>
              <p className="text-[#94A3B8]">提交人</p><p className="text-[#0F172A]">{detail.reporter}</p>
              <p className="text-[#94A3B8]">创建时间</p><p className="text-[#0F172A]">{detail.createdAt}</p>
              <p className="text-[#94A3B8]">截止日期</p>
              <p className={isOverdue(detail) ? "text-[#D92D20] font-semibold" : "text-[#0F172A]"}>{detail.deadline || "-"}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}

function StatCard(props: {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
  iconClass: string;
  valueClass?: string;
  onClick?: () => void;
}) {
  return (
    <Card
      className={`shadow-sm border-[#E4ECFC] rounded-[10px] py-0 gap-0 ${props.onClick ? "cursor-pointer hover:border-[#2A6FDB]/30 hover:shadow-md transition-all" : ""}`}
      onClick={props.onClick}
    >
      <CardContent className="p-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-[#94A3B8]">{props.label}</p>
          <p className={`text-[28px] leading-none font-semibold mt-2 ${props.valueClass ?? "text-[#0F172A]"}`}>{props.value}</p>
          <p className="text-xs text-[#94A3B8] mt-2">{props.hint}</p>
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${props.iconClass}`}>{props.icon}</div>
      </CardContent>
    </Card>
  );
}

function FilterSelect(props: {
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  options: string[];
  hideAll?: boolean;
}) {
  // Base UI 的 SelectValue 需要显式 items 映射才能在弹层未打开时渲染 label
  const items: Record<string, ReactNode> = {
    ...(!props.hideAll ? { [FILTER_ALL]: props.allLabel } : {}),
    ...Object.fromEntries(props.options.map((item) => [item, item])),
  };
  return (
    <Select value={props.value} items={items} onValueChange={(val) => props.onChange(String(val ?? (props.hideAll ? props.options[0] : FILTER_ALL)))}>
      <SelectTrigger className="w-[150px] h-9 border-[#E4ECFC] bg-white">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {!props.hideAll && <SelectItem value={FILTER_ALL}>{props.allLabel}</SelectItem>}
        {props.options.map((item) => (
          <SelectItem key={item} value={item}>{item}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
