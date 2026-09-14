import "server-only";
import { apiFetch } from "@/lib/api";
import { query, token } from "./_shared";
import type {
  ActivityEntry, AdminCustomer, AdminStaff, RoleOption, Paginated, ClientErrorRow,
} from "@/types/api";

/**
 * The activity log. Read-only by design — there is no create, update or delete
 * here because the API offers none, and a log the console can edit is not one.
 */
export async function getActivity(params: {
  action?: string; q?: string; page?: number; per_page?: number;
} = {}) {
  const query = new URLSearchParams();
  if (params.action) query.set("action", params.action);
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();

  return apiFetch<Paginated<ActivityEntry> & { meta: { retention_days: number; actions: string[] } }>(
    `/admin/activity${qs ? `?${qs}` : ""}`,
    { token: await token() },
  );
}

/**
 * Portal accounts and the approval queue.
 *
 * Every mutation returns the updated row, so the caller re-renders from the
 * server's answer rather than from what it hoped it wrote — a status the API
 * refused would otherwise show as applied until the next reload.
 */
export async function getCustomers(params: {
  status?: string; q?: string; verified?: string; page?: number; per_page?: number;
} = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.q) query.set("q", params.q);
  if (params.verified) query.set("verified", params.verified);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();

  return apiFetch<Paginated<AdminCustomer> & { meta: { pending_count?: number } }>(
    `/admin/customers${qs ? `?${qs}` : ""}`,
    { token: await token() },
  );
}

export async function getCustomer(id: number): Promise<AdminCustomer> {
  const res = await apiFetch<{ data: AdminCustomer }>(`/admin/customers/${id}`, { token: await token() });
  return res.data;
}

export async function updateCustomer(
  id: number,
  payload: Partial<{ name: string; email: string; company: string | null; phone: string | null }>,
): Promise<AdminCustomer> {
  const res = await apiFetch<{ data: AdminCustomer }>(`/admin/customers/${id}`, {
    method: "PATCH", body: payload, token: await token(),
  });
  return res.data;
}

export async function approveCustomer(id: number): Promise<AdminCustomer> {
  const res = await apiFetch<{ data: AdminCustomer }>(`/admin/customers/${id}/approve`, {
    method: "POST", token: await token(),
  });
  return res.data;
}

export async function rejectCustomer(id: number, note?: string): Promise<AdminCustomer> {
  const res = await apiFetch<{ data: AdminCustomer }>(`/admin/customers/${id}/reject`, {
    method: "POST", body: { note: note || null }, token: await token(),
  });
  return res.data;
}

export async function setCustomerStatus(
  id: number, status: "active" | "suspended", note?: string,
): Promise<AdminCustomer> {
  const res = await apiFetch<{ data: AdminCustomer }>(`/admin/customers/${id}/status`, {
    method: "POST", body: { status, note: note || null }, token: await token(),
  });
  return res.data;
}

export async function resendCustomerVerificationEmail(id: number): Promise<AdminCustomer> {
  const res = await apiFetch<{ data: AdminCustomer }>(`/admin/customers/${id}/resend-verification`, {
    method: "POST", token: await token(),
  });
  return res.data;
}

export type StaffPayload = Partial<{
  name: string; email: string; phone: string; password: string | null;
  is_active: boolean; roles: string[];
}>;

export async function getStaffList(params: { q?: string; role?: string; page?: number; per_page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.role) query.set("role", params.role);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();
  return apiFetch<Paginated<AdminStaff>>(`/admin/staff${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getStaffRoles(): Promise<RoleOption[]> {
  const res = await apiFetch<{ data: RoleOption[] }>("/admin/staff/roles", { token: await token() });
  return res.data;
}

/** One staff account, for the edit screen. getStaff() in tickets.ts is the read-only
 *  assignment picker on /admin/users and stays as it is. */
export async function getStaffMember(id: number): Promise<AdminStaff> {
  const res = await apiFetch<{ data: AdminStaff }>(`/admin/staff/${id}`, { token: await token() });
  return res.data;
}

export async function createStaff(payload: StaffPayload): Promise<AdminStaff> {
  const res = await apiFetch<{ data: AdminStaff }>("/admin/staff", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateStaff(id: number, payload: StaffPayload): Promise<AdminStaff> {
  const res = await apiFetch<{ data: AdminStaff }>(`/admin/staff/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteStaff(id: number): Promise<void> {
  await apiFetch<void>(`/admin/staff/${id}`, { method: "DELETE", token: await token() });
}

export type ClientErrorList = Paginated<ClientErrorRow> & {
  meta: { unresolved: number; retention_days: number };
};

export async function getClientErrors(
  params: { q?: string; area?: string; all?: boolean; page?: number; per_page?: number } = {},
): Promise<ClientErrorList> {
  // `all` goes over the wire as "1" rather than `true`: `query()` builds a
  // query string, and a boolean has no agreed spelling in one — Laravel reads
  // it through `boolean()`, which wants the "1" every other flag here sends.
  const { all, ...rest } = params;

  return apiFetch<ClientErrorList>(
    `/admin/client-errors${query({ ...rest, ...(all ? { all: "1" } : {}) })}`,
    { token: await token() },
  );
}

export async function resolveClientError(id: number): Promise<void> {
  await apiFetch<void>(`/admin/client-errors/${id}/resolve`, { method: "POST", token: await token() });
}
