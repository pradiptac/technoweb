import "server-only";
import { apiFetch } from "@/lib/api";
import { token, query } from "./_shared";
import type { HealthList, HealthRow } from "@/types/health";

export type { HealthList, HealthRow };

/** The ticked rows' ignore/restore goes through `runBulkAction` (`lib/admin/bulk.ts`) with path `health`. */
export async function getHealthList(
  params: { group?: string; severity?: string; type?: string; ignored?: boolean; page?: number; per_page?: number } = {},
): Promise<HealthList> {
  const { ignored, ...rest } = params;
  return apiFetch<HealthList>(`/admin/health${query({ ...rest, ...(ignored ? { ignored: "1" } : {}) })}`, { token: await token() });
}

export async function setHealthIgnored(id: number, ignored: boolean): Promise<void> {
  await apiFetch<void>(`/admin/health/${id}/${ignored ? "ignore" : "restore"}`, { method: "POST", token: await token() });
}

export async function recheckHealth(type: string, id: number): Promise<HealthRow[]> {
  const res = await apiFetch<{ data: HealthRow[] }>("/admin/health/recheck", { method: "POST", body: { type, id }, token: await token() });
  return res.data;
}
