"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { createSavedSection, deleteSavedSection, getSavedSection, sectionsFromBody, updateSavedSection, type SavedSectionPayload } from "@/lib/admin";
import type { StoredSection } from "@/types/api";

/**
 * The section library's writes (0.106.0, docs/page-builder.md "The
 * library"). Each answers `{ok}` or a sentence and the API's field errors,
 * because the builder calls them from buttons rather than from a `<Form>`.
 *
 * A change to a library section purges **every** page (`updateTag("pages")`):
 * nothing records which pages place it linked short of reading them all, and
 * the tag is the one every public page fetch carries — the same purge a page
 * save makes, for a write that can reach any page. Since 0.129.0 a solution,
 * a service, an industry or a case study can place one too, so their tags go
 * with it (`PLACES_SECTIONS`).
 */
const PLACES_SECTIONS = ["pages", "solutions", "services", "industries", "case-studies"] as const;
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
    PLACES_SECTIONS.forEach((tag) => updateTag(tag));
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

/**
 * "This page's content" (0.109.0): the page's body as builder sections,
 * split at its headings by the API. Nothing is saved — the builder is seeded
 * and the page saves as any other edit.
 */
export async function sectionsFromBodyAction(body: string): Promise<{ sections?: StoredSection[]; error?: string }> {
  try {
    return { sections: await sectionsFromBody(body) };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/admin/login");
    if (error instanceof ApiError && error.status === 422) return { error: error.message || "This page has no content to lay out yet." };
    return { error: "We could not lay the page out. Try again shortly." };
  }
}
