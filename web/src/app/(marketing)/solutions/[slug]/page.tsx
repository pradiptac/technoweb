import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { AnswerBlocks } from "@/components/content/answer-blocks";
import { CustomFieldDetails } from "@/components/content/custom-field-details";
import { RelatedEntities } from "@/components/content/related-entities";
import { RecordSections, endsOnCta, hasEntityLinks, laidOutAsSections } from "@/components/page-sections/record-sections";
import { ApiError, publicApi } from "@/lib/api";
import { JsonLd, buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { cn } from "@/lib/utils";
import type { Solution } from "@/types/api";
import { SolutionBenefits, SolutionHero, SolutionRelated, SolutionWritten } from "@/components/detail-template/solution-parts";
import { SolutionTemplate } from "@/components/detail-template/solution-template";

async function load(slug: string): Promise<Solution | null> {
  try {
    return (await publicApi.solution(slug)).data;
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
  const solution = await load(slug);

  if (!solution) return buildMetadata({ title: "Not found", path: `/solutions/${slug}`, seo: noIndex });

  return buildMetadata({
    title: solution.title,
    description: solution.summary,
    path: `/solutions/${solution.slug}`,
    image: solution.hero_image,
    seo: solution.seo,
  });
}

export default async function SolutionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const solution = await load(slug);

  if (!solution) notFound();

  // An active detail template lays the page out (0.161.0, docs/page-builder.md "Detail templates"); with none, the page below is unchanged.
  if (solution.detail_template) return <SolutionTemplate solution={solution} />;

  const benefits = solution.benefits ?? [];
  const technologies = solution.technologies ?? [];
  const products = solution.products ?? [];
  const industries = solution.industries ?? [];
  const faqs = solution.faqs ?? [];
  const crumbs = [
    { name: "Solutions", path: "/solutions" },
    { name: solution.title, path: `/solutions/${solution.slug}` },
  ];

  /*
   * The body area laid out as builder sections (0.129.0, docs/page-builder.md
   * "Sections on other records"). They stand where the problem, the overview
   * and the benefits stood, as full-width bands under the heading; everything
   * else the page had is kept under them — the details, the answers and FAQs,
   * what it is related to, and the three lists that sit beside the written
   * body, which become a row since there is no column left to sit beside.
   */
  const sections = solution.sections ?? [];
  const laidOut = laidOutAsSections(solution);
  const lists = [technologies, products, industries].filter((l) => l.length > 0).length;
  const hasDetails = (solution.custom_fields?.length ?? 0) > 0 || (solution.answer_blocks?.length ?? 0) > 0
    || faqs.length > 0 || hasEntityLinks(solution.entity);

  const related = <SolutionRelated technologies={technologies} products={products} industries={industries} />;

  return (
    <>
      <SolutionHero solution={solution} crumbs={crumbs} />

      {laidOut ? (
        <>
          <RecordSections sections={sections} crumbs={crumbs} />

          {(hasDetails || lists > 0) && (
            <Container data-aos="fade-up" className="section-y">
              <div className="grid gap-12">
                <CustomFieldDetails fields={solution.custom_fields} />
                <AnswerBlocks blocks={solution.answer_blocks} faqs={faqs} />
                <RelatedEntities entity={solution.entity} />
                {lists > 0 && (
                  // As many columns as there are lists, so one or two never leave a hole in a row of three.
                  <div className={cn("grid items-start gap-5", lists >= 2 && "sm:grid-cols-2", lists >= 3 && "lg:grid-cols-3")}>
                    {related}
                  </div>
                )}
              </div>
            </Container>
          )}
        </>
      ) : (
      <Container data-aos="fade-up" className="section-y">
        <div className="grid gap-12 lg:grid-cols-[1fr_320px] lg:gap-16">
          <div className="min-w-0">
            <SolutionWritten solution={solution} />

            <SolutionBenefits benefits={benefits} className="mb-12" />

            {/*
              The answer blocks, with the FAQs merged into their questions
              group, then what the record is connected to — after the body
              and before the aside's related lists (`docs/seo.md`, "Answer
              blocks on the page").
            */}
            {/* Custom fields in "details" groups (docs/custom-content.md): nothing when there are none. */}
            <CustomFieldDetails fields={solution.custom_fields} className="mb-12" />
            <AnswerBlocks blocks={solution.answer_blocks} faqs={faqs} className="mb-12" />
            <RelatedEntities entity={solution.entity} />
          </div>

          <aside className="grid content-start gap-5">
            {related}
          </aside>
        </div>
      </Container>
      )}

      {/* Sections that end on their own call to action, with nothing under them, are the page's close. */}
      {!(laidOut && endsOnCta(sections) && !hasDetails && lists === 0) && (
        <CtaBand
          title={`Thinking about ${solution.title.toLowerCase()}?`}
          body="Start with a site visit. We will tell you what your current setup can still do, and what genuinely needs replacing."
        />
      )}

      {solution.schema && <JsonLd data={solution.schema} />}
      {/* The FAQPage over the FAQs and question blocks — the API's, absent under two entries, and the only one on the page. */}
      {solution.faq_schema && <JsonLd data={solution.faq_schema} />}
    </>
  );
}
