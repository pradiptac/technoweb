import "server-only";
import { apiFetch } from "@/lib/api";
import { query, token } from "./_shared";
import type { Paginated, Seo, SeoOverride } from "@/types/api";
import type { TenderState } from "@/types/tenders";

/**
 * Tenders, as the console reads and writes them (0.174.0, docs/tenders.md).
 *
 * The types here are the **admin** shape and lean on nothing in the public
 * site's own tender types beyond `TenderState`, which is the API's one
 * vocabulary for the window and must mean the same thing on both sides. The
 * console sees every draft, the stored document paths beside their URLs,
 * and whether a document's file has gone — none of which a public read
 * carries. Two shapes that overlap today are still two shapes, the rule
 * `lib/admin/forms.ts` states.
 *
 * **Every label is the API's.** `closes_label`, `state_label` and
 * `status_label` are drawn as sent; nothing in the console formats a
 * tender's date, because a closing date is a wall clock in the site's zone
 * and the browser's idea of "now" has no business in it.
 */

export type TenderOption = { value: string; label: string };

/** A category as the form's picker draws it — inactive ones included. */
export type TenderCategoryOption = { id: number; name: string; is_active: boolean };

/**
 * What the form's pickers are drawn from — `meta` on the index, the read and
 * both writes. Never written out in TypeScript, the `meta.kinds` rule.
 */
export type TenderMeta = {
  statuses: TenderOption[];
  /**
   * Every category, active or not. A tender already filed under a
   * switched-off one must still show which, or saving the form would move
   * it silently.
   */
  categories: TenderCategoryOption[];
  max_documents: number;
  closing_soon_days: number;
  /** The site's zone as people say it — "IST" — for the hint under a time. */
  timezone: string;
};

const META_FALLBACK: TenderMeta = {
  statuses: [
    { value: "draft", label: "Draft" },
    { value: "published", label: "Published" },
    { value: "archived", label: "Archived" },
  ],
  categories: [],
  max_documents: 10,
  closing_soon_days: 3,
  timezone: "IST",
};

export type AdminTenderDocument = {
  title: string;
  note: string | null;
  /** What a save posts back. */
  file_path: string;
  /** The resolved address, for the link; never posted. */
  url: string | null;
  size: number | null;
  extension: string | null;
  /** Its file has gone from the library. The editor is the only one who can fix it. */
  missing: boolean;
};

export type AdminTender = {
  id: number;
  reference: string;
  title: string;
  slug: string;
  summary: string | null;
  /** On the read and the writes only — a list of forty has no use for forty. */
  description?: string | null;

  tender_category_id: number | null;
  category: { id: number; name: string; is_active: boolean } | null;

  status: string;
  status_label: string;
  is_featured: boolean;
  sort_order: number;

  /** Wall clock, `Y-m-d\THH:mm` — what a `datetime-local` holds. */
  opens_at: string;
  closes_at: string;
  opening_at: string | null;
  prebid_at: string | null;
  /** The instants, for sorting and for `<time>`. */
  opens_at_iso: string | null;
  closes_at_iso: string | null;
  opens_label: string | null;
  closes_label: string | null;
  prebid_place: string | null;

  state: TenderState;
  state_label: string;
  closes_in_label: string | null;
  closed: boolean;

  fee_paise: number | null;
  fee_label: string | null;
  emd_paise: number | null;
  emd_label: string | null;

  submission_email: string | null;
  submission_url: string | null;
  submission_address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;

  documents: AdminTenderDocument[];
  documents_count: number;

  public_path: string;
  admin_path: string;

  seo?: SeoOverride | null;
  /** What the API derives when nothing is overridden — `SeoPanel` draws it. */
  seo_defaults?: Seo | null;

  created_at: string | null;
  updated_at: string | null;
};

export type TenderPayload = {
  reference: string;
  title: string;
  slug?: string | null;
  summary?: string | null;
  description?: string | null;
  tender_category_id?: number | null;
  status?: string;
  is_featured?: boolean;
  sort_order?: number | null;
  opens_at: string;
  closes_at: string;
  opening_at?: string | null;
  prebid_at?: string | null;
  prebid_place?: string | null;
  fee_paise?: number | null;
  emd_paise?: number | null;
  submission_email?: string | null;
  submission_url?: string | null;
  submission_address?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  documents?: { title: string; file_path: string; note?: string | null }[];
  seo?: SeoOverride | null;
};

export type TenderQueryParams = {
  q?: string;
  status?: string;
  when?: string;
  /** A category's id, or the literal `none` for "filed nowhere". */
  category?: string;
  sort?: string;
  dir?: string;
  page?: number;
  per_page?: number;
};

type TenderIndex = Paginated<AdminTender> & { meta: Partial<TenderMeta> };

/** The API's `meta`, with a fallback per field so a thin response still draws a form. */
function pickMeta(meta?: Partial<TenderMeta>): TenderMeta {
  return {
    statuses: Array.isArray(meta?.statuses) && meta.statuses.length > 0 ? meta.statuses : META_FALLBACK.statuses,
    categories: Array.isArray(meta?.categories) ? meta.categories : META_FALLBACK.categories,
    max_documents: typeof meta?.max_documents === "number" ? meta.max_documents : META_FALLBACK.max_documents,
    closing_soon_days: typeof meta?.closing_soon_days === "number" ? meta.closing_soon_days : META_FALLBACK.closing_soon_days,
    timezone: typeof meta?.timezone === "string" && meta.timezone ? meta.timezone : META_FALLBACK.timezone,
  };
}

export async function getTenders(params: TenderQueryParams = {}): Promise<{
  data: AdminTender[];
  meta: Paginated<AdminTender>["meta"];
  options: TenderMeta;
}> {
  const res = await apiFetch<TenderIndex>(`/admin/tenders${query(params)}`, { token: await token() });

  return { data: res.data, meta: res.meta, options: pickMeta(res.meta) };
}

/**
 * The form's option lists without a tender to read them off.
 *
 * `/admin/tenders/new` has no record, so it asks the index for one row and
 * keeps the `meta` — the reason `/admin/events/new` does the same.
 */
export async function getTenderMeta(): Promise<TenderMeta> {
  return (await getTenders({ per_page: 1 })).options;
}

export async function getTenderWithMeta(id: number): Promise<{ tender: AdminTender; meta: TenderMeta }> {
  const res = await apiFetch<{ data: AdminTender; meta?: Partial<TenderMeta> }>(`/admin/tenders/${id}`, { token: await token() });

  return { tender: res.data, meta: pickMeta(res.meta) };
}

export async function createTender(payload: TenderPayload): Promise<AdminTender> {
  const res = await apiFetch<{ data: AdminTender }>("/admin/tenders", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateTender(id: number, payload: Partial<TenderPayload>): Promise<AdminTender> {
  const res = await apiFetch<{ data: AdminTender }>(`/admin/tenders/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteTender(id: number): Promise<void> {
  await apiFetch<void>(`/admin/tenders/${id}`, { method: "DELETE", token: await token() });
}

/** A draft copy — "(copy)", a free slug and a free reference. */
export async function duplicateTender(id: number): Promise<AdminTender> {
  const res = await apiFetch<{ data: AdminTender }>(`/admin/tenders/${id}/duplicate`, { method: "POST", token: await token() });
  return res.data;
}

/* ------------------------------------------------------------- categories */

export type AdminTenderCategory = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  tenders_count: number;
  updated_at: string | null;
};

export type TenderCategoryPayload = {
  name: string;
  slug?: string | null;
  description?: string | null;
  sort_order?: number | null;
  is_active?: boolean;
};

export async function getTenderCategories(params: { page?: number; per_page?: number } = {}): Promise<Paginated<AdminTenderCategory>> {
  return apiFetch<Paginated<AdminTenderCategory>>(`/admin/tender-categories${query(params)}`, { token: await token() });
}

export async function getTenderCategory(id: number): Promise<AdminTenderCategory> {
  const res = await apiFetch<{ data: AdminTenderCategory }>(`/admin/tender-categories/${id}`, { token: await token() });
  return res.data;
}

export async function createTenderCategory(payload: TenderCategoryPayload): Promise<AdminTenderCategory> {
  const res = await apiFetch<{ data: AdminTenderCategory }>("/admin/tender-categories", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateTenderCategory(id: number, payload: Partial<TenderCategoryPayload>): Promise<AdminTenderCategory> {
  const res = await apiFetch<{ data: AdminTenderCategory }>(`/admin/tender-categories/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

/** The tenders stay, unfiled: `tender_category_id` is `nullOnDelete`. */
export async function deleteTenderCategory(id: number): Promise<void> {
  await apiFetch<void>(`/admin/tender-categories/${id}`, { method: "DELETE", token: await token() });
}
