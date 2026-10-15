import Image from "next/image";
import { blurProps } from "@/lib/blur";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { RecordSections, hasEntityLinks, laidOutAsSections } from "@/components/page-sections/record-sections";
import { ProseWithShortcodes } from "@/components/ui/prose-with-shortcodes";
import { AnswerBlocks } from "@/components/content/answer-blocks";
import { CustomFieldDetails } from "@/components/content/custom-field-details";
import { RelatedEntities } from "@/components/content/related-entities";
import { ApiError, publicApi } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { JsonLd, buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { ContentEntry } from "@/types/api";

/**
 * One entry of a custom content type — `/events/launch-day`
 * (docs/custom-content.md).
 *
 * Every static route resolves before this one, so `/solutions/x` and
 * `/blog/x` never reach it; what does is `/{anything}/{anything}`, and an
 * unknown type or entry is the API's 404, cached by nothing and rendered as
 * the site's not-found page.
 */
async function load(type: string, slug: string): Promise<ContentEntry | null> {
  try {
    return (await publicApi.entry(type, slug)).data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/*
 * Empty on purpose, and the export is the feature: in Next 16 a dynamic
 * segment enters the ISR route cache only when it exports
 * `generateStaticParams` (CLAUDE.md, "Next.js: rendering, caching and
 * data"). Nothing is enumerated at build; each entry renders on its first
 * request and is served from the cache until `entries:<type>` or
 * `entry:<type>:<slug>` is invalidated. **So nothing here may read a
 * request-time API** — no `cookies()`, no `headers()`, no `searchParams` —
 * or the page is a 500 rather than a fallback.
 */
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; entry: string }> }) {
  const { slug, entry } = await params;
  const record = await load(slug, entry);

  if (!record) return buildMetadata({ title: "Not found", path: `/${slug}/${entry}`, seo: noIndex });

  return buildMetadata({
    title: record.title,
    description: record.summary,
    path: record.path,
    image: record.image,
    seo: record.seo,
  });
}

export default async function EntryPage({ params }: { params: Promise<{ slug: string; entry: string }> }) {
  const { slug, entry } = await params;
  const record = await load(slug, entry);

  if (!record) notFound();

  const type = record.type;
  const crumbs = [
    ...(type?.archive_enabled ? [{ name: type.plural, path: type.path }] : []),
    { name: record.title, path: record.path },
  ];

  // Builder sections in place of the written body (0.130.0).
  const laidOut = laidOutAsSections(record);

  const picture = record.image ? (
    <div className="relative mb-10 aspect-[1200/630] overflow-hidden rounded-lg border border-line">
      <Image
        src={record.image}
        alt={record.image_alt ?? ""}
        fill
        priority
        sizes="(min-width: 1280px) 1200px, 100vw"
        className="object-cover"
        style={record.image_focus ? { objectPosition: record.image_focus } : undefined}
        {...blurProps(record.image_blur)}
      />
    </div>
  ) : null;

  // What follows the body, whichever way it is drawn.
  const rest = (
    <>
      {/* Custom fields in "details" groups: nothing when there are none. */}
      <CustomFieldDetails fields={record.custom_fields} className="mt-12" />

      <AnswerBlocks blocks={record.answer_blocks} faqs={record.faqs ?? []} className="mt-12" />
      <RelatedEntities entity={record.entity} className="mt-12" />
    </>
  );
  const hasRest = (record.custom_fields?.length ?? 0) > 0 || (record.answer_blocks?.length ?? 0) > 0
    || (record.faqs?.length ?? 0) > 0 || hasEntityLinks(record.entity);

  return (
    <>
      <PageHero
        kicker={type?.name}
        title={record.title}
        lede={record.summary ?? undefined}
        crumbs={crumbs}
      >
        {/*
          No colour of its own: it inherits the hero's ink, which is light
          over a banner and the page's ink without one. It was `text-muted`,
          2.27:1 on a dark banner — found by the audit the first time an
          entry's page was run through it (0.130.0).
        */}
        {record.published_at && (
          <p className="text-13-5">
            <time dateTime={record.published_at}>{formatDate(record.published_at, "long")}</time>
          </p>
        )}
      </PageHero>

      {/*
        Builder sections in place of the written body (0.130.0): the picture
        stays above them, and the details, questions and related lists follow
        in a container of their own — left out when there is nothing to put
        in it. An entry on its written body is the one container it always was.
      */}
      {laidOut ? (
        <>
          {picture && <Container data-aos="fade-up" className="section-y pb-0">{picture}</Container>}
          <RecordSections sections={record.sections ?? []} crumbs={crumbs} />
          {hasRest && <Container data-aos="fade-up" className="section-y [&>*:first-child]:mt-0">{rest}</Container>}
        </>
      ) : (
        <Container data-aos="fade-up" className="section-y">
          {picture}
          {record.body ? <ProseWithShortcodes html={record.body} /> : null}
          {rest}
        </Container>
      )}

      <CtaBand />

      {record.schema && <JsonLd data={record.schema} />}
      {record.faq_schema && <JsonLd data={record.faq_schema} />}
    </>
  );
}
