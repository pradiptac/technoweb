import "server-only";
import { apiFetch } from "@/lib/api";
import { token } from "./_shared";
import type {
  Paginated, AdminCertification, AdminClient, AdminTeamMember, AdminTeamMemberCertification,
} from "@/types/api";

/*
 * Team, clients and certifications: three index-page entities in the popup
 * shape — no slug, one request for both writes, `?done=` toasts on the
 * console side. Six functions each, on one template.
 */

type ListParams = { q?: string; status?: string; page?: number; per_page?: number };

function listQuery(params: ListParams, extra: Record<string, string | undefined> = {}): string {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.status) query.set("status", params.status);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  for (const [k, v] of Object.entries(extra)) if (v) query.set(k, v);
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export type CertificationPayload = Partial<{
  name: string; issuer: string | null; certificate_number: string | null;
  image_path: string | null; file_path: string | null;
  issued_on: string | null; valid_until: string | null; description: string | null;
  status: string; sort_order: number;
}>;

export async function getCertificationList(params: ListParams = {}) {
  return apiFetch<Paginated<AdminCertification>>(`/admin/certifications${listQuery(params)}`, { token: await token() });
}

export async function getCertification(id: number): Promise<AdminCertification> {
  const res = await apiFetch<{ data: AdminCertification }>(`/admin/certifications/${id}`, { token: await token() });
  return res.data;
}

export async function createCertification(payload: CertificationPayload): Promise<AdminCertification> {
  const res = await apiFetch<{ data: AdminCertification }>("/admin/certifications", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateCertification(id: number, payload: CertificationPayload): Promise<AdminCertification> {
  const res = await apiFetch<{ data: AdminCertification }>(`/admin/certifications/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteCertification(id: number): Promise<void> {
  await apiFetch<void>(`/admin/certifications/${id}`, { method: "DELETE", token: await token() });
}

export type ClientPayload = Partial<{
  name: string; logo_path: string | null; website_url: string | null;
  industry_id: number | null; note: string | null; is_featured: boolean;
  status: string; sort_order: number;
}>;

export async function getClientList(params: ListParams = {}) {
  return apiFetch<Paginated<AdminClient>>(`/admin/clients${listQuery(params)}`, { token: await token() });
}

export async function getClient(id: number): Promise<AdminClient> {
  const res = await apiFetch<{ data: AdminClient }>(`/admin/clients/${id}`, { token: await token() });
  return res.data;
}

export async function createClient(payload: ClientPayload): Promise<AdminClient> {
  const res = await apiFetch<{ data: AdminClient }>("/admin/clients", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateClient(id: number, payload: ClientPayload): Promise<AdminClient> {
  const res = await apiFetch<{ data: AdminClient }>(`/admin/clients/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteClient(id: number): Promise<void> {
  await apiFetch<void>(`/admin/clients/${id}`, { method: "DELETE", token: await token() });
}

export type TeamMemberPayload = Partial<{
  name: string; designation: string | null; department: string | null;
  photo_path: string | null; bio: string | null; email: string | null; linkedin_url: string | null;
  status: string; sort_order: number;
  /** Replaced wholesale: `[]` clears, absent leaves alone. */
  certifications: Omit<AdminTeamMemberCertification, "id" | "is_expired">[];
}>;

/** The departments already in use — the datalist behind the form's field. */
export type TeamMemberMeta = { departments: string[] };

export async function getTeamMemberList(params: ListParams & { department?: string } = {}) {
  return apiFetch<Paginated<AdminTeamMember> & { meta: Paginated<unknown>["meta"] & TeamMemberMeta }>(
    `/admin/team-members${listQuery(params, { department: params.department })}`,
    { token: await token() },
  );
}

export async function getTeamMember(id: number): Promise<{ data: AdminTeamMember; meta: TeamMemberMeta }> {
  return apiFetch<{ data: AdminTeamMember; meta: TeamMemberMeta }>(`/admin/team-members/${id}`, { token: await token() });
}

export async function createTeamMember(payload: TeamMemberPayload): Promise<AdminTeamMember> {
  const res = await apiFetch<{ data: AdminTeamMember }>("/admin/team-members", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateTeamMember(id: number, payload: TeamMemberPayload): Promise<AdminTeamMember> {
  const res = await apiFetch<{ data: AdminTeamMember }>(`/admin/team-members/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteTeamMember(id: number): Promise<void> {
  await apiFetch<void>(`/admin/team-members/${id}`, { method: "DELETE", token: await token() });
}
