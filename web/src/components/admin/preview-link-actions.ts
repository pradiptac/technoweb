"use server";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { createPreviewLink, revokePreviewLink } from "@/lib/admin";
import type { PreviewLink, PreviewType } from "@/types/api";

/**
 * What the share-preview dialog shows after a press. `link` is the record's
 * link *now* — a new one, or `null` once revoked — so the dialog can draw it
 * without a re-render of the page behind it.
 *
 * **No `revalidatePath`, deliberately.** The dialog sits on an edit screen
 * that may hold a half-written form; revalidating would re-render the record
 * server-side and throw away what the editor has typed — the reason
 * `recheckAction` (the SEO overview) gives, and a far worse outcome than a
 * stale view count. Nothing here changes the record.
 */
export type PreviewLinkState = { link?: PreviewLink | null; error?: string };

const TYPES: readonly PreviewType[] = [
  "page", "blog_post", "knowledge_article", "case_study", "solution", "service",
  "product", "store_product", "event", "job_opening", "entry", "landing_page",
];

export async function previewLinkAction(_prev: PreviewLinkState, formData: FormData): Promise<PreviewLinkState> {
  const type = String(formData.get("type") ?? "") as PreviewType;
  const id = Number(formData.get("id"));
  const intent = String(formData.get("intent") ?? "create");

  if (!TYPES.includes(type) || !Number.isInteger(id) || id < 1) {
    return { error: "That record could not be identified. Reload the page and try again." };
  }

  try {
    if (intent === "revoke") {
      const linkId = Number(formData.get("link_id"));
      if (Number.isInteger(linkId) && linkId > 0) await revokePreviewLink(linkId);
      return { link: null };
    }

    return { link: await createPreviewLink({ type, id, days: Number(formData.get("days")) || 7 }) };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/admin/login");
      // Already gone (revoked from another tab) is the outcome that was asked for.
      if (error.status === 404 && intent === "revoke") return { link: null };
      if (error.status === 403) return { error: "Your account cannot share this kind of record." };
      if (error.status === 422) {
        return { error: error.errors?.id?.[0] ?? error.errors?.days?.[0] ?? error.message };
      }
      if (error.status === 429) return { error: "Too many requests in a short time. Wait a minute and try again." };
    }
    return { error: "We could not do that. Try again shortly." };
  }
}
