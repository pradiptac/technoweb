import "server-only";
import { apiFetch } from "@/lib/api";
import { token } from "./_shared";
import type { AdminLead, LeadIndex } from "./chat";

export type LeadQueryParams = {
  status?: string; band?: string; channel?: string; q?: string;
  assigned_to?: string; unassigned?: boolean; open?: boolean; overdue?: boolean;
  source_path?: string; sort?: string; page?: number; per_page?: number;
};

/** The query string, built once because the list and its export must agree. */
export function leadQuery(params: LeadQueryParams): string {
  const query = new URLSearchParams();
  for (const key of ["status", "band", "channel", "q", "assigned_to", "source_path", "sort"] as const) {
    if (params[key]) query.set(key, String(params[key]));
  }
  for (const key of ["unassigned", "open", "overdue"] as const) {
    if (params[key]) query.set(key, "1");
  }
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));

  return query.toString();
}

export async function getLeads(params: LeadQueryParams = {}) {
  const qs = leadQuery(params);

  return apiFetch<LeadIndex>(`/admin/leads${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getLead(id: number): Promise<AdminLead> {
  const res = await apiFetch<{ data: AdminLead }>(`/admin/leads/${id}`, { token: await token() });

  return res.data;
}

export type LeadUpdate = {
  status?: string;
  assigned_to?: number | null;
  follow_up_at?: string | null;
  value_paise?: number | null;
  note?: string;
};

export async function updateLead(id: number, payload: LeadUpdate): Promise<AdminLead> {
  const res = await apiFetch<{ data: AdminLead }>(`/admin/leads/${id}`, {
    method: "PATCH", body: payload, token: await token(),
  });

  return res.data;
}

export async function addLeadNote(id: number, body: string): Promise<void> {
  await apiFetch(`/admin/leads/${id}/notes`, { method: "POST", body: { body }, token: await token() });
}

export async function deleteLead(id: number): Promise<void> {
  await apiFetch(`/admin/leads/${id}`, { method: "DELETE", token: await token() });
}
