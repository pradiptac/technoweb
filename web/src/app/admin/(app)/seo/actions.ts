"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { getSeoRecord, setSitemapInclude } from "@/lib/admin";
import type { SeoRow } from "@/types/api";

export type SitemapState = { error?: string };

/**
 * The only write on the SEO screen.
 *
 * Editing metadata stays on each record's own form — a second editor for the
 * same override row would be two implementations of the same rules. Sitemap
 * inclusion is different: it is a decision taken while looking at the whole
 * list, which is exactly what this screen is.
 */
export async function toggleSitemapAction(_prev: SitemapState, formData: FormData): Promise<SitemapState> {
  const type = String(formData.get("type") ?? "");
  const id = Number(formData.get("id"));
  const include = formData.get("include") === "1";

  if (!type || !id) return { error: "Missing record." };

  try {
    await setSitemapInclude(type, id, include);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/admin/login");
      if (error.status === 403) return { error: "Your account cannot change the sitemap." };
    }
    return { error: "That did not save." };
  }

  revalidatePath("/admin/seo");
  return {};
}


export type RecheckState =
  | { ok: true; record: SeoRow }
  | { ok: false; error: string; gone?: boolean };

/**
 * Re-score one record, now.
 *
 * **Deliberately not `revalidatePath`.** That would refetch the whole
 * overview — 0.9s and 73KB, because the endpoint collects every record to
 * answer the duplicate checks — and re-render all fifty rows to change one
 * number. Worse, it gives no signal about *which* row was rechecked: every
 * score on screen would blink at once. This returns the single record and the
 * row swaps its own score in, so the answer lands where the button is.
 *
 * The trade is that the rest of the page is now a moment out of date, which is
 * the correct trade for a screen whose whole workflow is "open a record in a
 * new tab, fix it, come back to this one row".
 */
export async function recheckAction(type: string, id: number): Promise<RecheckState> {
  try {
    return { ok: true, record: await getSeoRecord(type, id) };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/admin/login");
      if (error.status === 403) return { ok: false, error: "Your account cannot read the SEO overview." };
      /*
       * A record deleted in the other tab is the ordinary way to get here, and
       * it is worth its own message: "that did not work" would send somebody
       * looking for a bug in the button.
       */
      if (error.status === 404) {
        return { ok: false, gone: true, error: "That record no longer exists — it was deleted somewhere else." };
      }
    }

    return { ok: false, error: "The score could not be rechecked." };
  }
}
