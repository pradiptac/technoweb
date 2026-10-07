import Image from "next/image";
import { blurProps } from "@/lib/blur";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
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

  return (
    <>
      <PageHero
        kicker={type?.name}
        title={record.title}
        lede={record.summary ?? undefined}
        crumbs={crumbs}
      >
        {record.published_at && (
          <p className="text-13-5 text-muted">
            <time dateTime={record.published_at}>{formatDate(record.published_at, "long")}</time>
          </p>
        )}
      </PageHero>

      <Container data-aos="fade-up" className="section-y">
        {record.image && (
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
        )}

        {record.body ? <ProseWithShortcodes html={record.body} /> : null}

        {/* Custom fields in "details" groups: nothing when there are none. */}
        <CustomFieldDetails fields={record.custom_fields} className="mt-12" />

        <AnswerBlocks blocks={record.answer_blocks} faqs={record.faqs ?? []} className="mt-12" />
        <RelatedEntities entity={record.entity} className="mt-12" />
      </Container>

      <CtaBand />

      {record.schema && <JsonLd data={record.schema} />}
      {record.faq_schema && <JsonLd data={record.faq_schema} />}
    </>
  );
}
