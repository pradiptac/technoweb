import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { Breadcrumbs } from "@/components/ui/page-hero";
import { ProseWithShortcodes } from "@/components/ui/prose-with-shortcodes";
import { ArticleMeta } from "@/components/ui/article-meta";
import { BlogSidebar } from "@/components/blog/blog-sidebar";
import { CategoryChips } from "@/components/blog/category-chips";
import { CategoryStrip } from "@/components/blog/category-strip";
import { PostGrid } from "@/components/blog/post-grid";
import { PostNav } from "@/components/blog/post-nav";
import { ShareLinks } from "@/components/ui/share-links";
import { Comments } from "@/components/blog/comments";
import { ApiError, publicApi } from "@/lib/api";
import { JsonLd, SITE, buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { getSiteSettings } from "@/lib/settings";
import type { BlogPost, BlogTaxonomy, PublicComment } from "@/types/api";

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
  });
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await load(slug);

  if (!post) notFound();

  const settings = await getSiteSettings();

  /*
   * The sidebar and the related row, neither of which may fail the article.
   *
   * A post is the thing somebody came for; a category list is furniture. So
   * these are caught individually and degrade to nothing rather than taking
   * the page down with them — the rule `Notifier` follows for mail and
   * `LeadIntake` for an enquiry.
   */
  const [taxonomy, related, latest, comments] = await Promise.all([
    publicApi.blogTaxonomy().then((r) => r.data).catch((): BlogTaxonomy | null => null),
    post.categories?.length
      ? publicApi
        .posts(`?category=${post.categories[0].slug}&per_page=5`)
        .then((r) => r.data)
        .catch((): BlogPost[] => [])
      : Promise.resolve([] as BlogPost[]),
    // The newest, to fill the row when the category is short of four. A
    // "related stories" row with one card in it is a row that says the blog
    // is small; the cached front-page listing costs nothing to read.
    publicApi.posts("?per_page=6").then((r) => r.data).catch((): BlogPost[] => []),
    /*
     * Caught like the rest, and **null on failure rather than an empty list**.
     *
     * The two are different claims: an empty list says "nobody has commented",
     * which is a statement about the article, and null says "we could not
     * find out", which is a statement about us. Rendering the first for the
     * second would put "Comments" and a form on a page whose comments we
     * simply failed to load.
     */
    publicApi
      .postComments(slug)
      .catch((): { data: PublicComment[]; meta: { open: boolean; total: number } } | null => null),
  ]);

  // Never the article somebody is already reading, and never one twice:
  // the same category first, then the newest until there are four.
  const seen = new Set<number>([post.id]);
  const alsoRead = [...related, ...latest].filter((p) => !seen.has(p.id) && seen.add(p.id)).slice(0, 4);

  return (
    <>
      <CategoryStrip
        categories={taxonomy?.categories ?? []}
        active={post.categories?.[0]?.slug}
      />

      <Container className="section-y">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-9">
          <article className="min-w-0">
            <Breadcrumbs
              crumbs={[
                { name: "Blog", path: "/blog" },
                { name: post.title, path: `/blog/${post.slug}` },
              ]}
            />

            <CategoryChips categories={post.categories} className="mt-5" />

            <h1 className="display-2 mt-4">{post.title}</h1>
            {post.excerpt && <p className="lede mt-4">{post.excerpt}</p>}

            <ArticleMeta
              className="mt-5 border-t border-line pt-5"
              date={post.published_at}
              readingMinutes={post.reading_minutes}
              author={post.author?.name}
            />

            {post.cover_image && (
              <div data-aos="fade-up" className="mt-7">
                {/*
                  The one image on the site with no fixed-height well; it
                  carries the 4:3 every picture on the blog is cropped to, so
                  nothing shifts while it loads. (The share image is generated
                  separately at 1200x630 and does not read this file.)
                */}
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-line">
                  <Image
                    src={post.cover_image}
                    alt={post.cover_image_alt ?? ""}
                    fill
                    sizes="(min-width: 1024px) 60vw, 100vw"
                    priority
                    className="object-cover"
                  />
                </div>
              </div>
            )}

            <div className="mt-6 border-y border-line py-4">
              <ShareLinks url={`${SITE.url}/blog/${post.slug}`} title={post.title} />
            </div>

            {/*
              `Prose` keeps its own 68ch measure inside this column. The page is
              no longer a centred 780px block — it has a sidebar now — but the
              thing that is actually *read* still wants a reading width, which
              is what that cap is for.
            */}
            <div data-aos="fade-up" className="mt-8">
              {/*
                The one `Prose` on the site without the 68ch measure. The
                column beside the sidebar is the measure here — asked for,
                so a post fills the room the layout gives it rather than
                stopping two thirds of the way across it.
              */}
              {post.body && <ProseWithShortcodes html={post.body} className="max-w-none" />}
            </div>

            {/*
              The post either side, before the comments: a reader who has
              reached the end is offered the next thing first, and the
              conversation below it.
            */}
            <PostNav previous={post.previous} next={post.next} />

            {/*
              Comments, inside the article column so they sit at the reader's
              measure rather than the page's, and above the "all articles"
              footer: a conversation belongs with the thing it is about.

              Rendered when the post takes comments, or when it has some
              already. Not merely when the fetch succeeded: the endpoint
              answers 200 whether comments are enabled or not, so gating on
              that put a "Comments — comments are closed on this post" heading
              under **every** article on an install with the shipped default
              (`comments_enabled` is off), which is a block explaining the
              absence of a feature nobody had switched on.

              The second half of the condition is what keeps a closed thread
              readable: closing comments on an old post must not delete the
              conversation that happened on it.
            */}
            {comments !== null && (comments.meta.open || comments.meta.total > 0) && (
              <Comments
                slug={post.slug}
                comments={comments.data}
                total={comments.meta.total}
                open={comments.meta.open}
              />
            )}

            <footer className="mt-8">
              <Link href="/blog" className="inline-block py-1 text-14 font-semibold text-brand-ink hover:underline">
                ← All articles
              </Link>
            </footer>
          </article>

          <BlogSidebar
            taxonomy={taxonomy}
            settings={settings}
            activeCategory={post.categories?.[0]?.slug}
          />
        </div>

        {alsoRead.length > 0 && (
          <div className="mt-14">
            <PostGrid posts={alsoRead} heading="Related stories" id="related-stories" />
          </div>
        )}
      </Container>

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
    </>
  );
}
