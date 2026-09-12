import { Hero } from "@/components/home/hero";
import {
  CaseStudies, Credentials, FinalCta, Industries, Partners, ProductCategories,
  Resources, Solutions, SupportBand, TrustedBy, WebServices, WhyUs,
} from "@/components/home/sections";
import { publicApi } from "@/lib/api";
import { getSiteSettings } from "@/lib/settings";
import { motionFor } from "@/lib/motion-choices";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Technology infrastructure that keeps your business connected",
  description:
    "Technoware designs, deploys and supports enterprise networks, servers, storage and security infrastructure across India — backed by a real engineering support desk.",
  path: "/",
});

/**
 * The homepage reads the same records as the rest of the site.
 *
 * It used to render five sections from a static file, which meant renaming a
 * solution or publishing a post changed every page except the one people land
 * on first. These are the same ISR-cached endpoints the index pages use, and
 * Next dedupes them within a render.
 *
 * A failure here is fatal during `next build` and graceful at runtime — see
 * lib/build-phase.ts. That is deliberate: an empty homepage baked into static
 * HTML is worse than a failed deploy.
 */
export default async function HomePage() {
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

  return (
    <>
      <Hero settings={settings} slider={heroSlider} />
      <Partners items={brands.data} />
      {/* Six is what the grid was designed around; the index pages list them all. */}
      <Solutions items={solutions.data.slice(0, 6)} />
      {/* xl:grid-cols-4 — 12 is three full rows; nine left the last row one short. */}
      <ProductCategories items={categories.data.slice(0, 12)} />
      <WhyUs />
      <TrustedBy items={clients.data} />
      <Credentials items={certifications.data} />
      <Industries items={industries.data.slice(0, 6)} />
      <WebServices />
      <SupportBand />
      {/* 2xl:grid-cols-6, matching the product category grid — six is one full row. */}
      <CaseStudies items={caseStudies.data.slice(0, 6)} />
      <Resources items={posts.data.slice(0, 4)} />
      <FinalCta phone={settings.phone} backdrop={motionFor(settings).hero} />
    </>
  );
}
