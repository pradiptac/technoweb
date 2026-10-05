import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { ProseWithShortcodes } from "@/components/ui/prose-with-shortcodes";
import { AnswerBlocks } from "@/components/content/answer-blocks";
import { CustomFieldDetails } from "@/components/content/custom-field-details";
import { RelatedEntities } from "@/components/content/related-entities";
import { CtaBand } from "@/components/ui/cta-band";
import { PageSections, startsWithHero } from "@/components/page-sections/page-sections";
import { ApiError, publicApi } from "@/lib/api";
import { JsonLd, buildMetadata, listingMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { CmsPage } from "@/types/api";
import { ContentArchive } from "@/components/content/content-archive";
import { loadArchive } from "./archive";

/**
 * CMS-managed standalone pages — privacy, terms, downloads and anything else
 * an editor adds later.
 *
 * A catch-all on a single top-level segment. Next resolves static segments
 * before dynamic ones, so this can never shadow /solutions, /products or any
 * other real route; it only ever sees paths nothing else claimed. An unknown
 * slug still 404s, exactly as it did before this route existed.
 */
async function load(slug: string): Promise<CmsPage | null> {
  try {
    const res = await publicApi.page(slug);
    return res.data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

type SearchParams = Promise<Record<string, string | undefined>>;

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const page = await load(slug);

  if (!page) {
    // A custom content type's archive, when no page answers (./archive.ts).
    const sp = await searchParams;
    const archive = await loadArchive(slug, sp.page);
    if (archive) {
      return listingMetadata({ title: archive.type.plural, description: archive.type.description, path: archive.type.path, searchParams: sp });
    }
    return buildMetadata({ title: "Not found", path: `/${slug}`, seo: noIndex });
  }

  return buildMetadata({ title: page.title, path: `/${slug}`, seo: page.seo });
}

export default async function CmsPageRoute({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const page = await load(slug);

  if (!page) {
    // A custom content type's archive, when no page answers (./archive.ts).
    const archive = await loadArchive(slug, (await searchParams).page);
    if (archive) return <ContentArchive type={archive.type} entries={archive.entries} />;
    notFound();
  }

  // A builder page (2026-09-26, docs/page-builder.md) renders its sections
  // instead of the body. Its own branch, so the default and wide templates
  // below are untouched.
  if (page.template === "builder") return <BuilderPage page={page} slug={slug} />;

  const updated = new Intl.DateTimeFormat("en-IN", {
    day: "numeric", month: "long", year: "numeric",
  }).format(new Date(page.updated_at));

  return (
    <>
      <PageHero
        title={page.title}
        // Home is not passed: `Breadcrumbs` prepends it. Passing it here too
        // rendered it twice on every CMS page, collided `key={c.path}` on "/"
        // — a React duplicate-key error on each of them — and put Home into the
        // BreadcrumbList structured data twice, which is what Google reads.
        crumbs={[{ name: page.title, path: `/${slug}` }]}
      />

      {/*
        Two templates, and until 2026-09-16 the difference was the measure:
        `default` capped the body at 72ch and `wide` dropped it for a page
        built around embedded media. The client asked for every page's copy
        to run to the container, so both render at the same width now; the
        value stays allowlisted and stored, so a template that later means
        something else again has the column to hang it on.
      */}
      <Container className="section-y" data-aos="fade-up">
        <div data-template={page.template}>
          {page.body ? <ProseWithShortcodes html={page.body} /> : null}

          {/* Custom fields in "details" groups (docs/custom-content.md): nothing when there are none. */}
          <CustomFieldDetails fields={page.custom_fields} className="mt-12" />

          {/* The answer blocks with the FAQs merged into their questions, then what the page is connected to. */}
          <AnswerBlocks blocks={page.answer_blocks} faqs={page.faqs ?? []} className="mt-12" />
          <RelatedEntities entity={page.entity} className="mt-12" />

          <p className="mt-12 border-t border-line pt-5 text-13 text-muted">
            Last updated {updated}.
          </p>
        </div>
      </Container>

      <CtaBand />

      {/* The FAQPage over the FAQs and question blocks — the API's, absent under two entries, and the only one on the page. */}
      {page.faq_schema && <JsonLd data={page.faq_schema} />}
    </>
  );
}

/**
 * A builder page: `PageHero` only when the first section is not a hero —
 * a hero that opens the page is its `h1` and draws the breadcrumb trail, so
 * there is exactly one of each either way — then the sections, then the
 * page's answer blocks and connections, then the closing band unless a
 * section already closes the page with a CTA of its own. The page's FAQs
 * are drawn by the answer blocks unless a `faq` section already shows them.
 */
function BuilderPage({ page, slug }: { page: CmsPage; slug: string }) {
  const sections = page.sections ?? [];
  const crumbs = [{ name: page.title, path: `/${slug}` }];
  const showsPageFaqs = sections.some((s) => s.type === "faq" && s.data.source === "page");
  const closesItself = sections.some((s) => s.type === "cta" || (s.type === "content_block" && s.data.block.type === "cta"));

  return (
    <>
      {!startsWithHero(sections) && <PageHero title={page.title} crumbs={crumbs} />}

      <PageSections sections={sections} crumbs={crumbs} />

      <Container className="pb-16 empty:hidden" data-aos="fade-up">
        <AnswerBlocks blocks={page.answer_blocks} faqs={showsPageFaqs ? [] : page.faqs ?? []} className="mt-12" />
        <RelatedEntities entity={page.entity} className="mt-12" />
      </Container>

      {!closesItself && <CtaBand />}

      {page.faq_schema && <JsonLd data={page.faq_schema} />}
    </>
  );
}
