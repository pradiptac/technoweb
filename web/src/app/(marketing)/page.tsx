import { Hero } from "@/components/home/hero";
import {
  CaseStudies, FinalCta, Industries, Partners, ProductCategories,
  Resources, Solutions, SupportBand, WebServices, WhyUs,
} from "@/components/home/sections";
import { publicApi } from "@/lib/api";
import { getSiteSettings } from "@/lib/settings";
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
  const [settings, solutions, categories, industries, caseStudies, posts] = await Promise.all([
    getSiteSettings(),
    publicApi.solutions(),
    publicApi.productCategories(),
    publicApi.industries(),
    publicApi.caseStudies(),
    publicApi.posts(),
  ]);

  return (
    <>
      <Hero settings={settings} />
      <Partners />
      {/* Six is what the grid was designed around; the index pages list them all. */}
      <Solutions items={solutions.data.slice(0, 6)} />
      <ProductCategories items={categories.data.slice(0, 9)} />
      <WhyUs />
      <Industries items={industries.data.slice(0, 6)} />
      <WebServices />
      <SupportBand />
      <CaseStudies items={caseStudies.data.slice(0, 3)} />
      <Resources items={posts.data.slice(0, 4)} />
      <FinalCta />
    </>
  );
}
