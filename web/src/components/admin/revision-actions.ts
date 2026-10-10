"use server";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { getRevision } from "@/lib/admin";
import { previewSectionsAction } from "@/app/admin/(app)/pages/builder/preview-action";
import type { StoredSection } from "@/types/api";
import type { RevisionDetail } from "@/types/revisions";

/**
 * What the history dialog asks of the server. Neither action writes anything,
 * and neither revalidates: the dialog sits on an edit screen that may hold a
 * half-written form, which a re-render would throw away.
 */

export type RevisionReadResult =
  | { ok: true; revision: RevisionDetail["data"] }
  | { ok: false; error: string };

async function read(id: number): Promise<RevisionReadResult> {
  if (!Number.isInteger(id) || id < 1) return { ok: false, error: "That version could not be identified." };

  try {
    return { ok: true, revision: (await getRevision(id)).data };
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
 * version with sections sends them; a written body (a default or wide page, or
 * a builder page with nothing laid out yet) goes as one text section, which
 * draws as the body does and passes the same sanitising a save would.
 */
export async function previewRevisionAction(id: number, pageId: number | null): Promise<RevisionPreviewResult> {
  const got = await read(id);
  if (!got.ok) return got;

  const { snapshot } = got.revision;
  const sections = Array.isArray(snapshot.blocks) ? snapshot.blocks : [];
  const body = (snapshot.body ?? "").trim();

  let blocks: StoredSection[];
  if (sections.length > 0 && (snapshot.template === "builder" || got.revision.type === "saved_section")) {
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
