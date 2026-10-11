import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { RecordSections, laidOutAsSections } from "@/components/page-sections/record-sections";
import { CtaBand } from "@/components/ui/cta-band";
import { ArticleMap, ReadingProgress } from "@/components/ui/article-map";
import { withHeadingIds } from "@/lib/headings";
import { BlogSidebar } from "@/components/blog/blog-sidebar";
import { CategoryStrip } from "@/components/blog/category-strip";
import { PostNav } from "@/components/blog/post-nav";
import { AnswerBlocks } from "@/components/content/answer-blocks";
import { CustomFieldDetails } from "@/components/content/custom-field-details";
import { RelatedEntities } from "@/components/content/related-entities";
import { ApiError, publicApi } from "@/lib/api";
import { JsonLd, buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { getSiteSettings } from "@/lib/settings";
import type { BlogPost } from "@/types/api";
import { BlogBody, BlogComments, BlogFooter, BlogHead, BlogRelatedStories, loadBlogContext } from "@/components/detail-template/blog-parts";
import { BlogTemplate } from "@/components/detail-template/blog-template";

async function load(slug: string): Promise<BlogPost | null> {
  try {
    return (await publicApi.post(slug)).data;
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
  const post = await load(slug);

  if (!post) return buildMetadata({ title: "Not found", path: `/blog/${slug}`, seo: noIndex });

  return buildMetadata({
    title: post.title,
    description: post.excerpt,
    path: `/blog/${post.slug}`,
    image: post.cover_image,
    type: "article",
    seo: post.seo,
    article: {
      publishedTime: post.published_at,
      modifiedTime: post.updated_at,
      authors: [post.author?.name],
      tags: (post.categories ?? []).map((c) => c.name),
    },
  });
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await load(slug);

  if (!post) notFound();

  // An active detail template lays the page out (0.161.0, docs/page-builder.md "Detail templates"); with none, the page below is unchanged.
  if (post.detail_template) return <BlogTemplate post={post} />;

  const settings = await getSiteSettings();

  /*
   * The sidebar and the related row, neither of which may fail the article.
   *
   * A post is the thing somebody came for; a category list is furniture. So
   * these are caught individually and degrade to nothing rather than taking
   * the page down with them — the rule `Notifier` follows for mail and
   * `LeadIntake` for an enquiry.
   */
  const { taxonomy, alsoRead, comments } = await loadBlogContext(post, slug);

  // Anchors on the sections, for the map and for links into the post.
  const { html: body, headings } = withHeadingIds(post.body ?? "");

  // Builder sections in place of the written body (0.130.0).
  const laidOut = laidOutAsSections(post);
  const crumbs = [
    { name: "Blog", path: "/blog" },
    { name: post.title, path: `/blog/${post.slug}` },
  ];

  // The article's heading: where it is, its title, who wrote it, its picture, the share row.
  const head = (
    <>
      <BlogHead post={post} crumbs={crumbs} />
    </>
  );

  // Everything after the body: the details, the questions, the post either side, the comments.
  const after = (
    <>
      {/* The answer blocks and FAQs, then what the post is about — after the body, before the neighbours. */}
      {/* Custom fields in "details" groups (docs/custom-content.md): nothing when there are none. */}
      <CustomFieldDetails fields={post.custom_fields} className="mt-10" />
      <AnswerBlocks blocks={post.answer_blocks} faqs={post.faqs ?? []} className="mt-10" />
      <RelatedEntities entity={post.entity} className="mt-10" />

      {/*
        The post either side, before the comments: a reader who has
        reached the end is offered the next thing first, and the
        conversation below it.
      */}
      <PostNav previous={post.previous} next={post.next} />

      <BlogComments post={post} comments={comments} />

      <BlogFooter />
    </>
  );

  const sidebar = (
    <BlogSidebar
      taxonomy={taxonomy}
      settings={settings}
      activeCategory={post.categories?.[0]?.slug}
      sticky={false}
    />
  );

  const relatedStories = <BlogRelatedStories alsoRead={alsoRead} />;

  return (
    <>
      <CategoryStrip
        categories={taxonomy?.categories ?? []}
        active={post.categories?.[0]?.slug}
      />

      {laidOut ? (
        /*
          Laid out as sections: the heading on its own, at the width the
          article column has; then the sections as full-width bands; then
          what follows the body beside the sidebar. The sidebar moves down
          with it — beside a heading alone it would be a tall column next to
          a short one — and there is no map, since the map is the written
          body's headings.
        */
        <article id="post-body">
          <ReadingProgress target="post-body" />
          <Container className="section-y pb-10">
            <div className="mx-auto max-w-[900px]">{head}</div>
          </Container>

          <RecordSections sections={post.sections ?? []} crumbs={crumbs} />

          <Container className="section-y">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-9">
              <div className="min-w-0 [&>*:first-child]:mt-0">{after}</div>
              <div className="min-w-0">{sidebar}</div>
            </div>
            {relatedStories}
          </Container>
        </article>
      ) : (
        <Container className="section-y">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-9">
            <article id="post-body" className="min-w-0">
              <ReadingProgress target="post-body" />
              {head}

              {/*
                `Prose` keeps its own 68ch measure inside this column. The page is
                no longer a centred 780px block — it has a sidebar now — but the
                thing that is actually *read* still wants a reading width, which
                is what that cap is for.
              */}
              <BlogBody body={body} />

              {after}
            </article>

            <div className="min-w-0">
              {sidebar}
              {/*
                After the sidebar's cards and the one sticky thing in the
                column: once the reader is past those cards — a third of a long
                post — the map holds at the header for the rest of the read,
                and nothing comes after it to paint over it. See BlogSidebar
                for why the aside itself is not sticky here.
              */}
              <ArticleMap headings={headings} sticky className="mt-6 hidden lg:block" />
            </div>
          </div>

          {relatedStories}
        </Container>
      )}

      <CtaBand
        title="Ran into this on your own network?"
        body="If something here matches a problem you are seeing, describe it and we will tell you what we would check first."
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
      {post.schema && <JsonLd data={post.schema} />}
      {/* The FAQPage over the FAQs and question blocks — the API's, absent under two entries, and the only one on the page. */}
      {post.faq_schema && <JsonLd data={post.faq_schema} />}
    </>
  );
}
