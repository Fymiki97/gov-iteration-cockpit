import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Play, Pencil, Bell } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  ALL_TEAMS,
  DEFAULT_SEVERITIES,
  FREQUENCY_OPTIONS,
  TEMPLATE_OPTIONS,
  SEVERITY_OPTIONS,
  emptyRemindTaskInput,
  frequencyLabel,
  taskToInput,
  type DefectRemindTask,
  type DefectRemindTaskInput,
  type DefectRow,
  type DefectSeverity,
  type RemindFrequency,
  type RemindTemplate,
} from "@/lib/defect";
import { createRemindTask, deleteRemindTask, runRemindTask, updateRemindTask } from "@/lib/defect-remind-api";

const SEVERITY_CHOICES = SEVERITY_OPTIONS;

export function DefectRemindConfigDialog(props: {
  open: boolean;
  tasks: DefectRemindTask[];
  teams: string[];
  iterations: string[];
  defects: DefectRow[];
  onOpenChange: (open: boolean) => void;
  onTasksChange: (tasks: DefectRemindTask[]) => void;
  defaultTeam?: string;
}) {
  const [mode, setMode] = useState<"new" | string>(props.tasks[0]?.id ?? "new");
  const [form, setForm] = useState<DefectRemindTaskInput>(
    props.tasks[0] ? taskToInput(props.tasks[0]) : emptyRemindTaskInput({ team: props.defaultTeam }),
  );
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const selected = props.tasks.find((item) => item.id === mode) ?? null;

  const startNew = () => {
    setMode("new");
    setForm(emptyRemindTaskInput({ team: props.defaultTeam }));
  };

  const selectTask = (task: DefectRemindTask) => {
    setMode(task.id);
    setForm(taskToInput(task));
  };

  const toggleSeverity = (severity: DefectSeverity, checked: boolean) => {
    const next = checked
      ? [...form.severities, severity]
      : form.severities.filter((item) => item !== severity);
    setForm({ ...form, severities: next.length > 0 ? next : [...DEFAULT_SEVERITIES] });
  };

  const persist = async () => {
    if (!form.name.trim()) {
      toast.error("请填写任务名称");
      return;
    }
    if (!form.webhook.trim()) {
      toast.error("请填写 webhook");
      return;
    }
    setSaving(true);
    try {
      if (mode === "new") {
        const task = await createRemindTask(form);
        props.onTasksChange([task, ...props.tasks]);
        setMode(task.id);
        setForm(taskToInput(task));
        toast.success("已新建提醒任务");
      } else {
        const task = await updateRemindTask(mode, form);
        props.onTasksChange(props.tasks.map((item) => item.id === task.id ? task : item));
        setForm(taskToInput(task));
        toast.success("已保存提醒任务");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (mode === "new") {
      startNew();
      return;
    }
    setSaving(true);
    try {
      await deleteRemindTask(mode);
      const next = props.tasks.filter((item) => item.id !== mode);
      props.onTasksChange(next);
      if (next[0]) selectTask(next[0]);
      else startNew();
      toast.success("已删除提醒任务");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    if (mode === "new") {
      toast.error("请先保存任务，再立即执行");
      return;
    }
    setRunning(true);
    try {
      const result = await runRemindTask({ taskId: mode, task: selected!, defects: props.defects });
      const refreshed = props.tasks.map((item) => item.id === mode
        ? { ...item, lastRunAt: new Date().toISOString(), lastRunStatus: "success" as const, lastRunMessage: `已发送 ${result.count} 条` }
        : item);
      props.onTasksChange(refreshed);
      toast.success(`已通过${result.channel}提醒 ${result.count} 条未修复缺陷`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "发送失败");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden p-0">
        <div className="px-5 pt-5 pb-3 border-b border-[#E4ECFC]">
          <DialogHeader>
            <DialogTitle>提醒任务配置</DialogTitle>
            <DialogDescription>
              配置团队、频率、起止日期和 webhook。任务会留存在列表中，可随时修改、新建或立即执行。
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] min-h-[420px] max-h-[70vh]">
          <aside className="border-b md:border-b-0 md:border-r border-[#E4ECFC] p-3 space-y-2 overflow-y-auto">
            <button
              type="button"
              onClick={startNew}
              className={`w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium border ${mode === "new" ? "border-[#2A6FDB] bg-[#EFF4FF] text-[#2A6FDB]" : "border-[#E4ECFC] text-[#64748B] hover:bg-[#F8FAFC]"}`}
            >
              <Plus className="w-4 h-4" /> 新建任务
            </button>
            {props.tasks.length === 0 ? (
              <p className="text-xs text-[#94A3B8] px-1 py-6 text-center">还没有提醒任务，请在右侧填写后保存。</p>
            ) : props.tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => selectTask(task)}
                className={`w-full text-left rounded-[10px] border px-3 py-2.5 transition-colors ${mode === task.id ? "border-[#2A6FDB] bg-[#EFF4FF]" : "border-[#E4ECFC] hover:bg-[#F8FAFC]"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-[#0F172A] truncate">{task.name}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${task.enabled ? "bg-[#ECFDF3] text-[#12B76A]" : "bg-slate-100 text-slate-500"}`}>
                    {task.enabled ? "启用" : "停用"}
                  </span>
                </div>
                <p className="text-[11px] text-[#94A3B8] mt-1 truncate">
                  {task.team || ALL_TEAMS} · {frequencyLabel(task.frequency)}{task.iterations?.length ? ` · ${(task.iterations as string[]).length}个迭代` : ""}
                </p>
              </button>
            ))}
          </aside>
          <div className="p-5 overflow-y-auto space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-[#0F172A]">
                {mode === "new" ? <Plus className="w-4 h-4 text-[#2A6FDB]" /> : <Pencil className="w-4 h-4 text-[#2A6FDB]" />}
                {mode === "new" ? "新建提醒任务" : "编辑提醒任务"}
              </div>
              <label className="flex items-center gap-2 text-sm text-[#64748B]">
                启用
                <Switch
                  checked={form.enabled}
                  onCheckedChange={(checked) => setForm({ ...form, enabled: Boolean(checked) })}
                />
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="task-name">任务名称</Label>
                <Input id="task-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如 政务产研每日缺陷催办" className="h-9 border-[#E4ECFC]" />
              </div>
              <div className="space-y-1.5">
                <Label>团队</Label>
                <Select value={form.team} onValueChange={(val) => setForm({ ...form, team: String(val ?? ALL_TEAMS) })}>
                  <SelectTrigger className="w-full h-9 border-[#E4ECFC]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_TEAMS}>{ALL_TEAMS}</SelectItem>
                    {props.teams.map((team) => (
                      <SelectItem key={team} value={team}>{team}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>频率</Label>
                <Select value={form.frequency} onValueChange={(val) => setForm({ ...form, frequency: String(val ?? "daily") as RemindFrequency })}>
                  <SelectTrigger className="w-full h-9 border-[#E4ECFC]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="start-date">开始日期</Label>
                <Input id="start-date" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="h-9 border-[#E4ECFC]" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="end-date">结束日期</Label>
                <Input id="end-date" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="h-9 border-[#E4ECFC]" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="webhook">Webhook</Label>
                <Input id="webhook" value={form.webhook} onChange={(e) => setForm({ ...form, webhook: e.target.value })} placeholder="钉钉 / 企业微信 / WPS 群机器人地址" className="h-9 border-[#E4ECFC]" />
                <p className="text-[11px] text-[#94A3B8]">到期后将把未修复缺陷汇总 POST 到该地址，支持钉钉、企业微信和通用 webhook。</p>
              </div>
              <div className="space-y-1.5">
                <Label>消息模板</Label>
                <Select value={form.template} onValueChange={(val) => setForm({ ...form, template: String(val ?? "default") as RemindTemplate })}>
                  <SelectTrigger className="w-full h-9 border-[#E4ECFC]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_OPTIONS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>消息内容</Label>
                <div className="flex items-center gap-4 h-9">
                  <label className="flex items-center gap-1.5 text-sm text-[#64748B]">
                    <Checkbox checked={form.includeDetail} onCheckedChange={(checked) => setForm({ ...form, includeDetail: checked === true })} />
                    缺陷详情
                  </label>
                  <label className="flex items-center gap-1.5 text-sm text-[#64748B]">
                    <Checkbox checked={form.includeDeadline} onCheckedChange={(checked) => setForm({ ...form, includeDeadline: checked === true })} />
                    截止日期
                  </label>
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>严重级别过滤</Label>
                <div className="flex flex-wrap gap-3">
                  {SEVERITY_CHOICES.map((severity) => (
                    <label key={severity} className="flex items-center gap-1.5 text-sm text-[#64748B]">
                      <Checkbox
                        checked={form.severities.includes(severity)}
                        onCheckedChange={(checked) => toggleSeverity(severity, checked === true)}
                      />
                      {severity}
                    </label>
                  ))}
                </div>
              </div>
              {props.iterations.length > 0 && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>所属迭代过滤</Label>
                  <MultiSelect
                    allLabel="全部"
                    options={props.iterations.map((iter) => ({ value: iter, label: iter }))}
                    value={form.iterations}
                    onChange={(next) => setForm({ ...form, iterations: next })}
                  />
                  <p className="text-[11px] text-[#94A3B8]">不选 = 匹配全部迭代</p>
                </div>
              )}
            </div>
            {selected?.lastRunMessage && (
              <p className="text-xs text-[#94A3B8] flex items-center gap-1">
                <Bell className="w-3.5 h-3.5" />
                最近执行：{selected.lastRunStatus === "success" ? "成功" : "失败"} · {selected.lastRunMessage}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              {mode !== "new" && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={remove}
                  className="h-9 px-3 text-sm font-medium text-[#D92D20] border border-[#FECDCA] rounded-lg hover:bg-[#FEF3F2] disabled:opacity-50 inline-flex items-center gap-1"
                >
                  <Trash2 className="w-4 h-4" /> 删除
                </button>
              )}
              <button
                type="button"
                disabled={saving || running || mode === "new"}
                onClick={runNow}
                className="h-9 px-3 text-sm font-medium text-[#2A6FDB] border border-[#C7D7FE] rounded-lg hover:bg-[#EFF4FF] disabled:opacity-50 inline-flex items-center gap-1"
              >
                <Play className="w-4 h-4" /> {running ? "发送中…" : "立即执行"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={persist}
                className="h-9 px-4 text-sm font-medium text-white bg-[#2A6FDB] hover:bg-[#1F5DC2] rounded-lg disabled:opacity-50"
              >
                {saving ? "保存中…" : mode === "new" ? "创建任务" : "保存修改"}
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
