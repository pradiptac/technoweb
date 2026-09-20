import "server-only";
import { apiFetch } from "@/lib/api";
import { token } from "./_shared";
import type {
  AdminPage, AdminFaq, FaqOwnerGroup, Paginated, PublishStatus, SeoOverride,
} from "@/types/api";

export type FaqPayload = Partial<{
  question: string; answer: string; sort_order: number | null;
  owner_type: string; owner_id: number;
}>;

export async function getFaqList(params: { q?: string; owner_type?: string; page?: number; per_page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.owner_type) query.set("owner_type", params.owner_type);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();
  return apiFetch<Paginated<AdminFaq>>(`/admin/faqs${qs ? `?${qs}` : ""}`, { token: await token() });
}

/** Everything an FAQ can hang off, grouped by type, for the owner picker. */
export async function getFaqOwners(): Promise<FaqOwnerGroup[]> {
  const res = await apiFetch<{ data: FaqOwnerGroup[] }>("/admin/faq-owners", { token: await token() });
  return res.data;
}

export async function getFaq(id: number): Promise<AdminFaq> {
  const res = await apiFetch<{ data: AdminFaq }>(`/admin/faqs/${id}`, { token: await token() });
  return res.data;
}

export async function createFaq(payload: FaqPayload): Promise<AdminFaq> {
  const res = await apiFetch<{ data: AdminFaq }>("/admin/faqs", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateFaq(id: number, payload: FaqPayload): Promise<AdminFaq> {
  const res = await apiFetch<{ data: AdminFaq }>(`/admin/faqs/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteFaq(id: number): Promise<void> {
  await apiFetch<void>(`/admin/faqs/${id}`, { method: "DELETE", token: await token() });
}

export type PageQueryParams = { status?: PublishStatus; q?: string; page?: number; per_page?: number };

export type CmsPagePayload = Partial<{
  title: string;
  slug: string | null;
  body: string | null;
  template: string | null;
  status: PublishStatus;
  published_at: string | null;
  seo: Partial<SeoOverride>;
}>;

export async function getPages(params: PageQueryParams = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));

  const qs = query.toString();
  return apiFetch<Paginated<AdminPage>>(`/admin/pages${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getPage(id: number): Promise<AdminPage> {
  const res = await apiFetch<{ data: AdminPage }>(`/admin/pages/${id}`, { token: await token() });
  return res.data;
}

export async function createPage(payload: CmsPagePayload): Promise<AdminPage> {
  const res = await apiFetch<{ data: AdminPage }>("/admin/pages", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updatePage(id: number, payload: CmsPagePayload): Promise<AdminPage> {
  const res = await apiFetch<{ data: AdminPage }>(`/admin/pages/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deletePage(id: number): Promise<void> {
  await apiFetch<void>(`/admin/pages/${id}`, { method: "DELETE", token: await token() });
}
