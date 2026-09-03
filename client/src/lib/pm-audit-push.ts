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

// 应用通道仅支持纯文本（消息契约禁止 markdown 字段），ONES 链接以原始 URL 保持可点击。
async function postMessage(userId: string, content: string): Promise<void> {
  const res = await fetch("./api/im-send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, content }),
  });
  const data = (await res.json().catch(() => ({}))) as SendResult;
  if (!res.ok) {
    throw new Error(data.message || data.msg || `发送接口错误（HTTP ${res.status}）`);
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

export async function sendPushToRecipients(
  recipients: PushRecipient[],
  context: PushContext,
  contact: PushContact,
): Promise<{ sent: number; failed: Array<{ person: string; error: string }> }> {
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

  return { sent, failed };
}
