import "server-only";
import { apiFetch } from "@/lib/api";
import { token } from "./_shared";
import type { AdminVisit, AdminVisitIndex } from "@/types/api";

export type VisitQueryParams = {
  status?: string; q?: string; assigned_to?: string; unassigned?: boolean; open?: boolean;
  from?: string; to?: string; sort?: string; dir?: string; page?: number; per_page?: number;
};

/** The query string, built once so the list, the pager and the headers agree. */
export function visitQuery(params: VisitQueryParams): string {
  const query = new URLSearchParams();
  for (const key of ["status", "q", "assigned_to", "from", "to", "sort", "dir"] as const) {
    if (params[key]) query.set(key, String(params[key]));
  }
  for (const key of ["unassigned", "open"] as const) {
    if (params[key]) query.set(key, "1");
  }
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));

  return query.toString();
}

export async function getVisits(params: VisitQueryParams = {}): Promise<AdminVisitIndex> {
  const qs = visitQuery(params);

  return apiFetch<AdminVisitIndex>(`/admin/visits${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getVisit(reference: string): Promise<AdminVisit> {
  const res = await apiFetch<{ data: AdminVisit }>(`/admin/visits/${encodeURIComponent(reference)}`, { token: await token() });

  return res.data;
}

export type VisitUpdate = {
  status?: string;
  assigned_to?: number | null;
  staff_note?: string | null;
  cancel_reason?: string | null;
};

export async function updateVisit(reference: string, payload: VisitUpdate): Promise<AdminVisit> {
  const res = await apiFetch<{ data: AdminVisit }>(`/admin/visits/${encodeURIComponent(reference)}`, {
    method: "PATCH", body: payload, token: await token(),
  });

  return res.data;
}

export async function confirmVisit(
  reference: string, payload: { start_at: string; minutes?: number; assigned_to?: number | null },
): Promise<AdminVisit> {
  const res = await apiFetch<{ data: AdminVisit }>(`/admin/visits/${encodeURIComponent(reference)}/confirm`, {
    method: "POST", body: payload, token: await token(),
  });

  return res.data;
}
