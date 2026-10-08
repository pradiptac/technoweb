import "server-only";
import { apiFetch, ApiError } from "@/lib/api";
import { query, token } from "./_shared";
import type {
  AdminPage, AdminFaq, AiDraftAvailability, AiDraftLength, AiDraftResult, AiSectionMode, AnswerBlock, FaqOwnerGroup, PageBuilderOptions, PageSection, Paginated, PublishStatus,
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

/** The pages index, whose `meta` also says whether the AI page builder can draft (0.116.0; absent from an older API). */
export type PagesIndex = Paginated<AdminPage> & {
  meta: Paginated<AdminPage>["meta"] & { ai_draft?: AiDraftAvailability };
};

export async function getPages(params: PageQueryParams = {}): Promise<PagesIndex> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));

  const qs = query.toString();
  return apiFetch<PagesIndex>(`/admin/pages${qs ? `?${qs}` : ""}`, { token: await token() });
}

const AI_DRAFT_TIMEOUT_MS = 150_000;

export type AiDraftInput = {
  brief: string;
  length: AiDraftLength;
  pictures: boolean;
  /** The identity icon keys the assistant may choose from — `iconMap`'s, read on the server. */
  icons: string[];
};

/**
 * Has the AI page builder draft a page from a brief (0.116.0). The API saves
 * it as a draft and answers where it is; a refusal is a 422 on `brief`.
 *
 * A model call routinely takes 20–60 seconds. `apiFetch` sets no timeout of
 * its own (undici's defaults are five minutes), so this call carries a
 * ceiling of its own: long enough for a slow answer, short enough that a hung
 * one ends as a sentence on the form rather than a spinner nobody can stop.
 */
export async function draftPageWithAi(input: AiDraftInput): Promise<AiDraftResult> {
  const res = await apiFetch<{ data: AiDraftResult }>("/admin/pages/ai-draft", {
    method: "POST", body: input, token: await token(), signal: AbortSignal.timeout(AI_DRAFT_TIMEOUT_MS),
  });
  return res.data;
}

export type AiSectionInput = {
  mode: AiSectionMode;
  type: string;
  /** The section's `data` as the builder holds it. */
  data: Record<string, unknown>;
  brief: string | null;
  icons: string[];
};

const AI_SECTION_TIMEOUT_MS = 90_000;

/**
 * Has the assistant write, reword, shorten or expand one section's wording
 * (0.127.0). Answers the section's `data` with the words replaced and
 * everything else as it was sent; nothing is saved. A refusal is a 422 on
 * `brief` or `section`. The ceiling is this call's own, as the page draft's is.
 */
export async function wordSectionWithAi(input: AiSectionInput): Promise<Record<string, unknown>> {
  const res = await apiFetch<{ data: { section_data: Record<string, unknown> } }>("/admin/pages/ai-section", {
    method: "POST", body: input, token: await token(), signal: AbortSignal.timeout(AI_SECTION_TIMEOUT_MS),
  });
  return res.data.section_data;
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
 * The same options, or **null when this account may not read them** (0.130.0).
 *
 * The builder is a content manager's, and a shop product's form — which has
 * a Sections tab since 0.130.0 — is a store manager's. A 403 is the answer
 * "not this role" and becomes null, so that form can say so in the tab's
 * place; anything else (the API down, a session gone) is thrown as before.
 */
export async function getPageBuilderOptionsIfAllowed(): Promise<PageBuilderOptions | null> {
  try {
    return await getPageBuilderOptions();
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) return null;
    throw error;
  }
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
