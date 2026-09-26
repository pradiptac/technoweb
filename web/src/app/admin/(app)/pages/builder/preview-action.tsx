"use server";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { getToken } from "@/lib/admin-auth";
import { previewPageSections } from "@/lib/admin";
import { keepPreviewDraft } from "@/lib/admin/preview-drafts";
import type { StoredSection } from "@/types/api";

export type PreviewResult = { id?: string; error?: string; fieldErrors?: Record<string, string[]> };

/**
 * The unsaved-draft preview. The sections as typed go to
 * `POST /admin/pages/preview`, which runs the rules a save runs and presents
 * them without writing; the presented sections are kept for a few minutes
 * (`keepPreviewDraft`) and the dialog frames `/admin/draft-preview/{id}`,
 * where **the same components the public route uses** draw them under the
 * real theme. It returned the rendered JSX until 2026-09-26, which failed on
 * any section holding a client component the console page does not import —
 * `lib/admin/preview-drafts.ts` has the detail. A refusal comes back as the
 * 422's field errors, keyed `blocks.N.data.field` like a save's.
 */
export async function previewSectionsAction(json: string, pageId: number | null): Promise<PreviewResult> {
  let blocks: StoredSection[];
  try {
    const parsed = JSON.parse(json);
    blocks = Array.isArray(parsed) ? parsed : [];
  } catch {
    return { error: "The sections could not be read." };
  }

  const token = await getToken();
  if (!token) redirect("/admin/login");

  try {
    const sections = await previewPageSections(blocks, pageId);
    if (!sections.length) return { error: "Nothing to show — every section is hidden, or there are none yet." };

    return { id: keepPreviewDraft(token, sections) };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/admin/login");
      if (error.status === 422) return { error: "Some sections need attention before they can be shown.", fieldErrors: error.errors };
    }
    return { error: "The preview could not be drawn. Try again shortly." };
  }
}
