"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";

import { runBulkAction } from "@/lib/admin/bulk";
import type { BulkState } from "@/types/bulk";
import { ApiError } from "@/lib/api";
import {
  createTender, createTenderCategory, deleteTender, deleteTenderCategory,
  duplicateTender, updateTender, updateTenderCategory,
  type TenderCategoryPayload, type TenderPayload,
} from "@/lib/admin";
import { seoFromFormData } from "@/lib/admin-form";

export type TenderState = { error?: string; fieldErrors?: Record<string, string[]> };

/*
 * What a change to a tender can be on: the tenders pages themselves, a
 * builder `cards` section drawing the open ones — which can sit on a page or
 * in the body area of any record that takes sections — and a "Tenders" link
 * in a menu, which appears with the first published notice.
 */
const SHOWS_TENDERS = [
  "tenders", "menus",
  "pages", "solutions", "services", "industries", "case-studies",
  "blog", "kb", "products", "store-products", "events", "careers", "entries",
] as const;

/**
 * `updateTag`, not `revalidateTag` — read-your-own-writes, so the editor who
 * just saved sees their change on the next request rather than waiting out
 * the window.
 */
function refresh(id?: number): void {
  SHOWS_TENDERS.forEach((tag) => updateTag(tag));
  revalidatePath("/admin/tenders");
  if (id) revalidatePath(`/admin/tenders/${id}`);
}

const str = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

/**
 * Rupees as typed → paise as an integer.
 *
 * Blank is **null and not zero**: "we have not said what the fee is" and
 * "the document is free" are different answers, and the API draws them
 * differently — null shows nothing, zero reads "Free".
 *
 * Rounded rather than truncated, so `2500.005` does not quietly lose a
 * paisa; the field is `step="0.01"` so it should not arise.
 */
function paise(formData: FormData, key: string): number | null {
  const raw = str(formData, key).replace(/[,\s₹]/g, "");

  if (raw === "") return null;

  const rupees = Number(raw);

  return Number.isFinite(rupees) && rupees >= 0 ? Math.round(rupees * 100) : null;
}

/**
 * The documents repeater, rebuilt from its three parallel fields.
 *
 * A row with no file is dropped rather than sent: the repeater starts a new
 * row empty, and posting it would be a 422 on a row the editor has not
 * filled in yet.
 */
function documents(formData: FormData): TenderPayload["documents"] {
  const titles = formData.getAll("document_title").map((v) => String(v));
  const paths = formData.getAll("document_path").map((v) => String(v));
  const notes = formData.getAll("document_note").map((v) => String(v));

  return paths
    .map((path, i) => ({
      title: (titles[i] ?? "").trim(),
      file_path: path.trim(),
      note: (notes[i] ?? "").trim() || null,
    }))
    .filter((row) => row.file_path !== "");
}

function payload(formData: FormData): TenderPayload {
  const seo = seoFromFormData(formData);

  return {
    reference: str(formData, "reference"),
    title: str(formData, "title"),
    slug: str(formData, "slug") || null,
    summary: str(formData, "summary") || null,
    description: String(formData.get("description") ?? ""),
    tender_category_id: Number(str(formData, "tender_category_id")) || null,
    status: str(formData, "status") || "draft",
    is_featured: str(formData, "is_featured") === "1",
    sort_order: Number(str(formData, "sort_order")) || 0,
    opens_at: str(formData, "opens_at"),
    closes_at: str(formData, "closes_at"),
    // A blank datetime is "not stated", not the epoch.
    opening_at: str(formData, "opening_at") || null,
    prebid_at: str(formData, "prebid_at") || null,
    prebid_place: str(formData, "prebid_place") || null,
    fee_paise: paise(formData, "fee_rupees"),
    emd_paise: paise(formData, "emd_rupees"),
    submission_email: str(formData, "submission_email") || null,
    submission_url: str(formData, "submission_url") || null,
    submission_address: String(formData.get("submission_address") ?? "").trim() || null,
    contact_name: str(formData, "contact_name") || null,
    contact_phone: str(formData, "contact_phone") || null,
    contact_email: str(formData, "contact_email") || null,
    documents: documents(formData),
    // **Omitted when the panel was never touched, not sent as null.** The
    // API's rule is `['sometimes', 'array']`, and `sometimes` skips an
    // absent key — a `null` one is present and fails the `array` check, so
    // sending it refused every save with "The seo field must be an array."
    // on a tab nobody had opened. The rule every other form here follows.
    ...(seo ? { seo: seo as TenderPayload["seo"] } : {}),
  };
}

function fail(error: unknown, noun = "tender"): TenderState {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
    if (error.status === 403) return { error: `Your account cannot edit ${noun}s.` };
    if (error.status === 404) return { error: `That ${noun} no longer exists.` };
  }

  return { error: `We could not save the ${noun}. Try again shortly.` };
}

/* ------------------------------------------------------------- tenders */

export async function createTenderAction(_state: TenderState, formData: FormData): Promise<TenderState> {
  let id: number;

  try {
    id = (await createTender(payload(formData))).id;
  } catch (error) {
    return fail(error);
  }

  refresh(id);
  // Outside the try: `redirect()` works by throwing, and a catch that tried
  // to recognise it would swallow it — the tender would be created while the
  // screen said it had not been.
  redirect(`/admin/tenders/${id}?done=tender-created`);
}

export async function updateTenderAction(id: number, _state: TenderState, formData: FormData): Promise<TenderState> {
  try {
    await updateTender(id, payload(formData));
  } catch (error) {
    return fail(error);
  }

  refresh(id);
  redirect(`/admin/tenders/${id}?done=saved`);
}

/** Where a refused delete returns to — only ever a tenders screen of ours. */
function backTo(formData: FormData): string {
  const raw = formData.get("back");
  const path = typeof raw === "string" ? raw : "";

  return /^\/admin\/tenders(\/\d+)?(\?[\w=&%.+-]*)?$/.test(path) ? path : "/admin/tenders";
}

/** `path` with `?done=<key>` added to whatever query it already carries. */
function withDone(path: string, key: string): string {
  const [pathname, search = ""] = path.split("?");
  const query = new URLSearchParams(search);
  query.delete("done");
  query.set("done", key);

  return `${pathname}?${query}`;
}

/**
 * Delete a tender.
 *
 * Reads the id from the form's own hidden field rather than taking it bound,
 * because it is passed as a `formAction` on the delete button and a
 * `formAction` is handed the form data and nothing else.
 *
 * Its documents are **not** deleted: they are media-library files, the
 * library is where a file is removed, and the same pack is often on two
 * tenders.
 */
export async function deleteTenderAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!id) return;

  let refused = false;

  try {
    await deleteTender(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/admin/login");
    refused = true;
  }

  // A refusal goes back to the tender with the reason, rather than to a list
  // that would simply still show it — the rule the twelve content lists
  // follow since 2026-09-26.
  if (refused) redirect(withDone(backTo(formData), "not-deleted"));

  refresh();
  redirect("/admin/tenders?done=tender-deleted");
}

/** A draft copy, opened straight away so its number and dates can be changed. */
export async function duplicateTenderAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!id) return;

  let copy: number | null = null;

  try {
    copy = (await duplicateTender(id)).id;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/admin/login");
  }

  if (copy === null) redirect(withDone(`/admin/tenders/${id}`, "not-duplicated"));

  refresh();
  redirect(`/admin/tenders/${copy}?done=tender-duplicated`);
}

export async function bulkTendersAction(_prev: BulkState, formData: FormData): Promise<BulkState> {
  return runBulkAction(formData, {
    path: "tenders",
    noun: ["tender", "tenders"],
    tags: SHOWS_TENDERS,
    paths: ["/admin/tenders"],
  });
}

/* ----------------------------------------------------------- categories */

function categoryPayload(formData: FormData): TenderCategoryPayload {
  return {
    name: str(formData, "name"),
    slug: str(formData, "slug") || null,
    description: str(formData, "description") || null,
    sort_order: Number(str(formData, "sort_order")) || 0,
    is_active: str(formData, "is_active") === "1",
  };
}

export async function createTenderCategoryAction(_state: TenderState, formData: FormData): Promise<TenderState> {
  try {
    await createTenderCategory(categoryPayload(formData));
  } catch (error) {
    return fail(error, "category");
  }

  refresh();
  redirect("/admin/tenders/categories?done=category-created");
}

export async function updateTenderCategoryAction(id: number, _state: TenderState, formData: FormData): Promise<TenderState> {
  try {
    await updateTenderCategory(id, categoryPayload(formData));
  } catch (error) {
    return fail(error, "category");
  }

  refresh();
  redirect("/admin/tenders/categories?done=saved");
}

/**
 * Delete a category. Its tenders stay, filed under none
 * (`tender_category_id` is `nullOnDelete`).
 *
 * Reads the id from the form's own hidden field, because it is passed as a
 * `formAction` on the delete button and a `formAction` is handed the form
 * data and nothing else.
 */
export async function deleteTenderCategoryAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!id) return;

  let refused = false;

  try {
    await deleteTenderCategory(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/admin/login");
    refused = true;
  }

  if (refused) redirect(`/admin/tenders/categories/${id}?done=not-deleted`);

  refresh();
  redirect("/admin/tenders/categories?done=category-deleted");
}
