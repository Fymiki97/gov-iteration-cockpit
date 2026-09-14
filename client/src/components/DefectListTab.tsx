import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bell,
  Bug,
  Clock,
  Download,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  TrendingUp,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DefectRemindConfigDialog } from "@/components/DefectRemindConfigDialog";
import { DefectRemindSendDialog } from "@/components/DefectRemindSendDialog";
import {
  DEFECT_TEAMS,
  PRIORITY_COLORS,
  PRIORITY_OPTIONS,
  SEED_DEFECTS,
  SEVERITY_COLORS,
  SEVERITY_OPTIONS,
  STATUS_COLORS,
  computeDefectStats,
  filterDefects,
  isOverdue,
  isTaskDue,
  isUnrepaired,
  loadExtraDefects,
  mergeDefects,
  nextBugId,
  ownerAvatarColor,
  saveExtraDefects,
  uniqueValues,
  type DefectTeam,
  type DefectPriority,
  type DefectRemindTask,
  type DefectRow,
  type DefectSeverity,
  type DefectStatus,
} from "@/lib/defect";
import { fetchRemindTasks, runRemindTask } from "@/lib/defect-remind-api";

const FILTER_ALL = "__all__";
const STATUSES: DefectStatus[] = ["待处理", "处理中", "待验证", "已修复", "已关闭"];

function exportDefectsCsv(rows: DefectRow[]) {
  const headers = ["缺陷ID", "缺陷标题", "优先级", "严重级别", "状态", "所属模块", "负责人", "创建时间", "截止日期"];
  const lines = [
    headers.join(","),
    ...rows.map((item) => [
      item.bugId,
      `"${item.title.replaceAll("\"", "\"\"")}"`,
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
  const [currentTeam, setCurrentTeam] = useState<DefectTeam>(DEFECT_TEAMS[0]);
  const [tasks, setTasks] = useState<DefectRemindTask[]>([]);
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState(FILTER_ALL);
  const [status, setStatus] = useState(FILTER_ALL);
  const [priority, setPriority] = useState(FILTER_ALL);
  const [moduleName, setModuleName] = useState(FILTER_ALL);
  const [unrepairedOnly, setUnrepairedOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [configOpen, setConfigOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendDefects, setSendDefects] = useState<DefectRow[]>([]);
  const [detail, setDetail] = useState<DefectRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    priority: "较高" as DefectPriority,
    severity: "A-严重" as DefectSeverity,
    status: "待处理" as DefectStatus,
    module: "",
    owner: "",
    deadline: "",
  });

  const teamDefects = defects.filter((item) => item.team === currentTeam);
  const filtered = filterDefects({
    defects: teamDefects,
    search,
    severities: severity === FILTER_ALL ? [] : [severity],
    statuses: status === FILTER_ALL ? [] : [status],
    priorities: priority === FILTER_ALL ? [] : [priority],
    modules: moduleName === FILTER_ALL ? [] : [moduleName],
  }).filter((item) => !unrepairedOnly || isUnrepaired(item.status));
  const stats = computeDefectStats(teamDefects);
  const modules = uniqueValues(teamDefects.map((item) => item.module));
  const allFilteredSelected = filtered.length > 0 && filtered.every((item) => selectedIds.includes(item.id));
  const selectedRows = defects.filter((item) => selectedIds.includes(item.id));

  useEffect(() => {
    let cancelled = false;
    fetchRemindTasks()
      .then(async (loaded) => {
        if (cancelled) return;
        setTasks(loaded);
        const currentDefects = mergeDefects(SEED_DEFECTS, loadExtraDefects());
        const due = loaded.filter((task) => isTaskDue(task));
        if (due.length === 0) return;
        const next = [...loaded];
        for (const task of due) {
          try {
            const result = await runRemindTask({ taskId: task.id, defects: currentDefects, scheduled: true });
            if (cancelled || !result.sent) continue;
            const index = next.findIndex((item) => item.id === task.id);
            if (index >= 0) {
              next[index] = {
                ...next[index],
                lastRunAt: new Date().toISOString(),
                lastRunStatus: "success",
                lastRunMessage: `已发送 ${result.count} 条`,
              };
            }
            toast.success(`定时任务「${task.name}」已通过${result.channel}发送 ${result.count} 条`);
          } catch {
            // 页面打开时的到期自动发送失败不打断查看
          }
        }
        if (!cancelled) setTasks(next);
      })
      .catch(() => {
        if (!cancelled) toast.error("提醒任务加载失败，可稍后在配置中重试");
      });
    return () => { cancelled = true; };
  }, []);

  const replaceTasks = (next: DefectRemindTask[]) => {
    setTasks(next);
  };

  const patchTask = (task: DefectRemindTask) => {
    setTasks(tasks.map((item) => item.id === task.id ? task : item));
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds(checked ? [...selectedIds, id] : selectedIds.filter((item) => item !== id));
  };

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? filtered.map((item) => item.id) : []);
  };

  const unrepairedOf = (rows: DefectRow[]) => rows.filter((item) => isUnrepaired(item.status));

  const openRemind = (rows: DefectRow[]) => {
    const unrepaired = unrepairedOf(rows);
    if (unrepaired.length === 0) {
      toast.error("当前没有可提醒的未修复缺陷");
      return;
    }
    if (tasks.filter((item) => item.enabled && item.webhook.trim()).length === 0) {
      toast.info("请先配置提醒任务");
      setConfigOpen(true);
      return;
    }
    setSendDefects(unrepaired);
    setSendOpen(true);
  };

  const createDefect = () => {
    if (!draft.title.trim() || !draft.owner.trim() || !draft.module.trim()) {
      toast.error("请填写标题、所属模块和负责人");
      return;
    }
    setCreating(true);
    const extras = loadExtraDefects();
    const created: DefectRow = {
      id: `local_${Date.now().toString(36)}`,
      bugId: nextBugId(mergeDefects(SEED_DEFECTS, extras)),
      title: draft.title.trim(),
      priority: draft.priority,
      severity: draft.severity,
      status: draft.status,
      team: currentTeam,
      module: draft.module.trim(),
      owner: draft.owner.trim(),
      reporter: draft.owner.trim(),
      createdAt: new Date().toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-"),
      deadline: draft.deadline,
    };
    const nextExtras = [created, ...extras];
    saveExtraDefects(nextExtras);
    setDefects(mergeDefects(SEED_DEFECTS, nextExtras));
    setCreateOpen(false);
    setDraft({ title: "", priority: "较高", severity: "A-严重", status: "待处理", module: "", owner: "", deadline: "" });
    setCreating(false);
    toast.success(`已新建 ${created.bugId}`);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-6 border-b border-[#E4ECFC]">
        {DEFECT_TEAMS.map((team) => (
          <button
            key={team}
            type="button"
            onClick={() => {
              setCurrentTeam(team);
              setSelectedIds([]);
              setModuleName(FILTER_ALL);
            }}
            className={`pb-3 text-sm ${currentTeam === team ? "font-medium text-[#2A6FDB] border-b-2 border-[#2A6FDB]" : "text-[#94A3B8] hover:text-[#64748B]"}`}
          >
            {team}
          </button>
        ))}
      </div>

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
          onClick={() => { setUnrepairedOnly(true); setStatus(FILTER_ALL); setSeverity(FILTER_ALL); }}
        />
        <StatCard
          label="致命缺陷"
          value={String(stats.fatal)}
          hint="需优先处理"
          valueClass="text-[#D92D20]"
          icon={<Clock className="w-5 h-5 text-[#D92D20]" />}
          iconClass="bg-[#FEF3F2]"
          onClick={() => { setSeverity("S-致命"); setStatus(FILTER_ALL); setUnrepairedOnly(true); }}
        />
        <StatCard
          label="修复率"
          value={`${stats.fixRate}%`}
          hint={`已解决 ${stats.resolved} / 总计 ${stats.total}`}
          icon={<TrendingUp className="w-5 h-5 text-[#12B76A]" />}
          iconClass="bg-[#ECFDF3]"
        />
      </div>

      <div className="rounded-[10px] border border-[#C7D7FE] bg-[#F5F8FF] px-5 py-4 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#2A6FDB] text-white flex items-center justify-center shrink-0">
            <Bell className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#0F172A]">一键提醒未修复缺陷</p>
            <p className="text-xs text-[#64748B] mt-1">可配置通知渠道、接收对象、严重级别过滤与消息模板，一键批量催办</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setConfigOpen(true)}
            className="h-9 px-3.5 inline-flex items-center gap-1.5 text-sm font-medium text-[#344054] bg-white border border-[#E4ECFC] rounded-lg hover:bg-[#F8FAFC]"
          >
            <Settings2 className="w-4 h-4" /> 提醒配置
          </button>
          <button
            type="button"
            onClick={() => openRemind(selectedRows.length > 0 ? selectedRows : unrepairedOf(filtered.length > 0 ? filtered : teamDefects))}
            className="h-9 px-3.5 inline-flex items-center gap-1.5 text-sm font-medium text-white bg-[#F79009] hover:bg-[#DC6803] rounded-lg"
          >
            <Send className="w-4 h-4" /> 一键提醒未修复
          </button>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="rounded-[10px] border border-[#E4ECFC] bg-white px-4 py-2.5 flex items-center justify-between gap-3">
          <p className="text-sm text-[#64748B]">已选 {selectedIds.length} 条缺陷</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openRemind(selectedRows)}
              className="h-8 px-3 text-sm font-medium text-white bg-[#F79009] hover:bg-[#DC6803] rounded-lg"
            >
              批量提醒
            </button>
            <button type="button" onClick={() => setSelectedIds([])} className="h-8 px-3 text-sm text-[#64748B] border border-[#E4ECFC] rounded-lg hover:bg-[#F8FAFC]">
              取消选择
            </button>
          </div>
        </div>
      )}

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
            <FilterSelect value={severity} onChange={setSeverity} allLabel="全部严重级别" options={[...SEVERITY_OPTIONS]} />
            <FilterSelect value={status} onChange={(val) => { setStatus(val); setUnrepairedOnly(false); }} allLabel="全部状态" options={STATUSES} />
            <FilterSelect value={priority} onChange={setPriority} allLabel="全部优先级" options={[...PRIORITY_OPTIONS]} />
            <FilterSelect value={moduleName} onChange={setModuleName} allLabel="全部模块" options={modules} />
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
                onClick={() => { setDefects(mergeDefects(SEED_DEFECTS, loadExtraDefects())); toast.success("已刷新缺陷列表"); }}
                className="h-9 px-3 inline-flex items-center gap-1.5 text-sm text-[#344054] border border-[#E4ECFC] rounded-lg hover:bg-[#F8FAFC]"
              >
                <RefreshCw className="w-4 h-4" /> 刷新
              </button>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="h-9 px-3 inline-flex items-center gap-1.5 text-sm font-medium text-white bg-[#2A6FDB] hover:bg-[#1F5DC2] rounded-lg"
              >
                <Plus className="w-4 h-4" /> 新建缺陷
              </button>
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
                    <th className="py-0 h-12 px-3 w-10">
                      <Checkbox
                        checked={allFilteredSelected}
                        onCheckedChange={(checked) => toggleAll(checked === true)}
                      />
                    </th>
                    {["缺陷ID", "缺陷标题", "优先级", "严重级别", "状态", "所属模块", "负责人", "创建时间", "截止日期", "操作"].map((head) => (
                      <th key={head} className="py-0 h-12 px-3 font-medium whitespace-nowrap">{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const overdue = isOverdue(item);
                    return (
                      <tr key={item.id} className="border-b border-[#F1F5FD] hover:bg-[#F8FAFC] h-12">
                        <td className="px-3">
                          <Checkbox
                            checked={selectedIds.includes(item.id)}
                            onCheckedChange={(checked) => toggleOne(item.id, checked === true)}
                          />
                        </td>
                        <td className="px-3 whitespace-nowrap font-medium text-[#2A6FDB]">{item.bugId}</td>
                        <td className="px-3 text-[#0F172A] max-w-[280px] truncate" title={item.title}>{item.title}</td>
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
                            <button type="button" onClick={() => openRemind([item])} className="text-[#2A6FDB] hover:underline">提醒</button>
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

      <DefectRemindConfigDialog
        key={configOpen ? "config-open" : "config-closed"}
        open={configOpen}
        tasks={tasks}
        teams={[...DEFECT_TEAMS]}
        defects={defects}
        defaultTeam={currentTeam}
        onOpenChange={setConfigOpen}
        onTasksChange={replaceTasks}
      />
      <DefectRemindSendDialog
        open={sendOpen}
        defects={sendDefects}
        tasks={tasks}
        onOpenChange={setSendOpen}
        onNeedConfig={() => setConfigOpen(true)}
        onTaskUpdated={patchTask}
        preferredTeam={currentTeam}
      />

      <Dialog open={!!detail} onOpenChange={(open) => { if (!open) setDetail(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail?.bugId} {detail?.title}</DialogTitle>
            <DialogDescription>{detail?.team} · {detail?.module} · {detail?.owner} · {detail?.status}</DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <p className="text-[#94A3B8]">优先级</p><p className="text-[#0F172A]">{detail.priority}</p>
              <p className="text-[#94A3B8]">严重级别</p><p className="text-[#0F172A]">{detail.severity}</p>
              <p className="text-[#94A3B8]">提交人</p><p className="text-[#0F172A]">{detail.reporter}</p>
              <p className="text-[#94A3B8]">创建时间</p><p className="text-[#0F172A]">{detail.createdAt}</p>
              <p className="text-[#94A3B8]">截止日期</p>
              <p className={isOverdue(detail) ? "text-[#D92D20] font-semibold" : "text-[#0F172A]"}>{detail.deadline || "-"}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>新建缺陷</DialogTitle>
            <DialogDescription>新建的缺陷会保存在本机，便于联调提醒流程。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-title">缺陷标题</Label>
              <Input id="new-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="h-9 border-[#E4ECFC]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>优先级</Label>
                <FilterSelect value={draft.priority} onChange={(val) => setDraft({ ...draft, priority: val as DefectPriority })} allLabel="较高" options={[...PRIORITY_OPTIONS]} hideAll />
              </div>
              <div className="space-y-1.5">
                <Label>严重级别</Label>
                <FilterSelect value={draft.severity} onChange={(val) => setDraft({ ...draft, severity: val as DefectSeverity })} allLabel="A-严重" options={[...SEVERITY_OPTIONS]} hideAll />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-module">所属模块</Label>
                <Input id="new-module" value={draft.module} onChange={(e) => setDraft({ ...draft, module: e.target.value })} placeholder="例如 用户认证" className="h-9 border-[#E4ECFC]" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-owner">负责人</Label>
                <Input id="new-owner" value={draft.owner} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} className="h-9 border-[#E4ECFC]" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-deadline">截止日期</Label>
                <Input id="new-deadline" type="date" value={draft.deadline} onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} className="h-9 border-[#E4ECFC]" />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="h-9 px-4 text-sm border border-[#E4ECFC] rounded-lg text-[#64748B]">取消</button>
            <button type="button" disabled={creating} onClick={createDefect} className="h-9 px-4 text-sm font-medium text-white bg-[#2A6FDB] rounded-lg disabled:opacity-50">
              创建
            </button>
          </div>
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
  return (
    <Select value={props.value} onValueChange={(val) => props.onChange(String(val ?? (props.hideAll ? props.options[0] : FILTER_ALL)))}>
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
