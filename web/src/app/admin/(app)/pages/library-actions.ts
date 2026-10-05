"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { createSavedSection, deleteSavedSection, getSavedSection, updateSavedSection, type SavedSectionPayload } from "@/lib/admin";
import type { StoredSection } from "@/types/api";

/**
 * The section library's writes (0.106.0, docs/page-builder.md "The
 * library"). Each answers `{ok}` or a sentence and the API's field errors,
 * because the builder calls them from buttons rather than from a `<Form>`.
 *
 * A change to a library section purges **every** page (`updateTag("pages")`):
 * nothing records which pages place it linked short of reading them all, and
 * the tag is the one every public page fetch carries — the same purge a page
 * save makes, for a write that can reach any page.
 */
export type LibraryResult = { ok: boolean; id?: number; error?: string; fieldErrors?: Record<string, string[]> };

function fail(error: unknown): LibraryResult {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { ok: false, error: "Your account cannot edit the section library." };
    if (error.status === 422) return { ok: false, error: error.message || "Check the highlighted fields.", fieldErrors: error.errors };
  }
  return { ok: false, error: "We could not reach the library. Try again shortly." };
}

export async function saveToLibraryAction(payload: SavedSectionPayload): Promise<LibraryResult> {
  try {
    const item = await createSavedSection(payload);
    revalidatePath("/admin/pages/library");
    return { ok: true, id: item.id };
  } catch (error) {
    return fail(error);
  }
}

export async function updateLibraryAction(id: number, payload: SavedSectionPayload): Promise<LibraryResult> {
  try {
    await updateSavedSection(id, payload);
    updateTag("pages");
    revalidatePath("/admin/pages/library");
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteLibraryAction(id: number): Promise<LibraryResult> {
  try {
    await deleteSavedSection(id);
    revalidatePath("/admin/pages/library");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/** A library item's sections, for "place a copy", a template or "make a copy here". */
export async function libraryBlocksAction(id: number): Promise<StoredSection[] | null> {
  try {
    return (await getSavedSection(id)).blocks ?? [];
  } catch {
    return null;
  }
}
