"use server";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { getRevision } from "@/lib/admin";
import { previewSectionsAction } from "@/app/admin/(app)/pages/builder/preview-action";
import type { StoredSection } from "@/types/api";
import type { RevisionDetail, RevisionMeta } from "@/types/revisions";

/**
 * What the history dialog asks of the server. Neither action writes anything,
 * and neither revalidates: the dialog sits on an edit screen that may hold a
 * half-written form, which a re-render would throw away.
 */

export type RevisionReadResult =
  | { ok: true; revision: RevisionDetail["data"]; meta: RevisionMeta }
  | { ok: false; error: string };

async function read(id: number): Promise<RevisionReadResult> {
  if (!Number.isInteger(id) || id < 1) return { ok: false, error: "That version could not be identified." };

  try {
    const got = await getRevision(id);
    return { ok: true, revision: got.data, meta: got.meta };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/admin/login");
      if (error.status === 403) return { ok: false, error: "You do not have permission to read this version." };
      if (error.status === 404) return { ok: false, error: "That version is no longer kept." };
    }
    return { ok: false, error: "The version could not be read. Try again shortly." };
  }
}

/** A version with its snapshot, for Restore. */
export async function readRevisionAction(id: number): Promise<RevisionReadResult> {
  return read(id);
}

export type RevisionPreviewResult = { ok: true; draft: string } | { ok: false; error: string };

/**
 * A version drawn by the public site's own sections, under the active theme.
 * It goes through the same unsaved-draft preview the Builder tab uses: a
 * version with sections sends them; a written body (a default or wide page, a
 * builder page or a record with nothing laid out yet) goes as one text
 * section, which draws as the body does and passes the same sanitising a save
 * would. Which columns are "the written body" is the API's
 * (`meta.body_columns`): `description` on a product, `overview` on a
 * solution, `intro` then `body` on a landing page. Whether the version laid
 * its page out as sections is its `template` for a page and its `body_layout`
 * for every other record.
 */
export async function previewRevisionAction(id: number, pageId: number | null): Promise<RevisionPreviewResult> {
  const got = await read(id);
  if (!got.ok) return got;

  const { snapshot } = got.revision;
  const sections = Array.isArray(snapshot.blocks) ? snapshot.blocks : [];
  const body = (got.meta.body_columns ?? ["body"])
    .map((column) => {
      const value = (snapshot as Record<string, unknown>)[column];
      return typeof value === "string" ? value.trim() : "";
    })
    .filter((part) => part !== "")
    .join("\n");
  const laidOut = got.revision.type === "saved_section"
    || (snapshot.template ? snapshot.template === "builder" : snapshot.body_layout === "sections");

  let blocks: StoredSection[];
  if (sections.length > 0 && laidOut) {
    blocks = sections;
  } else if (body !== "") {
    blocks = [{ id: crypto.randomUUID(), type: "rich_text", hidden: false, background: null, data: { body } }];
  } else {
    return { ok: false, error: "This version has no written body and no sections to draw." };
  }

  const result = await previewSectionsAction(JSON.stringify(blocks), pageId);
  if (result.id) return { ok: true, draft: result.id };

  return {
    ok: false,
    error: result.error
      ?? "This version could not be drawn.",
  };
}
