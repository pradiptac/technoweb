import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { RecordSections, laidOutAsSections } from "@/components/page-sections/record-sections";
import { ProseWithShortcodes } from "@/components/ui/prose-with-shortcodes";
import { AnswerBlocks } from "@/components/content/answer-blocks";
import { CustomFieldDetails } from "@/components/content/custom-field-details";
import { RelatedEntities } from "@/components/content/related-entities";
import { ApiError, publicApi } from "@/lib/api";
import { JsonLd, buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { Industry } from "@/types/api";
import { IndustryHero, IndustrySolutions } from "@/components/detail-template/industry-parts";
import { IndustryTemplate } from "@/components/detail-template/industry-template";

async function load(slug: string): Promise<Industry | null> {
  try {
    return (await publicApi.industry(slug)).data;
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

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const industry = await load(slug);

  if (!industry) return buildMetadata({ title: "Not found", path: `/industries/${slug}`, seo: noIndex });

  return buildMetadata({
    title: `IT infrastructure for ${industry.name}`,
    description: industry.summary,
    path: `/industries/${industry.slug}`,
    seo: industry.seo,
  });
}

export default async function IndustryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const industry = await load(slug);

  if (!industry) notFound();

  // An active detail template lays the page out (0.161.0, docs/page-builder.md "Detail templates"); with none, the page below is unchanged.
  if (industry.detail_template) return <IndustryTemplate industry={industry} />;

  const crumbs = [
    { name: "Industries", path: "/industries" },
    { name: industry.name, path: `/industries/${industry.slug}` },
  ];
  // The body laid out as builder sections (0.129.0): full-width bands under
  // the heading, in place of the written body; the rest of the page is as it was.
  const laidOut = laidOutAsSections(industry);

  return (
    <>
      <IndustryHero industry={industry} crumbs={crumbs} />

      {laidOut && <RecordSections sections={industry.sections ?? []} crumbs={crumbs} />}

      <Container data-aos="fade-up" className="section-y">
        {!laidOut && industry.body && <ProseWithShortcodes html={industry.body} className="mb-14" />}

        {/* The answer blocks and FAQs, then what the record is connected to — before the solutions grid. */}
        {/* Custom fields in "details" groups (docs/custom-content.md): nothing when there are none. */}
        <CustomFieldDetails fields={industry.custom_fields} className="mb-14" />
        <AnswerBlocks blocks={industry.answer_blocks} faqs={industry.faqs ?? []} className="mb-14" />
        <RelatedEntities entity={industry.entity} className="mb-14" />

        <IndustrySolutions industry={industry} />
      </Container>

      <CtaBand />

      {/* The FAQPage over the FAQs and question blocks — the API's, absent under two entries, and the only one on the page. */}
      {industry.faq_schema && <JsonLd data={industry.faq_schema} />}
    </>
  );
}
