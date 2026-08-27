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
