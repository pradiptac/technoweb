"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { bulkSeoAi, getSeoRecord, setSitemapInclude } from "@/lib/admin";
import type { SeoAiActionKey } from "@/types/api";
import type { SeoRow } from "@/types/api";
import { BULK_AI_PER_TYPE } from "./bulk-ai-limit";

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

export type BulkAiState = { ok: true; queued: number; skippedPending: number; skippedCap: number; delivering: boolean } | { ok: false; error: string };

/**
 * Draft, with the assistant, for every record on the screen.
 *
 * The form carries the rows the editor is looking at as `type:id` pairs —
 * the overview mixes types, and the API keys a bulk run on one, so this
 * groups them and makes one request per type — and the action to run.
 * Nothing is suggested when this returns: the jobs are on the queue, and
 * the suggestions land on each record's SEO panel as the scheduler drains
 * it, where the editor accepts or rejects them one by one. `?ai=pending` on
 * the overview is the list of what is waiting.
 */
export async function bulkAiAction(_prev: BulkAiState | null, formData: FormData): Promise<BulkAiState> {
  const action = String(formData.get("action") ?? "") as SeoAiActionKey;
  const byType = new Map<string, number[]>();
  for (const raw of formData.getAll("ids")) {
    const [type, id] = String(raw).split(":");
    const n = Number(id);
    if (!type || !Number.isInteger(n) || n <= 0) continue;
    byType.set(type, [...(byType.get(type) ?? []), n]);
  }

  if (!action || byType.size === 0) return { ok: false, error: "Nothing to draft for." };

  const total = { queued: 0, skippedPending: 0, skippedCap: 0, delivering: true };
  try {
    for (const [type, ids] of byType) {
      const res = await bulkSeoAi(action, type, ids.slice(0, BULK_AI_PER_TYPE));
      total.queued += res.queued;
      total.skippedPending += res.skipped_pending;
      total.skippedCap += res.skipped_cap;
      total.delivering = total.delivering && res.delivering;
    }
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/admin/login");
      if (error.status === 403) return { ok: false, error: "Your account cannot run the assistant." };
      const first = Object.values(error.errors ?? {}).flat()[0];
      return { ok: false, error: typeof first === "string" ? first : error.message };
    }
    return { ok: false, error: "The assistant could not be reached." };
  }

  revalidatePath("/admin/seo");
  return { ok: true, ...total };
}
