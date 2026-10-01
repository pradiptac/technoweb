/**
 * True while `next build` is prerendering **for one site**.
 *
 * Index pages degrade gracefully when the API is unreachable at runtime — the
 * site stays up and ISR heals it on the next revalidation. At build time the
 * opposite is correct: an unreachable API must fail the deploy rather than
 * bake an error page into static HTML that Googlebot can then crawl and index.
 *
 * **Except for a portable build** (`TW_PORTABLE_BUILD=1`, `release/build.sh`),
 * which is made once for every install and has no API to read. There the
 * index pages bake their error state on purpose, and nobody ever sees it: the
 * installer and the updater purge every page through
 * `/api/internal/revalidate` and warm them before the site is opened or the
 * maintenance window closes.
 */
export const isPrerendering =
  process.env.NEXT_PHASE === "phase-production-build" && process.env.TW_PORTABLE_BUILD !== "1";

/**
 * True while a **portable** build prerenders: there is no API at all, and a
 * page that cannot degrade by itself (the homepage) renders empty instead.
 * The empty copy never reaches a visitor — the purge that follows an install
 * or an update throws it away before the site is opened.
 */
export const isPortablePrerender =
  process.env.NEXT_PHASE === "phase-production-build" && process.env.TW_PORTABLE_BUILD === "1";
