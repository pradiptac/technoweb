import "server-only";
import { apiFetch, apiUpload } from "@/lib/api";
import { getToken } from "@/lib/admin-auth";
import type { AdminDashboard, Paginated, StaffUser, Ticket, TicketMessage, TicketPriority, TicketStatus } from "@/types/api";

/**
 * Authenticated admin reads and writes. Every function pulls the token from
 * the httpOnly cookie itself, mirroring lib/portal.ts.
 */

async function token(): Promise<string> {
  const t = await getToken();
  if (!t) throw new Error("No admin session.");
  return t;
}

export async function getDashboard(): Promise<AdminDashboard> {
  const res = await apiFetch<{ data: AdminDashboard }>("/admin/dashboard", { token: await token() });
  return res.data;
}

export async function getStaff(): Promise<StaffUser[]> {
  const res = await apiFetch<{ data: StaffUser[] }>("/admin/users", { token: await token() });
  return res.data;
}

export type TicketQueueParams = {
  status?: TicketStatus;
  priority?: TicketPriority;
  assigned_to?: number;
  unassigned?: boolean;
  overdue?: boolean;
  q?: string;
  page?: number;
  per_page?: number;
};

export async function getTickets(params: TicketQueueParams = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.priority) query.set("priority", params.priority);
  if (params.assigned_to) query.set("assigned_to", String(params.assigned_to));
  if (params.unassigned) query.set("unassigned", "1");
  if (params.overdue) query.set("overdue", "1");
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));

  const qs = query.toString();
  return apiFetch<Paginated<Ticket>>(`/admin/tickets${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function updateTicket(
  reference: string,
  data: Partial<{ status: TicketStatus; priority: TicketPriority; assigned_to: number | null; ticket_category_id: number | null }>,
): Promise<Ticket> {
  const res = await apiFetch<{ data: Ticket }>(`/admin/tickets/${reference}`, {
    method: "PATCH",
    body: data,
    token: await token(),
  });
  return res.data;
}

export async function getTicket(reference: string): Promise<Ticket> {
  const res = await apiFetch<{ data: Ticket }>(`/admin/tickets/${reference}`, { token: await token() });
  return res.data;
}

export async function replyToTicket(reference: string, formData: FormData): Promise<TicketMessage> {
  const res = await apiUpload<{ data: TicketMessage }>(
    `/admin/tickets/${reference}/reply`,
    formData,
    { token: await token() },
  );
  return res.data;
}
