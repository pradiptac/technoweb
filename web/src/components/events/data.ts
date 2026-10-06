/**
 * The two event listings every page asks for, as the exact query strings.
 *
 * Constants rather than a string typed at each call site because the query
 * is the data cache's key: the index, an event's "other upcoming events"
 * strip, the sitemap's first page and `llms.txt` all want the upcoming list,
 * and four spellings of one question would be four cached copies of one
 * answer, each going stale on its own. Fifty is the API's ceiling for
 * `per_page` (docs/events-contract.md) and far more than a company has
 * coming up at once.
 *
 * No directive: the pages, the sitemap and `lib/llms.ts` import it.
 */
export const UPCOMING_EVENTS = "?when=upcoming&per_page=50";

/** The latest six that have finished, newest first. */
export const PAST_EVENTS = "?when=past&per_page=6";

/**
 * Whether a string can be an event's slug, before it is put in a URL.
 *
 * Deliberately loose about characters — an editor may type a slug, and the
 * API does not hold it to `[a-z0-9-]` — and strict about the two things that
 * would change which endpoint is asked: a slash, and a segment of dots
 * (`..` is normalised away by `fetch`, and `/events/..` is the API's index).
 * The callers `encodeURIComponent` what passes.
 */
export function isEventSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= 200 && !/[\/\\\s]/.test(slug) && !/^\.+$/.test(slug);
}

/** A registration's token: 64 hex characters, as the API mints it. */
export function isRegistrationToken(token: string): boolean {
  return /^[a-f0-9]{64}$/.test(token);
}

/** Where the website serves an event's `.ics` — a route handler, never a page. */
export function calendarHref(slug: string): string {
  return `/api/events/${encodeURIComponent(slug)}/calendar`;
}
