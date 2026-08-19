/**
 * True while `next build` is prerendering.
 *
 * Index pages degrade gracefully when the API is unreachable at runtime — the
 * site stays up and ISR heals it on the next revalidation. At build time the
 * opposite is correct: an unreachable API must fail the deploy rather than
 * bake an error page into static HTML that Googlebot can then crawl and index.
 */
export const isPrerendering = process.env.NEXT_PHASE === "phase-production-build";
