import "server-only";
import { apiFetch, apiUpload } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { CustomerVisit, MessagingPreferences, Order, Paginated, Ticket, TicketMessage, TicketSummary } from "@/types/api";

/**
 * Authenticated portal reads and writes. Every function pulls the token from
 * the httpOnly cookie itself, so a caller cannot accidentally issue an
 * unauthenticated request or leak the token into a client component.
 */

async function token(): Promise<string> {
  const t = await getToken();
  if (!t) throw new Error("No portal session.");
  return t;
}

/**
 * The customer's own orders.
 *
 * Under `my/` on the API, because `orders/{number}` is the *guest* route and
 * the two are authorised completely differently — one by a session, the other
 * by a secret in a link. Never cached: an order changes when money arrives.
 */
export async function getMyOrders(page = 1) {
  return apiFetch<Paginated<Order>>(`/my/orders?page=${page}`, {
    token: await token(),
    cache: "no-store",
  });
}

export async function getMyOrder(orderNumber: string): Promise<Order> {
  const res = await apiFetch<{ data: Order }>(
    `/my/orders/${encodeURIComponent(orderNumber)}`,
    { token: await token(), cache: "no-store" },
  );

  return res.data;
}

export async function getTicketSummary(): Promise<TicketSummary> {
  const res = await apiFetch<{ data: TicketSummary }>("/tickets/summary", { token: await token() });
  return res.data;
}

export async function getTickets(params: { status?: string; page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.page) query.set("page", String(params.page));

  const qs = query.toString();
  return apiFetch<Paginated<Ticket>>(`/tickets${qs ? `?${qs}` : ""}`, { token: await token() });
}

/** One to five stars on a staff reply. Changeable; the API refuses anything else with a 404. */
export async function rateReply(reference: string, messageId: number, rating: number) {
  return apiFetch<{ data: TicketMessage }>(`/tickets/${reference}/messages/${messageId}/rating`, {
    method: "POST", token: await token(), body: { rating },
  });
}

/** A report on a staff reply, in the customer's words. Re-sending re-words it. */
export async function reportReply(reference: string, messageId: number, reason: string) {
  return apiFetch<{ data: TicketMessage }>(`/tickets/${reference}/messages/${messageId}/report`, {
    method: "POST", token: await token(), body: { reason },
  });
}

export async function getTicket(reference: string) {
  const res = await apiFetch<{ data: Ticket }>(`/tickets/${reference}`, { token: await token() });
  return res.data;
}

export async function createTicket(formData: FormData) {
  const res = await apiUpload<{ data: Ticket }>("/tickets", formData, { token: await token() });
  return res.data;
}

export async function replyToTicket(reference: string, formData: FormData) {
  const res = await apiUpload<{ data: TicketMessage }>(
    `/tickets/${reference}/messages`,
    formData,
    { token: await token() },
  );
  return res.data;
}

export async function closeTicket(reference: string) {
  return apiFetch<{ data: Ticket }>(`/tickets/${reference}/close`, {
    method: "POST",
    token: await token(),
  });
}

export async function reopenTicket(reference: string) {
  return apiFetch<{ data: Ticket }>(`/tickets/${reference}/reopen`, {
    method: "POST",
    token: await token(),
  });
}

/**
 * Which channels this customer is told things on (WhatsApp, RCS, push) —
 * the profile screen's messaging card. Never cached: it is the answer to a
 * toggle somebody just pressed.
 */
export async function getMessagingPreferences(): Promise<MessagingPreferences> {
  const res = await apiFetch<{ data: MessagingPreferences }>("/messaging/preferences", { token: await token(), cache: "no-store" });
  return res.data;
}

export async function updateMessagingPreferences(body: Partial<Record<"whatsapp" | "rcs" | "push", boolean>>): Promise<MessagingPreferences> {
  const res = await apiFetch<{ data: MessagingPreferences }>("/messaging/preferences", { method: "PATCH", body, token: await token() });
  return res.data;
}

/**
 * The customer's own engineer visit requests — `my/visits`, for the
 * `my/orders` reason: `visits/{reference}` is the guest route, authorised by
 * a token in a link. Never cached: a visit changes when the desk confirms it.
 */
export async function getMyVisits(page = 1) {
  return apiFetch<Paginated<CustomerVisit>>(`/my/visits?page=${page}`, { token: await token(), cache: "no-store" });
}

export async function getMyVisit(reference: string): Promise<CustomerVisit> {
  const res = await apiFetch<{ data: CustomerVisit }>(`/my/visits/${encodeURIComponent(reference)}`, { token: await token(), cache: "no-store" });
  return res.data;
}

export async function cancelMyVisit(reference: string): Promise<CustomerVisit> {
  const res = await apiFetch<{ data: CustomerVisit }>(`/my/visits/${encodeURIComponent(reference)}/cancel`, { method: "POST", token: await token() });
  return res.data;
}

export async function rescheduleMyVisit(reference: string, preferred: { date: string; window: string }[], note?: string): Promise<CustomerVisit> {
  const res = await apiFetch<{ data: CustomerVisit }>(`/my/visits/${encodeURIComponent(reference)}/reschedule`, {
    method: "POST", body: { preferred, note }, token: await token(),
  });
  return res.data;
}

/** Ask to return lines of one of the customer's own orders (docs/store.md "Returns"). */
export async function requestMyReturn(
  orderNumber: string,
  payload: { reason: string; details: string | null; items: { order_item_id: number; quantity: number }[] },
): Promise<{ message: string }> {
  const res = await apiFetch<{ message?: string }>(
    `/my/orders/${encodeURIComponent(orderNumber)}/returns`,
    { method: "POST", body: payload, token: await token(), cache: "no-store" },
  );

  return { message: res.message ?? "We have your return request." };
}
