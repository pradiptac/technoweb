import "server-only";
import { apiFetch } from "@/lib/api";
import { token, query } from "./_shared";
import type {
  AdminRedirect, NotFoundHitRow, SeoAiActionKey, SeoAiMeta, SeoMeta, SeoRow, SeoSuggestion, Paginated, AdminLandingPage, AdminLocation, LandingOpportunity,
} from "@/types/api";

export type RedirectPayload = Partial<{
  from_path: string; to_path: string; status_code: number | null; is_active: boolean;
}>;

export async function getRedirectList(params: { q?: string; source?: string; page?: number; per_page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.source) query.set("source", params.source);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();
  return apiFetch<Paginated<AdminRedirect>>(`/admin/redirects${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getRedirect(id: number): Promise<AdminRedirect> {
  const res = await apiFetch<{ data: AdminRedirect }>(`/admin/redirects/${id}`, { token: await token() });
  return res.data;
}

export async function createRedirect(payload: RedirectPayload): Promise<AdminRedirect> {
  const res = await apiFetch<{ data: AdminRedirect }>("/admin/redirects", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateRedirect(id: number, payload: RedirectPayload): Promise<AdminRedirect> {
  const res = await apiFetch<{ data: AdminRedirect }>(`/admin/redirects/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteRedirect(id: number): Promise<void> {
  await apiFetch<void>(`/admin/redirects/${id}`, { method: "DELETE", token: await token() });
}

export type NotFoundList = Paginated<NotFoundHitRow> & {
  meta: { live: number; ignored: number; retention_days: number };
};

/**
 * The addresses visitors asked for that do not exist (0.137.0).
 *
 * `ignored` goes over the wire as "1" rather than `true`, the reason
 * `getClientErrors` gives: a boolean has no agreed spelling in a query string.
 */
export async function getNotFoundList(
  params: { q?: string; ignored?: boolean; sort?: string; dir?: string; page?: number; per_page?: number } = {},
): Promise<NotFoundList> {
  const { ignored, ...rest } = params;

  return apiFetch<NotFoundList>(
    `/admin/not-found${query({ ...rest, ...(ignored ? { ignored: "1" } : {}) })}`,
    { token: await token() },
  );
}

/** "Not worth a redirect", or its undo. Both idempotent. */
export async function setNotFoundIgnored(id: number, ignored: boolean): Promise<void> {
  await apiFetch<void>(`/admin/not-found/${id}/${ignored ? "ignore" : "restore"}`, { method: "POST", token: await token() });
}

/**
 * One record's score, recomputed now.
 *
 * What the Recheck button calls. The record's edit form opens in a new tab on
 * purpose — working down a filtered list should not spend your place in it —
 * which leaves the list holding a score from before the edit, and reloading to
 * fix that costs the filters and the scroll position the new tab was
 * protecting.
 *
 * The API still collects every record to answer this, because two of the
 * checks are about duplicate titles and descriptions and neither can be seen
 * from inside a single row. What it saves is the response: 1.5KB against the
 * 73KB the list sends, and one row to re-render rather than fifty.
 */
export async function getSeoRecord(type: string, id: number): Promise<SeoRow> {
  const res = await apiFetch<{ data: SeoRow }>(
    `/admin/seo/${encodeURIComponent(type)}/${id}`,
    { token: await token() },
  );

  return res.data;
}

export async function getSeoOverview(
  params: {
    type?: string; q?: string; issues?: string; check?: string; ai?: string; search?: string; analytics?: string;
    aeo?: string; geo?: string; aeo_check?: string; geo_check?: string;
    sort?: string; dir?: string; page?: string; per_page?: string;
  } = {},
) {
  const query = new URLSearchParams();
  if (params.type) query.set("type", params.type);
  // Readiness (docs/aeo-geo-contract.md §5): `?aeo=poor|fair`, `?geo=poor|fair`
  // filter by band, `?sort=aeo|geo` orders by the value through `ListSort`.
  if (params.aeo) query.set("aeo", params.aeo);
  if (params.geo) query.set("geo", params.geo);
  if (params.sort) query.set("sort", params.sort);
  if (params.dir) query.set("dir", params.dir);
  // The AI review queue: records holding a suggestion nobody has read.
  if (params.ai) query.set("ai", params.ai);
  // Search Console: `no_clicks` is the pages shown and never opened.
  if (params.search) query.set("search", params.search);
  // Google Analytics: `no_views` is the pages search shows and nobody opens.
  if (params.analytics) query.set("analytics", params.analytics);
  if (params.q) query.set("q", params.q);
  // Server-side, because the results are paginated: filtering a page in the
  // browser would hide only the rows that happened to land on it.
  if (params.issues) query.set("issues", params.issues);
  // One failed check, named. This is what turns a figure on the score card
  // into the list of records behind it.
  if (params.check) query.set("check", params.check);
  // The same door for the two readiness scores' own biggest wins.
  if (params.aeo_check) query.set("aeo_check", params.aeo_check);
  if (params.geo_check) query.set("geo_check", params.geo_check);
  if (params.page) query.set("page", params.page);
  if (params.per_page) query.set("per_page", params.per_page);
  const qs = query.toString();
  return apiFetch<{ data: SeoRow[]; meta: SeoMeta }>(`/admin/seo${qs ? `?${qs}` : ""}`, { token: await token() });
}

/**
 * Run one AI action against one record.
 *
 * Nothing here writes an SEO field. It stores a suggestion and hands it back;
 * applying one puts the value into the form the editor is already looking at,
 * and saving goes through the record's own update endpoint with the same
 * validation and sanitising a typed value gets.
 */
/**
 * What an action needs beyond the record. `improve_answer` names the one
 * answer block it rewrites (`block_id`, a saved block of this record — the
 * API answers 422 with a sentence otherwise); every other action takes
 * nothing more. `docs/aeo-geo-contract.md` §6.
 */
export type SeoAiRunExtra = { block_id?: number };

export async function runSeoAi(action: SeoAiActionKey, type: string, id: number, extra: SeoAiRunExtra = {}) {
  const res = await apiFetch<{ data: SeoSuggestion }>(
    `/admin/seo/ai/${encodeURIComponent(action)}`,
    { method: "POST", body: { type, id, ...extra }, token: await token() },
  );

  return res.data;
}

/**
 * Run one action against many records, on the queue.
 *
 * Answers at once with what was queued and what was skipped; the
 * suggestions arrive as the queue drains, on each record's SEO panel and
 * under `?ai=pending` on the overview. The API makes the assistant's three
 * refusals before queueing anything and never queues past the daily cap.
 */
export async function bulkSeoAi(action: SeoAiActionKey, type: string, ids: number[]) {
  return apiFetch<{ queued: number; skipped_pending: number; skipped_cap: number; delivering: boolean }>(
    "/admin/seo/ai/bulk",
    { method: "POST", token: await token(), body: { action, type, ids } },
  );
}

export async function getSeoSuggestions(type: string, id: number) {
  return apiFetch<{ data: SeoSuggestion[]; meta: SeoAiMeta }>(
    `/admin/seo/ai/suggestions?type=${encodeURIComponent(type)}&id=${id}`,
    { token: await token() },
  );
}

export async function decideSeoSuggestion(id: number, status: "applied" | "rejected") {
  const res = await apiFetch<{ data: SeoSuggestion }>(
    `/admin/seo/ai/suggestions/${id}/status`,
    { method: "POST", body: { status }, token: await token() },
  );

  return res.data;
}

/** Exactly what the model would be told about this record, and its size. */
export async function getSeoAiContext(type: string, id: number, action?: SeoAiActionKey) {
  const query = new URLSearchParams({ type, id: String(id) });
  if (action) query.set("action", action);

  const res = await apiFetch<{
    data: { action: string; context: string; characters: number; approximate_tokens: number };
  }>(`/admin/seo/ai/context?${query}`, { token: await token() });

  return res.data;
}

/**
 * One real call, to prove a model id works on this account.
 *
 * The only endpoint in this module that reports the provider's own words —
 * "that model does not exist" is what tells somebody what to fix, and the same
 * argument the mail test makes.
 */
export async function testSeoAiModel(model?: string) {
  const res = await apiFetch<{ data: { model: string; ok: boolean; tokens: number } }>(
    "/admin/seo/ai/test-model",
    { method: "POST", body: { model }, token: await token() },
  );

  return res.data;
}

/**
 * The models the console may choose, and which two are saved — for the
 * "Test a model" control beside the OpenRouter key. Calls no provider.
 */
export type AiModels = {
  models: { value: string; label: string; description: string }[];
  seoModel: string;
  chatbotModel: string;
  keyConfigured: boolean;
};

export async function getAiModels(): Promise<AiModels> {
  const res = await apiFetch<{
    data: AiModels["models"];
    meta: { seo_model: string; chatbot_model: string; key_configured: boolean };
  }>("/admin/seo/ai/models", { token: await token() });

  return { models: res.data, seoModel: res.meta.seo_model, chatbotModel: res.meta.chatbot_model, keyConfigured: res.meta.key_configured };
}

export async function setSitemapInclude(type: string, id: number, include: boolean): Promise<void> {
  await apiFetch<void>("/admin/seo/sitemap", {
    method: "PATCH", body: { type, id, sitemap_include: include }, token: await token(),
  });
}

export type LandingPagePayload = {
  kind?: string;
  brand_id?: number | null;
  product_category_id?: number | null;
  solution_id?: number | null;
  service_id?: number | null;
  location_id?: number | null;
  title?: string;
  heading?: string;
  intro?: string | null;
  body?: string | null;
  status?: string;
  seo?: Record<string, unknown>;
};

export async function getLandingPages(
  params: { status?: string; kind?: string; q?: string; page?: number; per_page?: number } = {},
) {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) query.set(k, String(v));
  const qs = query.toString();

  return apiFetch<Paginated<AdminLandingPage> & { meta: { cap: number; published: number; kinds: { value: string; label: string }[] } }>(
    `/admin/landing-pages${qs ? `?${qs}` : ""}`,
    { token: await token() },
  );
}

export async function getLandingPage(id: number): Promise<AdminLandingPage> {
  const res = await apiFetch<{ data: AdminLandingPage }>(`/admin/landing-pages/${id}`, { token: await token() });
  return res.data;
}

export async function getLandingOpportunities(kind?: string) {
  const qs = kind ? `?kind=${kind}` : "";
  return apiFetch<{
    data: LandingOpportunity[];
    meta: { skipped_locations: string[]; min_products: number; cap: number; published: number };
  }>(`/admin/landing-pages/opportunities${qs}`, { token: await token() });
}

export async function createLandingPage(payload: LandingPagePayload): Promise<AdminLandingPage> {
  const res = await apiFetch<{ data: AdminLandingPage }>("/admin/landing-pages", {
    method: "POST", body: payload, token: await token(),
  });
  return res.data;
}

export async function updateLandingPage(id: number, payload: LandingPagePayload): Promise<AdminLandingPage> {
  const res = await apiFetch<{ data: AdminLandingPage }>(`/admin/landing-pages/${id}`, {
    method: "PATCH", body: payload, token: await token(),
  });
  return res.data;
}

export async function deleteLandingPage(id: number): Promise<void> {
  await apiFetch<void>(`/admin/landing-pages/${id}`, { method: "DELETE", token: await token() });
}

export type LocationPayload = {
  name?: string;
  slug?: string;
  parent_id?: number | null;
  level?: string;
  service_ids?: number[];
  solution_ids?: number[];
  office_address?: string | null;
  response_time?: string | null;
  summary?: string | null;
  sort_order?: number;
  is_active?: boolean;
};

export async function getLocations(params: { q?: string; active?: string; level?: string; page?: number; per_page?: number } = {}) {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) query.set(k, String(v));
  const qs = query.toString();
  return apiFetch<Paginated<AdminLocation>>(`/admin/locations${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getLocation(id: number): Promise<AdminLocation> {
  const res = await apiFetch<{ data: AdminLocation }>(`/admin/locations/${id}`, { token: await token() });
  return res.data;
}

export async function createLocation(payload: LocationPayload): Promise<AdminLocation> {
  const res = await apiFetch<{ data: AdminLocation }>("/admin/locations", {
    method: "POST", body: payload, token: await token(),
  });
  return res.data;
}

export async function updateLocation(id: number, payload: LocationPayload): Promise<AdminLocation> {
  const res = await apiFetch<{ data: AdminLocation }>(`/admin/locations/${id}`, {
    method: "PATCH", body: payload, token: await token(),
  });
  return res.data;
}

export async function deleteLocation(id: number): Promise<void> {
  await apiFetch<void>(`/admin/locations/${id}`, { method: "DELETE", token: await token() });
}
