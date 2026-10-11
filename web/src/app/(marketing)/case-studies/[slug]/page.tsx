import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { RecordSections, laidOutAsSections } from "@/components/page-sections/record-sections";
import { ProseWithShortcodes } from "@/components/ui/prose-with-shortcodes";
import { RelatedEntities } from "@/components/content/related-entities";
import { CustomFieldDetails } from "@/components/content/custom-field-details";
import { ApiError, publicApi } from "@/lib/api";
import { JsonLd, buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { CaseStudy } from "@/types/api";
import { CaseStudyBack, CaseStudyCover, CaseStudyHero, CaseStudyResults } from "@/components/detail-template/case-study-parts";
import { CaseStudyTemplate } from "@/components/detail-template/case-study-template";

async function load(slug: string): Promise<CaseStudy | null> {
  try {
    return (await publicApi.caseStudy(slug)).data;
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
  const study = await load(slug);

  if (!study) return buildMetadata({ title: "Not found", path: `/case-studies/${slug}`, seo: noIndex });

  return buildMetadata({
    title: `${study.title} — case study`,
    description: study.summary,
    path: `/case-studies/${study.slug}`,
    image: study.cover_image,
    type: "article",
    seo: study.seo,
    article: {
      modifiedTime: study.updated_at,
      tags: [study.industry?.name],
    },
  });
}

export default async function CaseStudyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const study = await load(slug);

  if (!study) notFound();

  // An active detail template lays the page out (0.161.0, docs/page-builder.md "Detail templates"); with none, the page below is unchanged.
  if (study.detail_template) return <CaseStudyTemplate study={study} />;

  const results = study.results ?? [];
  const crumbs = [
    { name: "Case studies", path: "/case-studies" },
    { name: study.title, path: `/case-studies/${study.slug}` },
  ];
  /*
   * The body laid out as builder sections (0.129.0, docs/page-builder.md
   * "Sections on other records"). The results and the cover stay above them
   * — they are the study's own, not its body — and what followed the body
   * follows the sections. Full-width bands cannot sit inside the container
   * the rest shares, so with sections the page is that container cut in two.
   */
  const laidOut = laidOutAsSections(study);

  return (
    <>
      <CaseStudyHero study={study} crumbs={crumbs} />

      {(!laidOut || results.length > 0 || study.cover_image) && (
      <Container data-aos="fade-up" className={laidOut ? "section-y pb-0" : "section-y"}>
        <CaseStudyResults study={study} />

        <CaseStudyCover study={study} />

        {!laidOut && <CaseStudyRest study={study} />}
      </Container>
      )}

      {laidOut && (
        <>
          <RecordSections sections={study.sections ?? []} crumbs={crumbs} />
          <Container data-aos="fade-up" className="section-y *:first:mt-0">
            <CaseStudyRest study={study} laidOut />
          </Container>
        </>
      )}

      <CtaBand
        title="Similar setup to yours?"
        body="Most of these started as an audit. If the shape of the problem looks familiar, that is the place to begin."
      />

      {/*
        Built by the API, rendered here.
        See App\Support\StructuredData — the graph used to be assembled in this
        file, which is how the blog and the case study both ended up declaring
        `dateModified: published_at` and naming the Organization as author while
        the record carried an author_id. Escaping stays in `JsonLd`, because
        JSON.stringify does not escape `<` and a CMS field containing
        `</script>` would otherwise close the block.
      */}
      {study.schema && <JsonLd data={study.schema} />}
      {study.faq_schema && <JsonLd data={study.faq_schema} />}
    </>
  );
}

/**
 * What follows the cover: the written body — unless the page is laid out as
 * sections, which stand in its place — then the details, what the study is
 * connected to, and the way back. A case study has no answer blocks of its own.
 */
function CaseStudyRest({ study, laidOut = false }: { study: CaseStudy; laidOut?: boolean }) {
  return (
    <>
      {!laidOut && study.body && <ProseWithShortcodes html={study.body} />}

      {/* Custom fields in "details" groups (docs/custom-content.md): nothing when there are none. */}
      <CustomFieldDetails fields={study.custom_fields} className="mt-12" />
      <RelatedEntities entity={study.entity} className="mt-12" />

      <CaseStudyBack />
    </>
  );
}
