import "server-only";
import { apiFetch } from "@/lib/api";
import { query, token } from "./_shared";
import type {
  AdminPage, AdminFaq, AnswerBlock, FaqOwnerGroup, PageBuilderOptions, PageSection, Paginated, PublishStatus,
  SavedSection, SeoOverride, StoredSection,
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
  /** Custom field values keyed by field key (docs/custom-content.md); absent leaves them alone. */
  custom_fields: Record<string, unknown>;
  title: string;
  slug: string | null;
  body: string | null;
  template: string | null;
  status: PublishStatus;
  published_at: string | null;
  answer_blocks: AnswerBlock[];
  /** The builder's sections, posted whole (`docs/page-builder.md`). */
  blocks: StoredSection[];
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

/* The section library and page templates (0.106.0, docs/page-builder.md "The library"). */
export type SavedSectionPayload = { kind?: "section" | "template"; name?: string; description?: string | null; blocks?: StoredSection[] };

export async function getSavedSections(params: { kind?: string; q?: string; page?: number; per_page?: number } = {}): Promise<Paginated<SavedSection>> {
  return apiFetch<Paginated<SavedSection>>(`/admin/saved-sections${query(params)}`, { token: await token() });
}

export async function getSavedSection(id: number): Promise<SavedSection> {
  const res = await apiFetch<{ data: SavedSection }>(`/admin/saved-sections/${id}`, { token: await token() });
  return res.data;
}

export async function createSavedSection(payload: SavedSectionPayload): Promise<SavedSection> {
  const res = await apiFetch<{ data: SavedSection }>("/admin/saved-sections", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateSavedSection(id: number, payload: SavedSectionPayload): Promise<SavedSection> {
  const res = await apiFetch<{ data: SavedSection }>(`/admin/saved-sections/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteSavedSection(id: number): Promise<void> {
  await apiFetch<void>(`/admin/saved-sections/${id}`, { method: "DELETE", token: await token() });
}

/** Everything the section builder's selects are drawn from — types, presets and the published pickers. */
export async function getPageBuilderOptions(): Promise<PageBuilderOptions> {
  const res = await apiFetch<{ data: PageBuilderOptions }>("/admin/pages/builder", { token: await token() });
  return res.data;
}

/**
 * A page body laid out as builder sections (0.109.0): split at its headings
 * by the API, cleaned as a saved body is. Writes nothing.
 */
export async function sectionsFromBody(body: string): Promise<StoredSection[]> {
  const res = await apiFetch<{ data: { sections: StoredSection[] } }>("/admin/pages/sections-from-body", {
    method: "POST", body: { body }, token: await token(),
  });
  return res.data.sections;
}

/**
 * The unsaved-draft preview: the sections as typed, validated by the rules a
 * save runs and presented as the public site reads them. Writes nothing.
 */
export async function previewPageSections(blocks: StoredSection[], pageId?: number | null): Promise<PageSection[]> {
  const res = await apiFetch<{ data: { sections: PageSection[] } }>("/admin/pages/preview", {
    method: "POST", body: { blocks, page_id: pageId ?? null }, token: await token(),
  });
  return res.data.sections;
}
