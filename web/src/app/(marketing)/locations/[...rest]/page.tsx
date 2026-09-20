import { notFound } from "next/navigation";
import { LandingPageView } from "@/components/landing/landing-page-view";
import { ApiError, publicApi } from "@/lib/api";
import { JsonLd, buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { LandingPage } from "@/types/api";

/**
 * Every page under /locations. Same single-lookup resolution as /brands.
 *
 * These are the pages that need the module's guards most: a "<service> in
 * <city>" page is the textbook doorway pattern, and it is also a claim that
 * engineers attend sites in that city. The API will not serve one for a
 * location nobody has recorded anything about, so anything reaching this file
 * has an address, a response time or a written summary behind it.
 */
async function load(rest: string[]): Promise<LandingPage | null> {
  try {
    return (await publicApi.landingPage(`/locations/${rest.join("/")}`)).data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/*
 * Empty on purpose, and the export itself is the feature.
 *
 * In Next 16 a dynamic-segment route is entered into the ISR route cache only
 * when it exports `generateStaticParams` — without it the page is rendered on
 * every request, whatever the fetches inside it are cached as, and never
 * sends an `x-nextjs-cache` header. Every `[slug]` route in this site was in
 * that state, measured at 1.5–4.5s TTFB against a local API. Returning `[]`
 * enumerates nothing at build (the build already needs the API reachable;
 * rendering every record would slow it for no visitor) and lets each path
 * render on its first request and be served from the cache until its tags
 * are invalidated or the shortest `revalidate` among its fetches expires.
 *
 * **What it costs**: a request-time API — `cookies()`, `headers()`,
 * `searchParams` — or a `cache: "no-store"` fetch anywhere in this render is
 * no longer a silent fallback to dynamic rendering; it is a 500 ("Page changed
 * from static to dynamic at runtime"). Everything this page reads is ISR-tagged
 * through `publicApi`, and the only thing on it that touches a cookie is a
 * Server Action, which runs on submit rather than on render. Keep it that way.
 */
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ rest: string[] }> }) {
  const { rest } = await params;
  const page = await load(rest);
  const path = `/locations/${rest.join("/")}`;

  if (!page) return buildMetadata({ title: "Not found", path, seo: noIndex });

  return buildMetadata({ title: page.title, path, seo: page.seo });
}

export default async function LocationLandingPage({ params }: { params: Promise<{ rest: string[] }> }) {
  const { rest } = await params;
  const page = await load(rest);

  if (!page) notFound();

  const crumbs = [
    { name: "Where we work", path: "/locations" },
    ...(rest.length > 1 && page.location
      ? [{ name: page.location.name, path: `/locations/${page.location.slug}` }]
      : []),
    { name: page.title, path: page.path },
  ];

  /*
   * No JsonLd here. `PageHero` renders `Breadcrumbs`, which emits the
   * BreadcrumbList itself — that component exists precisely so the visible
   * trail and the structured data cannot drift. Adding a second block put two
   * BreadcrumbLists on the page, which is ambiguous rather than twice as good;
   * the audit reports the blocks it finds, and this one showed up as
   * "BreadcrumbList | BreadcrumbList".
   */
  return (
    <>
      <LandingPageView page={page} crumbs={crumbs} />
      {/*
        A CollectionPage for a catalogue page, a LocalBusiness for a place —
        the API decides which, because it is the side that knows whether a
        location has an address and which places sit under it. See
        App\Support\StructuredData.
      */}
      {page.schema && <JsonLd data={page.schema} />}
    </>
  );
}
