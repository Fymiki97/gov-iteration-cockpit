import { wpsApi } from "@/utils/wps-api";
import type { AuditRequirement } from "@/lib/pm-schedule-audit";
import { failReasonsByRole } from "@/lib/pm-schedule-audit";

const MAX_MESSAGE_CHARS = 5000;
const CONTACT_MENTION_ID = "0";

export interface PushContext {
  monthLabel: string;
}

export interface PushContact {
  userId: string;
  userName: string;
  companyId: string;
}

export interface PushRequirementItem {
  name: string;
  onesId: string;
  onesUrl: string;
  reasons: string[];
}

export interface PushRecipient {
  person: string;
  userId: string;
  requirementCount: number;
  items: PushRequirementItem[];
}

export interface PushPreview {
  recipients: PushRecipient[];
  skippedPassed: number;
  skippedNoSelection: boolean;
  unresolved: string[];
  monthLabel: string;
}

interface WpsUserItem {
  id?: string;
  user_name?: string;
}

interface SearchUsersResponse {
  code?: number;
  msg?: string;
  data?: {
    items?: WpsUserItem[];
  };
}

interface CurrentUserResponse {
  code?: number;
  msg?: string;
  data?: {
    id?: string;
    user_name?: string;
    company_id?: string;
  };
}

interface SendResult {
  code?: number;
  msg?: string;
  message?: string;
  error?: string;
}

export function formatMonthLabel(year: number, month: number): string {
  return `${String(year).slice(-2)}年${month}月`;
}

function requirementLabel(item: PushRequirementItem, markdown: boolean): string {
  if (!item.onesId) return `「${item.name}」`;
  if (markdown && item.onesUrl) {
    const safeId = item.onesId.replace(/[[\]()]/g, "");
    return `「${item.name}」 ([${safeId}](${item.onesUrl}))`;
  }
  const onesSuffix = item.onesUrl ? `${item.onesId} ${item.onesUrl}` : item.onesId;
  return `「${item.name}」（${onesSuffix}）`;
}

function formatRequirementBlock(item: PushRequirementItem, markdown: boolean): string {
  const bullets = item.reasons.map((reason) => `  · ${reason}`).join("\n");
  return `${requirementLabel(item, markdown)}\n${bullets}`;
}

function formatRecipientBody(recipient: PushRecipient, markdown: boolean): string {
  return recipient.items.map((item) => formatRequirementBlock(item, markdown)).join("\n\n");
}

export function formatPushMessagePreview(
  recipient: PushRecipient,
  context: PushContext,
  contactName: string,
): string {
  const header = `【排期会准入审计提醒】\n\n以下需求未满足${context.monthLabel}排期会准入条件，请您关注并尽快处理：\n\n`;
  const body = formatRecipientBody(recipient, false);
  return `${header}${body}\n\n如有疑问请联系 @${contactName}。`;
}

function formatPushMessage(
  recipient: PushRecipient,
  context: PushContext,
  contact: PushContact,
  markdown: boolean,
): string {
  const header = `【排期会准入审计提醒】\n\n以下需求未满足${context.monthLabel}排期会准入条件，请您关注并尽快处理：\n\n`;
  const body = formatRecipientBody(recipient, markdown);
  const footer = markdown
    ? `\n\n如有疑问请联系 <at id="${CONTACT_MENTION_ID}">${contact.userName}</at>。`
    : `\n\n如有疑问请联系 @${contact.userName}。`;
  const full = header + body + footer;
  if (full.length <= MAX_MESSAGE_CHARS) return full;
  const truncatedBody = body.slice(0, MAX_MESSAGE_CHARS - header.length - footer.length - 20);
  return `${header}${truncatedBody}\n\n…（内容过长已截断）${footer}`;
}

async function resolveUserId(person: string, hintUserId: string): Promise<string> {
  if (hintUserId) return hintUserId;
  const keyword = person.trim();
  if (!keyword) return "";
  const data = await wpsApi.get<SearchUsersResponse>("/v7/users/search", {
    params: {
      keyword,
      status: "active",
      search_field: "user_name",
      search_source: "company_user",
      page_size: "20",
    },
  });
  const items = data.data?.items ?? [];
  const exact = items.find((item) => item.user_name === keyword);
  return exact?.id || items[0]?.id || "";
}

export async function fetchPushContact(): Promise<PushContact | null> {
  const res = await wpsApi.get<CurrentUserResponse>("/v7/users/current");
  const user = res.data;
  if (!user?.id || !user.user_name) return null;
  return {
    userId: user.id,
    userName: user.user_name,
    companyId: user.company_id || "",
  };
}

export function buildPushPreview(
  items: AuditRequirement[],
  selectedIds: string[],
  context: PushContext,
): PushPreview {
  if (selectedIds.length === 0) {
    return {
      recipients: [],
      skippedPassed: 0,
      skippedNoSelection: true,
      unresolved: [],
      monthLabel: context.monthLabel,
    };
  }

  const selected = items.filter((item) => selectedIds.includes(item.id));
  const failedSelected = selected.filter((item) => !item.passed);
  const skippedPassed = selected.length - failedSelected.length;

  const bucket = new Map<string, { person: string; userId: string; items: PushRequirementItem[] }>();

  for (const item of failedSelected) {
    for (const block of failReasonsByRole(item)) {
      if (!block.person.trim() || block.reasons.length === 0) continue;
      const key = block.userId || block.person.trim();
      const existing = bucket.get(key) ?? { person: block.person.trim(), userId: block.userId, items: [] };
      existing.items.push({
        name: item.name,
        onesId: item.onesId,
        onesUrl: item.onesUrl,
        reasons: block.reasons,
      });
      if (!existing.userId && block.userId) existing.userId = block.userId;
      bucket.set(key, existing);
    }
  }

  const recipients: PushRecipient[] = [...bucket.values()].map((entry) => ({
    person: entry.person,
    userId: entry.userId,
    requirementCount: entry.items.length,
    items: entry.items,
  }));

  return {
    recipients,
    skippedPassed,
    skippedNoSelection: false,
    unresolved: [],
    monthLabel: context.monthLabel,
  };
}

export async function resolvePushRecipients(preview: PushPreview): Promise<PushPreview> {
  const unresolved: string[] = [];
  const recipients: PushRecipient[] = [];

  for (const recipient of preview.recipients) {
    let userId = recipient.userId;
    if (!userId) {
      userId = await resolveUserId(recipient.person, "");
    }
    if (!userId) {
      unresolved.push(recipient.person);
      continue;
    }
    recipients.push({ ...recipient, userId });
  }

  return { ...preview, recipients, unresolved };
}

// 发送通道：App Studio 平台代理（gateway_token 鉴权，X-Project-Id 标识项目）。
// 平台代理用平台应用凭证转发并自动将内部用户 ID 转为应用维度 OpenID，
// 无需项目自建应用单独申请消息权限。消息契约仅支持纯文本（无 markdown 字段）。
// dev 由 vite /base-proxy 代理转发；生产页面与 o.wpsgo.com 同源，直接走 /app/app-base 路径。
const IM_SEND_PATH = import.meta.env.DEV
  ? "/base-proxy/app/v7/messages/create"
  : "/app/app-base/base-proxy/app/v7/messages/create";
const PROJECT_ID = import.meta.env.VITE_PROJECT_ID || "760386581358207";

async function postMessage(userId: string, content: string): Promise<void> {
  const res = await fetch(IM_SEND_PATH, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Project-Id": PROJECT_ID,
    },
    body: JSON.stringify({
      type: "text",
      content: { text: { type: "plain", content } },
      receiver: { receiver_id: userId, type: "user" },
      mentions: [],
    }),
  });
  const data = (await res.json().catch(() => ({}))) as SendResult;
  if (!res.ok) {
    const detail = data.msg || data.message || (data.error ? String(data.error) : "");
    throw new Error(detail || `发送接口错误（HTTP ${res.status}）`);
  }
  if (data.code !== undefined && data.code !== 0) {
    throw new Error(data.msg || data.message || `错误码 ${data.code}`);
  }
}

async function sendOneMessage(
  recipient: PushRecipient,
  context: PushContext,
  contact: PushContact,
): Promise<void> {
  const content = formatPushMessage(recipient, context, contact, false);
  await postMessage(recipient.userId, content);
}

interface PushResult {
  sent: number;
  failed: Array<{ person: string; error: string }>;
  receiptSent: boolean;
}

function formatReceipt(
  recipients: PushRecipient[],
  failed: Array<{ person: string; error: string }>,
  context: PushContext,
  contact: PushContact,
): string {
  const sentList = recipients.filter((r) => !failed.some((f) => f.person === r.person));
  const now = new Date().toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const lines: string[] = [
    "【推送回执】排期会准入审计提醒",
    "",
    `发送时间：${now}（北京时间）`,
    `审计月份：${context.monthLabel}`,
    `推送对象 ${recipients.length} 人：成功 ${sentList.length}，失败 ${failed.length}。`,
  ];
  if (sentList.length > 0) {
    lines.push("", "已推送：");
    sentList.forEach((r, i) => lines.push(`${i + 1}. ${r.person}（${r.requirementCount} 个需求）`));
  }
  if (failed.length > 0) {
    lines.push("", "发送失败：");
    failed.forEach((f, i) => lines.push(`${i + 1}. ${f.person}：${f.error.slice(0, 120)}`));
  }
  lines.push("", `操作人：${contact.userName}（此回执仅发给你本人）`);
  return lines.join("\n");
}

export async function sendPushToRecipients(
  recipients: PushRecipient[],
  context: PushContext,
  contact: PushContact,
): Promise<PushResult> {
  let sent = 0;
  const failed: Array<{ person: string; error: string }> = [];

  for (const recipient of recipients) {
    try {
      await sendOneMessage(recipient, context, contact);
      sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failed.push({ person: recipient.person, error: message });
    }
  }

  // 回执发给操作人本人：所有接收人的消息都走应用通道，发送者无法在会话里看到，
  // 凭回执确认推送给谁、结果如何。回执失败不影响推送结果，仅记日志。
  let receiptSent = false;
  try {
    await postMessage(contact.userId, formatReceipt(recipients, failed, context, contact));
    receiptSent = true;
  } catch (err) {
    console.error("[push] 回执发送失败:", err);
  }

  return { sent, failed, receiptSent };
}
