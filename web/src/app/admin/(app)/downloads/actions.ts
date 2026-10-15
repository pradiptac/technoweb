"use server";

import { runBulkAction } from "@/lib/admin/bulk";
import type { BulkState } from "@/types/bulk";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";

import { ApiError } from "@/lib/api";
import {
  createDownload, createDownloadCategory, deleteDownload, deleteDownloadCategory,
  updateDownload, updateDownloadCategory,
  type DownloadCategoryPayload, type DownloadPayload,
} from "@/lib/admin";

export type DownloadState = { error?: string; fieldErrors?: Record<string, string[]> };

/*
 * What a change to the centre can be on. `downloads` is the centre's own
 * list; a product's page carries its downloads; a builder's downloads
 * section reading the centre can sit on a page or in the body area of any
 * record that takes sections (the list `library-actions.ts` keeps for the
 * section library); and a footer's "Downloads" link appears with the first
 * published file, so the menus go too. A wide purge for a save that is rare
 * — the alternative is a page that offers a file deleted an hour ago.
 */
const SHOWS_DOWNLOADS = [
  "downloads", "menus",
  "pages", "solutions", "services", "industries", "case-studies",
  "blog", "kb", "products", "store-products", "events", "careers", "entries",
] as const;

function refresh(id?: number): void {
  SHOWS_DOWNLOADS.forEach((tag) => updateTag(tag));
  revalidatePath("/admin/downloads");
  if (id) revalidatePath(`/admin/downloads/${id}`);
}

const str = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const ids = (formData: FormData, key: string) =>
  formData.getAll(key).map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);

/** The form as JSON — the path a save takes when it carries no file. */
function payload(formData: FormData): DownloadPayload {
  const source = str(formData, "source") || "library";

  return {
    title: str(formData, "title"),
    summary: str(formData, "summary") || null,
    download_category_id: Number(str(formData, "download_category_id")) || null,
    version: str(formData, "version") || null,
    // A blank date field is "unknown", not the epoch.
    released_on: str(formData, "released_on") || null,
    access: str(formData, "access") || "public",
    source,
    // Only a library download has a path; an upload's file is its own.
    ...(source === "library" ? { file_path: str(formData, "file_path") || null } : {}),
    status: str(formData, "status") || "draft",
    sort_order: Number(str(formData, "sort_order")) || 0,
    product_ids: ids(formData, "product_ids"),
    // Absent when the form drew no shop picker, so a save leaves them alone.
    ...(formData.has("store_products_sent") ? { store_product_ids: ids(formData, "store_product_ids") } : {}),
  };
}

function fail(error: unknown, noun = "download"): DownloadState {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
    if (error.status === 403) return { error: `Your account cannot edit ${noun}s.` };
    if (error.status === 404) return { error: `That ${noun} no longer exists.` };
  }

  return { error: `We could not save the ${noun}. Try again shortly.` };
}

export async function createDownloadAction(_prev: DownloadState, formData: FormData): Promise<DownloadState> {
  let id: number;
  let needsFile: boolean;

  try {
    const row = await createDownload(payload(formData));
    id = row.id;
    needsFile = !row.has_file;
  } catch (error) {
    return fail(error);
  }

  refresh();
  // Outside the try: `redirect()` throws, and a catch would swallow it.
  redirect(`/admin/downloads/${id}?${needsFile ? "tab=file&" : ""}done=${needsFile ? "download-needs-file" : "download-created"}`);
}

export async function updateDownloadAction(id: number, _prev: DownloadState, formData: FormData): Promise<DownloadState> {
  try {
    await updateDownload(id, payload(formData));
  } catch (error) {
    return fail(error);
  }

  refresh(id);
  redirect(`/admin/downloads/${id}?done=download-saved`);
}

/**
 * After a save that went up with a file. That request is the browser's own,
 * to a route handler, and a route handler cannot `updateTag` — so the form
 * calls this once the API has answered, and then moves on.
 */
export async function downloadUploadedAction(id: number): Promise<void> {
  refresh(id);
}

export async function deleteDownloadAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  let deleted = false;

  if (Number.isInteger(id) && id > 0) {
    // Purged only once the API accepted it: a refusal must not report "deleted".
    deleted = await deleteDownload(id).then(() => true).catch(() => false);
    if (deleted) refresh();
  }

  redirect(`/admin/downloads?done=${deleted ? "download-deleted" : "not-deleted"}`);
}

/* ---- Categories ---- */

function categoryPayload(formData: FormData): DownloadCategoryPayload {
  return {
    name: str(formData, "name"),
    slug: str(formData, "slug") || null,
    description: str(formData, "description") || null,
    sort_order: Number(str(formData, "sort_order")) || 0,
    is_active: formData.get("is_active") === "1",
  };
}

export async function createDownloadCategoryAction(_prev: DownloadState, formData: FormData): Promise<DownloadState> {
  try {
    await createDownloadCategory(categoryPayload(formData));
  } catch (error) {
    return fail(error, "category");
  }

  refresh();
  revalidatePath("/admin/downloads/categories");
  redirect("/admin/downloads/categories?done=download-category-created");
}

export async function updateDownloadCategoryAction(id: number, _prev: DownloadState, formData: FormData): Promise<DownloadState> {
  try {
    await updateDownloadCategory(id, categoryPayload(formData));
  } catch (error) {
    return fail(error, "category");
  }

  refresh();
  revalidatePath("/admin/downloads/categories");
  redirect("/admin/downloads/categories?done=download-category-saved");
}

export async function deleteDownloadCategoryAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  let deleted = false;

  if (Number.isInteger(id) && id > 0) {
    deleted = await deleteDownloadCategory(id).then(() => true).catch(() => false);
    if (deleted) {
      refresh();
      revalidatePath("/admin/downloads/categories");
    }
  }

  redirect(`/admin/downloads/categories?done=${deleted ? "download-category-deleted" : "not-deleted"}`);
}

/** The ticked rows of the list: publish, draft, archive or delete — see `lib/admin/bulk.ts`. */
export async function bulkDownloadsAction(_prev: BulkState, formData: FormData): Promise<BulkState> {
  return runBulkAction(formData, {
    path: "downloads",
    noun: ["download", "downloads"],
    tags: [...SHOWS_DOWNLOADS],
    paths: ["/admin/downloads"],
  });
}
