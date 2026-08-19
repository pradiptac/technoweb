import "server-only";
import { apiFetch, apiUpload } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { Paginated, Ticket, TicketMessage, TicketSummary } from "@/types/api";

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
