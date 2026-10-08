import "server-only";
import { apiFetch } from "@/lib/api";
import { query, token } from "./_shared";
import type { Paginated } from "@/types/api";
import type {
  AdminDownload, AdminDownloadCategory, AdminDownloadMeta, AdminDownloadOptions,
} from "@/types/downloads";

/*
 * The downloads centre's console half (docs/downloads.md). A write with a
 * file does not come through here: the form posts the multipart body to
 * `/api/admin/downloads[/{id}]`, a route handler that streams it on, so the
 * upload shows a real percentage. These are the JSON reads and writes.
 */

type ListParams = {
  q?: string; status?: string; access?: string; category?: string;
  sort?: string; dir?: string; page?: number; per_page?: number;
};

export type DownloadPayload = Partial<{
  title: string; summary: string | null; download_category_id: number | null;
  version: string | null; released_on: string | null;
  access: string; source: string; file_path: string | null;
  status: string; sort_order: number;
  product_ids: number[]; store_product_ids: number[];
}>;

export type DownloadCategoryPayload = Partial<{
  name: string; slug: string | null; description: string | null; sort_order: number; is_active: boolean;
}>;

export async function getDownloadList(params: ListParams = {}) {
  return apiFetch<Paginated<AdminDownload> & { meta: Paginated<AdminDownload>["meta"] & AdminDownloadMeta }>(
    `/admin/downloads${query(params)}`, { token: await token() },
  );
}

export async function getDownloadOptions(): Promise<AdminDownloadOptions> {
  const res = await apiFetch<{ data: AdminDownloadOptions }>("/admin/downloads/options", { token: await token() });
  return res.data;
}

export async function getDownload(id: number): Promise<AdminDownload> {
  const res = await apiFetch<{ data: AdminDownload }>(`/admin/downloads/${id}`, { token: await token() });
  return res.data;
}

export async function createDownload(payload: DownloadPayload): Promise<AdminDownload> {
  const res = await apiFetch<{ data: AdminDownload }>("/admin/downloads", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateDownload(id: number, payload: DownloadPayload): Promise<AdminDownload> {
  const res = await apiFetch<{ data: AdminDownload }>(`/admin/downloads/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteDownload(id: number): Promise<void> {
  await apiFetch<void>(`/admin/downloads/${id}`, { method: "DELETE", token: await token() });
}

export async function getDownloadCategoryList(): Promise<AdminDownloadCategory[]> {
  const res = await apiFetch<Paginated<AdminDownloadCategory>>("/admin/download-categories?per_page=100", { token: await token() });
  return res.data;
}

export async function getDownloadCategory(id: number): Promise<AdminDownloadCategory> {
  const res = await apiFetch<{ data: AdminDownloadCategory }>(`/admin/download-categories/${id}`, { token: await token() });
  return res.data;
}

export async function createDownloadCategory(payload: DownloadCategoryPayload): Promise<AdminDownloadCategory> {
  const res = await apiFetch<{ data: AdminDownloadCategory }>("/admin/download-categories", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateDownloadCategory(id: number, payload: DownloadCategoryPayload): Promise<AdminDownloadCategory> {
  const res = await apiFetch<{ data: AdminDownloadCategory }>(`/admin/download-categories/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteDownloadCategory(id: number): Promise<void> {
  await apiFetch<void>(`/admin/download-categories/${id}`, { method: "DELETE", token: await token() });
}
