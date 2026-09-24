import "server-only";
import { apiFetch } from "@/lib/api";
import { query, token } from "./_shared";
import type { AdminWebhook, Paginated, WebhookDelivery, WebhookEventOption } from "@/types/api";

/**
 * Outgoing webhooks — `role:admin`, beside the staff screens.
 *
 * Two shapes worth knowing here. `createWebhook` and `updateWebhook` answer
 * the row with `secret` on it **only** when one was just minted (a create, or
 * a PATCH carrying `rotate_secret`); the API never sends it on a read, so the
 * form has to show it the moment it arrives. And a delivery's `payload` comes
 * back from `getWebhookDelivery` alone — the list is event, status and
 * timestamps, never fifty orders.
 */
export type WebhookPayload = Partial<{
  name: string; url: string; events: string[]; is_active: boolean; rotate_secret: boolean;
}>;

export async function getWebhooks(params: { active?: string; page?: number; per_page?: number } = {}) {
  return apiFetch<Paginated<AdminWebhook> & { meta: { events: WebhookEventOption[] } }>(
    `/admin/webhooks${query(params)}`,
    { token: await token() },
  );
}

/** The event options alone, for the *new* screen, which has no record to read them from. */
export async function getWebhookEvents(): Promise<WebhookEventOption[]> {
  const res = await getWebhooks({ per_page: 1 });
  return res.meta.events;
}

export async function getWebhook(id: number): Promise<AdminWebhook> {
  const res = await apiFetch<{ data: AdminWebhook }>(`/admin/webhooks/${id}`, { token: await token() });
  return res.data;
}

export async function createWebhook(payload: WebhookPayload): Promise<AdminWebhook> {
  const res = await apiFetch<{ data: AdminWebhook }>("/admin/webhooks", {
    method: "POST", body: payload, token: await token(),
  });
  return res.data;
}

export async function updateWebhook(id: number, payload: WebhookPayload): Promise<AdminWebhook> {
  const res = await apiFetch<{ data: AdminWebhook }>(`/admin/webhooks/${id}`, {
    method: "PATCH", body: payload, token: await token(),
  });
  return res.data;
}

export async function deleteWebhook(id: number): Promise<void> {
  await apiFetch(`/admin/webhooks/${id}`, { method: "DELETE", token: await token() });
}

/** Queues one `ping` to that hook and answers the delivery id. */
export async function pingWebhook(id: number): Promise<number> {
  const res = await apiFetch<{ data: { delivery_id: number } }>(`/admin/webhooks/${id}/ping`, {
    method: "POST", token: await token(),
  });
  return res.data.delivery_id;
}

export async function getWebhookDeliveries(
  id: number,
  params: { status?: string; page?: number; per_page?: number } = {},
) {
  return apiFetch<Paginated<WebhookDelivery> & { meta: { statuses: string[] } }>(
    `/admin/webhooks/${id}/deliveries${query(params)}`,
    { token: await token() },
  );
}

export async function getWebhookDelivery(id: number, delivery: number): Promise<WebhookDelivery> {
  const res = await apiFetch<{ data: WebhookDelivery }>(`/admin/webhooks/${id}/deliveries/${delivery}`, {
    token: await token(),
  });
  return res.data;
}

/** A fresh delivery carrying the same payload, dispatched now. */
export async function redeliverWebhook(id: number, delivery: number): Promise<WebhookDelivery> {
  const res = await apiFetch<{ data: WebhookDelivery }>(
    `/admin/webhooks/${id}/deliveries/${delivery}/redeliver`,
    { method: "POST", token: await token() },
  );
  return res.data;
}
