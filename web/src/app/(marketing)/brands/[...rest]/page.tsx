import { notFound } from "next/navigation";
import { LandingPageView } from "@/components/landing/landing-page-view";
import { ApiError, publicApi } from "@/lib/api";
import { JsonLd, buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { LandingPage } from "@/types/api";

/**
 * Every page under /brands, resolved by its full path in one lookup.
 *
 * A catch-all rather than `[brand]/[category]`, because the second segment is
 * sometimes a product category and sometimes a solution and their slugs live in
 * different namespaces — `/products/[slug]` already carries the cost of trying
 * one endpoint and then another, and this deliberately does not repeat it. The
 * database owns the whole path, so there is exactly one query and nothing to
 * disambiguate.
 *
 * An unpublished page 404s here because the API never returns one. That is the
 * premise of the module rather than an oversight: a draft has not passed the
 * quality gate, and something answering 200 gets linked and crawled whatever
 * its meta tags say.
 */
async function load(rest: string[]): Promise<LandingPage | null> {
  try {
    return (await publicApi.landingPage(`/brands/${rest.join("/")}`)).data;
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
  const path = `/brands/${rest.join("/")}`;

  if (!page) return buildMetadata({ title: "Not found", path, seo: noIndex });

  return buildMetadata({ title: page.title, path, seo: page.seo });
}

export default async function BrandLandingPage({ params }: { params: Promise<{ rest: string[] }> }) {
  const { rest } = await params;
  const page = await load(rest);

  if (!page) notFound();

  const crumbs = [
    { name: "Brands", path: "/brands" },
    ...(rest.length > 1 && page.brand
      ? [{ name: page.brand.name, path: `/brands/${page.brand.slug}` }]
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
