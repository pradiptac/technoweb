import "server-only";
import { apiFetch, ApiError } from "@/lib/api";
import { token } from "./_shared";
import type { AnswerBlockKindOption, ReadinessScore, SeoRow } from "@/types/api";

/**
 * AEO + GEO (`docs/aeo-geo-contract.md`): the two reads the AEO tab needs
 * that no entity module already makes.
 */

/**
 * The answer-block kinds, from one admin index's `meta.answer_block_kinds`.
 *
 * Every admin index of an entity that carries blocks sends the same list,
 * and the edit page asks *its own* index for it — `/admin/solutions` from the
 * solution form, `/admin/store/products` from the store product form — so a
 * store manager who cannot read `/admin/solutions` still gets the list. One
 * row is enough; the meta is what is wanted.
 *
 * An API that has not learnt the feature answers no `meta.answer_block_kinds`
 * and this returns `[]`, which the repeater says on the screen. Any other
 * failure is also `[]`: a form that cannot open because a select's options
 * could not be fetched is worse than a select with no options and a note.
 */
export async function getAnswerBlockKinds(indexPath: string): Promise<AnswerBlockKindOption[]> {
  try {
    const sep = indexPath.includes("?") ? "&" : "?";
    const res = await apiFetch<{ meta?: { answer_block_kinds?: AnswerBlockKindOption[] } }>(
      `${indexPath}${sep}per_page=1`,
      { token: await token() },
    );

    return Array.isArray(res.meta?.answer_block_kinds) ? res.meta.answer_block_kinds : [];
  } catch {
    return [];
  }
}

export type RecordReadiness = {
  aeo: ReadinessScore | null;
  geo: ReadinessScore | null;
  /** True when the SEO overview has no such record — a brand, say, which carries no `HasSeo`. */
  unscored: boolean;
};

/**
 * One record's AEO and GEO readiness, from the same single-record read the
 * overview's Recheck uses (`GET /admin/seo/{type}/{id}`), which is where the
 * two scores travel with their `failed` checks.
 *
 * Null for either score the API did not send — before the API lands them,
 * every record — and `unscored` for a record type the overview does not
 * list at all, which is a 404 there. Both are drawn as "Not scored yet",
 * never as zero.
 */
export async function getSeoRecordScores(type: string, id: number): Promise<RecordReadiness> {
  try {
    const res = await apiFetch<{ data: SeoRow }>(
      `/admin/seo/${encodeURIComponent(type)}/${id}`,
      { token: await token() },
    );

    return { aeo: res.data.aeo ?? null, geo: res.data.geo ?? null, unscored: false };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return { aeo: null, geo: null, unscored: true };
    }
    throw error;
  }
}
