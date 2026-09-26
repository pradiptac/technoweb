import "server-only";
import { apiFetch } from "@/lib/api";
import { query, token } from "./_shared";
import type {
  MessageAutomationCell, MessageAutomationMeta, MessageBroadcast, MessageBroadcastMeta, MessageButton,
  MessageContact, MessageTemplate, MessageTemplateMeta, MessagingStatus, Paginated,
} from "@/types/api";

/**
 * Messaging channels — WhatsApp, RCS, browser push.
 *
 * The settings reads are `role:admin` (they describe provider keys); every
 * other function here is `role:campaign_manager,store_manager`. Templates,
 * automations and broadcasts each carry their lists on `meta`, never a list
 * in TypeScript.
 */

/* ------------------------------------------------------- settings (admin) */

export async function getMessagingStatus(): Promise<MessagingStatus> {
  const res = await apiFetch<{ data: MessagingStatus }>("/admin/settings/messaging", { token: await token() });
  return res.data;
}

/** One real message with the fixed test body, to a number or token the administrator typed. */
export async function sendMessagingTest(channel: string, to: string): Promise<{ sent_to: string; provider: string }> {
  const res = await apiFetch<{ data: { sent_to: string; provider: string } }>("/admin/settings/messaging/test", {
    method: "POST", body: { channel, to }, token: await token(),
  });
  return res.data;
}

/* -------------------------------------------------------------- templates */

export type MessageTemplatePayload = Partial<{
  channel: string; key: string; name: string; body: string; header_text: string | null; media_path: string | null;
  buttons: MessageButton[] | null; push_title: string | null; push_link: string | null; category: string | null;
  language: string | null; provider_template_name: string | null; provider_template_id: string | null;
}>;

export async function getMessageTemplates(params: { channel?: string; q?: string; page?: number; per_page?: number } = {}) {
  return apiFetch<Paginated<MessageTemplate> & { meta: MessageTemplateMeta }>(
    `/admin/messaging/templates${query(params)}`, { token: await token() },
  );
}

/** The lists alone, for the *new* screen, which has no record to read them from. */
export async function getMessageTemplateMeta(): Promise<MessageTemplateMeta> {
  return (await getMessageTemplates({ per_page: 1 })).meta;
}

export async function getMessageTemplate(id: number): Promise<{ data: MessageTemplate; meta: MessageTemplateMeta }> {
  return apiFetch(`/admin/messaging/templates/${id}`, { token: await token() });
}

export async function createMessageTemplate(payload: MessageTemplatePayload): Promise<MessageTemplate> {
  const res = await apiFetch<{ data: MessageTemplate }>("/admin/messaging/templates", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateMessageTemplate(id: number, payload: MessageTemplatePayload): Promise<MessageTemplate> {
  const res = await apiFetch<{ data: MessageTemplate }>(`/admin/messaging/templates/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteMessageTemplate(id: number): Promise<void> {
  await apiFetch(`/admin/messaging/templates/${id}`, { method: "DELETE", token: await token() });
}

export async function submitMessageTemplate(id: number): Promise<MessageTemplate> {
  const res = await apiFetch<{ data: MessageTemplate }>(`/admin/messaging/templates/${id}/submit`, { method: "POST", token: await token() });
  return res.data;
}

export async function testMessageTemplate(id: number, to: string): Promise<{ sent_to: string }> {
  const res = await apiFetch<{ data: { sent_to: string } }>(`/admin/messaging/templates/${id}/test`, { method: "POST", body: { to }, token: await token() });
  return res.data;
}

export async function syncMessageTemplates(channel: string): Promise<{ matched: number; unknown: string[] }> {
  const res = await apiFetch<{ data: { matched: number; unknown: string[] } }>("/admin/messaging/templates/sync", {
    method: "POST", body: { channel }, token: await token(),
  });
  return res.data;
}

/* ------------------------------------------------------------ automations */

export async function getMessageAutomations(): Promise<{ data: MessageAutomationCell[]; meta: MessageAutomationMeta }> {
  return apiFetch("/admin/messaging/automations", { token: await token() });
}

export async function saveMessageAutomations(
  rows: { event: string; channel: string; message_template_id: number | null; is_enabled: boolean }[],
): Promise<{ data: MessageAutomationCell[]; meta: MessageAutomationMeta }> {
  return apiFetch("/admin/messaging/automations", { method: "PUT", body: { rows }, token: await token() });
}

/* --------------------------------------------------------------- contacts */

export async function getMessageContacts(params: { channel?: string; status?: string; q?: string; page?: number; per_page?: number } = {}) {
  return apiFetch<Paginated<MessageContact> & { meta: { channels: { value: string; label: string; active: number }[] } }>(
    `/admin/messaging/contacts${query(params)}`, { token: await token() },
  );
}

export async function optOutMessageContact(id: number): Promise<MessageContact> {
  const res = await apiFetch<{ data: MessageContact }>(`/admin/messaging/contacts/${id}/opt-out`, { method: "POST", token: await token() });
  return res.data;
}

/* ------------------------------------------------------------- broadcasts */

export type MessageBroadcastPayload = Partial<{
  name: string; channel: string; message_template_id: number | null; audience: string;
  newsletter_group_id: number | null; store_product_id: number | null;
}>;

export async function getMessageBroadcasts(params: { status?: string; page?: number; per_page?: number } = {}) {
  return apiFetch<Paginated<MessageBroadcast> & { meta: MessageBroadcastMeta }>(
    `/admin/messaging/broadcasts${query(params)}`, { token: await token() },
  );
}

export async function getMessageBroadcastMeta(): Promise<MessageBroadcastMeta> {
  return (await getMessageBroadcasts({ per_page: 1 })).meta;
}

export async function getMessageBroadcast(id: number): Promise<{ data: MessageBroadcast; meta: MessageBroadcastMeta }> {
  return apiFetch(`/admin/messaging/broadcasts/${id}`, { token: await token() });
}

export async function createMessageBroadcast(payload: MessageBroadcastPayload): Promise<MessageBroadcast> {
  const res = await apiFetch<{ data: MessageBroadcast }>("/admin/messaging/broadcasts", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateMessageBroadcast(id: number, payload: MessageBroadcastPayload): Promise<MessageBroadcast> {
  const res = await apiFetch<{ data: MessageBroadcast }>(`/admin/messaging/broadcasts/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteMessageBroadcast(id: number): Promise<void> {
  await apiFetch(`/admin/messaging/broadcasts/${id}`, { method: "DELETE", token: await token() });
}

export async function sendMessageBroadcast(id: number, scheduledAt?: string): Promise<{ data: MessageBroadcast; starts_at: string }> {
  return apiFetch(`/admin/messaging/broadcasts/${id}/send`, {
    method: "POST", body: scheduledAt ? { scheduled_at: scheduledAt } : {}, token: await token(),
  });
}

export async function cancelMessageBroadcast(id: number): Promise<MessageBroadcast> {
  const res = await apiFetch<{ data: MessageBroadcast }>(`/admin/messaging/broadcasts/${id}/cancel`, { method: "POST", token: await token() });
  return res.data;
}

export async function countBroadcastAudience(params: { channel: string; audience: string; newsletter_group_id?: number; store_product_id?: number }): Promise<number> {
  const res = await apiFetch<{ data: { count: number } }>(`/admin/messaging/broadcasts/audience${query(params)}`, { token: await token() });
  return res.data.count;
}
