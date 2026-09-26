"use server";

import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { PageSections } from "@/components/page-sections/page-sections";
import { SectionsFrame } from "@/components/page-sections/sections-frame";
import { ApiError } from "@/lib/api";
import { previewPageSections } from "@/lib/admin";
import type { StoredSection } from "@/types/api";

export type PreviewResult = { node?: ReactNode; error?: string; fieldErrors?: Record<string, string[]> };

/**
 * The unsaved-draft preview. The sections as typed go to
 * `POST /admin/pages/preview`, which runs the rules a save runs and presents
 * them without writing; what comes back is rendered **here, by the same
 * components the public route uses**, and returned as the result — so the
 * dialog shows the real sections under the real theme rather than a second
 * implementation of them. A refusal comes back as the 422's field errors,
 * keyed `blocks.N.data.field` like a save's.
 */
export async function previewSectionsAction(json: string, pageId: number | null): Promise<PreviewResult> {
  let blocks: StoredSection[];
  try {
    const parsed = JSON.parse(json);
    blocks = Array.isArray(parsed) ? parsed : [];
  } catch {
    return { error: "The sections could not be read." };
  }

  try {
    const sections = await previewPageSections(blocks, pageId);
    if (!sections.length) return { error: "Nothing to show — every section is hidden, or there are none yet." };

    return {
      node: (
        <SectionsFrame>
          <PageSections sections={sections} crumbs={[]} ownsH1={false} />
        </SectionsFrame>
      ),
    };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/admin/login");
      if (error.status === 422) return { error: "Some sections need attention before they can be shown.", fieldErrors: error.errors };
    }
    return { error: "The preview could not be drawn. Try again shortly." };
  }
}
