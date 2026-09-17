import { useState } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ALL_TEAMS,
  detectWebhookChannel,
  formatRemindMessage,
  frequencyLabel,
  matchTaskDefects,
  uniqueOwners,
  type DefectRemindTask,
  type DefectRow,
} from "@/lib/defect";
import { runRemindTask } from "@/lib/defect-remind-api";

export function DefectRemindSendDialog(props: {
  open: boolean;
  defects: DefectRow[];
  tasks: DefectRemindTask[];
  onOpenChange: (open: boolean) => void;
  onNeedConfig: () => void;
  onTaskUpdated: (task: DefectRemindTask) => void;
  preferredTeam?: string;
}) {
  const enabledTasks = props.tasks.filter((item) => (
    item.enabled
    && item.webhook.trim()
    && (!props.preferredTeam || item.team === ALL_TEAMS || item.team === props.preferredTeam)
  ));
  const [taskId, setTaskId] = useState<string>("");
  const [sending, setSending] = useState(false);
  const selectedId = enabledTasks.some((item) => item.id === taskId)
    ? taskId
    : (enabledTasks[0]?.id ?? "");
  const task = enabledTasks.find((item) => item.id === selectedId) ?? null;
  const matched = task
    ? matchTaskDefects({ defects: props.defects, team: task.team, severities: task.severities })
    : props.defects;
  const preview = task
    ? formatRemindMessage({ defects: matched, task })
    : "请先选择一个已启用的提醒任务。";
  const owners = uniqueOwners(matched);
  const channel = task ? detectWebhookChannel(task.webhook) : "Webhook";

  const confirm = async () => {
    if (!task) {
      props.onOpenChange(false);
      props.onNeedConfig();
      return;
    }
    if (matched.length === 0) {
      toast.error("当前没有可提醒的未修复缺陷");
      return;
    }
    setSending(true);
    try {
      const result = await runRemindTask({ taskId: task.id, task, defects: props.defects });
      props.onTaskUpdated({
        ...task,
        lastRunAt: new Date().toISOString(),
        lastRunStatus: "success",
        lastRunMessage: `已发送 ${result.count} 条`,
      });
      props.onOpenChange(false);
      toast.success(`已通过${result.channel}提醒 ${owners.length} 位负责人，共 ${result.count} 条缺陷`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "发送失败");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={(open) => { if (!sending) props.onOpenChange(open); }}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>确认发送缺陷提醒</DialogTitle>
          <DialogDescription>
            {matched.length > 0
              ? `将向 ${channel} 推送 ${matched.length} 条未修复缺陷，覆盖 ${owners.length} 位负责人。`
              : "当前范围内没有可提醒的未修复缺陷。"}
          </DialogDescription>
        </DialogHeader>
        {enabledTasks.length === 0 ? (
          <div className="rounded-[10px] border border-[#FEDF89] bg-[#FFFAEB] px-4 py-3 text-sm text-[#B54708]">
            还没有可用的提醒任务。请先配置团队、频率、日期和 webhook。
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>使用的提醒任务</Label>
              <Select value={selectedId} onValueChange={(val) => setTaskId(String(val ?? ""))}>
                <SelectTrigger className="w-full h-9 border-[#E4ECFC]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {enabledTasks.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} · {item.team} · {frequencyLabel(item.frequency)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>消息预览</Label>
              <Textarea readOnly value={preview} className="min-h-40 text-xs border-[#E4ECFC] bg-[#F8FAFC]" />
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            disabled={sending}
            onClick={() => props.onOpenChange(false)}
            className="h-9 px-4 text-sm font-medium text-[#64748B] border border-[#E4ECFC] rounded-lg hover:bg-[#F8FAFC] disabled:opacity-50"
          >
            取消
          </button>
          {enabledTasks.length === 0 ? (
            <button
              type="button"
              onClick={() => { props.onOpenChange(false); props.onNeedConfig(); }}
              className="h-9 px-4 text-sm font-medium text-white bg-[#F79009] hover:bg-[#DC6803] rounded-lg"
            >
              去配置
            </button>
          ) : (
            <button
              type="button"
              disabled={sending || matched.length === 0}
              onClick={confirm}
              className="h-9 px-4 text-sm font-medium text-white bg-[#F79009] hover:bg-[#DC6803] rounded-lg disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Send className="w-4 h-4" />
              {sending ? "发送中…" : "确认发送"}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
