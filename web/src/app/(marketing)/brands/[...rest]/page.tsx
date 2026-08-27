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
