import type { ContentBlock } from "@/types/api";
import "server-only";
import { publicApi } from "@/lib/api";
import { isPortablePrerender } from "@/lib/build-phase";
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
  try {
    return await fetchHome();
  } catch (error) {
    if (isPortablePrerender) return emptyHome();
    throw error;
  }
}

/** The homepage with nothing in it — a portable build's placeholder (lib/build-phase.ts). */
function emptyHome(): HomeData {
  const none = { data: [] };

  return {
    settings: {},
    solutions: none,
    categories: none,
    industries: none,
    services: none,
    serviceCategories: none,
    caseStudies: none,
    posts: none,
    brands: none,
    clients: none,
    certifications: none,
    heroSlider: null,
    blocks: { stats: null, pricing: null, stack: null },
  } as unknown as HomeData;
}

async function fetchHome(): Promise<HomeData> {
  const [settings, solutions, categories, industries, services, serviceCategories, caseStudies, posts, brands, clients, certifications, heroSlider] = await Promise.all([
    getSiteSettings(),
    publicApi.solutions(),
    publicApi.productCategories(),
    publicApi.industries(),
    publicApi.services(),
    // Caught on its own: without categories the services are one untabbed
    // grid, which is a page worth serving — an API that predates the
    // categories must not fail the homepage, or the build.
    publicApi.serviceCategories().catch(() => ({ data: [] })),
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

  /*
    The homepage's block sections (2026-09-24), chosen by slug in the
    `homepage` settings. A second round, but only for what is chosen, each
    cached like any block and each caught on its own: a draft, a deleted
    block or one of the wrong kind is simply not drawn, never a failed page.
  */
  const block = async (slug: string | undefined, type: ContentBlock["type"]) => {
    if (!slug) return null;
    const found = await publicApi.block(slug).then((r) => r.data).catch(() => null);
    return found && found.type === type ? found : null;
  };
  const [stats, pricing, stack] = await Promise.all([
    block(settings.home_stats_block, "stats"),
    block(settings.home_pricing_block, "pricing"),
    block(settings.home_stack_block, "stack"),
  ]);

  return { settings, solutions, categories, industries, services, serviceCategories, caseStudies, posts, brands, clients, certifications, heroSlider, blocks: { stats, pricing, stack } };
}
