import "server-only";
import { publicApi } from "@/lib/api";
import { getSiteSettings } from "@/lib/settings";
import type { HomeData } from "@/themes/contract";

/**
 * Everything the homepage is drawn from, in one round.
 *
 * Lifted out of `(marketing)/page.tsx` on 2026-09-16 so a theme's `Home`
 * template — and the preview route drawing it — reads the same ten results
 * the page does. The notes are the page's:
 *
 * The homepage reads the same records as the rest of the site. It used to
 * render five sections from a static file, which meant renaming a solution
 * or publishing a post changed every page except the one people land on
 * first. These are the same ISR-cached endpoints the index pages use, and
 * Next dedupes them within a render.
 *
 * A failure here is fatal during `next build` and graceful at runtime — see
 * lib/build-phase.ts. That is deliberate: an empty homepage baked into static
 * HTML is worse than a failed deploy.
 */
export async function loadHome(): Promise<HomeData> {
  const [settings, solutions, categories, industries, caseStudies, posts, brands, clients, certifications, heroSlider] = await Promise.all([
    getSiteSettings(),
    publicApi.solutions(),
    publicApi.productCategories(),
    publicApi.industries(),
    publicApi.caseStudies(),
    publicApi.posts(),
    publicApi.brands(),
    // Both answer 200 with an empty list on a fresh install, and both
    // sections render nothing for one — so they can sit in the required set.
    publicApi.clients(),
    publicApi.certifications(),
    // In the same round as the rest, and caught on its own: every other
    // fetch here is required and its failure should fail the build, but a
    // hero carousel that has not been set up yet is the normal state of a
    // fresh install. The hero falls back to the NOC panel when this is null.
    // It used to be awaited *after* the others, which put the LCP element's
    // data a full round trip behind everything else on the page.
    publicApi.slider("homepage-hero").then((r) => r.data).catch(() => null),
  ]);

  return { settings, solutions, categories, industries, caseStudies, posts, brands, clients, certifications, heroSlider };
}
