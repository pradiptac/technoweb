import "server-only";
import { apiFetch } from "@/lib/api";
import { token } from "./_shared";
import type { Paginated } from "@/types/api";
import type { AdminSupportCentre, SupportCentreMeta } from "@/types/support";

/** The support network's centres (0.170.0, docs/support-network.md). role:admin. */

export type SupportCentrePayload = Partial<{
  name: string; slug: string | null; kind: string; country_code: string; region: string | null; city: string;
  address: string | null; phone: string | null; phone_alt: string | null; email: string | null; hours: string | null;
  latitude: number | null; longitude: number | null; sort_order: number; is_active: boolean;
  staff: { user_id: number; title: string | null; is_public: boolean }[];
}>;

type One = { data: AdminSupportCentre; meta: SupportCentreMeta };

export async function getSupportCentreList(params: { q?: string; country?: string; active?: string; page?: number; per_page?: number } = {}) {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") query.set(k, String(v));
  const qs = query.toString();
  return apiFetch<Paginated<AdminSupportCentre> & { meta: Paginated<AdminSupportCentre>["meta"] & SupportCentreMeta }>(
    `/admin/support-centres${qs ? `?${qs}` : ""}`, { token: await token() },
  );
}

export async function getSupportCentre(id: number): Promise<One> {
  return apiFetch<One>(`/admin/support-centres/${id}`, { token: await token() });
}

export async function createSupportCentre(payload: SupportCentrePayload): Promise<AdminSupportCentre> {
  const res = await apiFetch<One>("/admin/support-centres", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateSupportCentre(id: number, payload: SupportCentrePayload): Promise<AdminSupportCentre> {
  const res = await apiFetch<One>(`/admin/support-centres/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteSupportCentre(id: number): Promise<void> {
  await apiFetch<void>(`/admin/support-centres/${id}`, { method: "DELETE", token: await token() });
}
