import type { TenderState } from "@/types/tenders";

/*
 * The query strings and the small shared facts of the tenders module
 * (0.174.0, `docs/tenders.md`).
 *
 * The query strings are constants because **the query is the data cache's
 * key**: two callers asking for the same list with the parameters in a
 * different order are two cache entries for one answer, which is the bug
 * `components/events/data.ts` was written to prevent.
 */

/** What the index and the sitemap ask for: open ones, closing soonest. */
export const OPEN_TENDERS = "?when=open&per_page=24";

/** The archive — closed notices, most recently closed first. */
export const CLOSED_TENDERS = "?when=closed&per_page=12";

/** A few for a strip on another page. */
export const TENDER_STRIP = "?when=open&per_page=3";

/**
 * Whether a string could be a tender's slug.
 *
 * Checked before the API is asked, so a crawler's junk URL is a 404 here
 * rather than a round trip — and so the state route handler refuses one
 * before it reaches the API's throttle.
 */
export function isTenderSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 200;
}

/**
 * The tone a state is drawn in.
 *
 * Token names, never colours: the chip has to read in both schemes, and the
 * audit grades what is painted.
 */
export const STATE_TONE: Record<TenderState, "ok" | "warn" | "info" | "muted"> = {
  open: "ok",
  closing_soon: "warn",
  upcoming: "info",
  closed: "muted",
};
