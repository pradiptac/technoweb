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
import { ShareLinks } from "@/components/blog/share-links";
import { ApiError, publicApi } from "@/lib/api";
import { JsonLd, SITE, buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { getSiteSettings } from "@/lib/settings";
import type { BlogPost, BlogTaxonomy } from "@/types/api";

async function load(slug: string): Promise<BlogPost | null> {
  try {
    return (await publicApi.post(slug)).data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
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
  const [taxonomy, related] = await Promise.all([
    publicApi.blogTaxonomy().then((r) => r.data).catch((): BlogTaxonomy | null => null),
    post.categories?.length
      ? publicApi
        .posts(`?category=${post.categories[0].slug}&per_page=5`)
        .then((r) => r.data)
        .catch((): BlogPost[] => [])
      : Promise.resolve([] as BlogPost[]),
  ]);

  // Never the article somebody is already reading.
  const alsoRead = related.filter((p) => p.id !== post.id).slice(0, 4);

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
                  The one image on the site with no fixed-height well, and it
                  carries the ratio the cover generator produces and og:image
                  wants — so nothing shifts while it loads.
                */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.cover_image}
                  alt={post.cover_image_alt ?? ""}
                  className="aspect-[1200/630] w-full rounded-xl border border-line object-cover"
                />
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
              {post.body && <ProseWithShortcodes html={post.body} />}
            </div>

            <footer className="mt-12 border-t border-line pt-6">
              <Link href="/blog" className="inline-block py-1 text-[14px] font-semibold text-brand-ink hover:underline">
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
            <PostGrid posts={alsoRead} heading="More on this" id="more-on-this" />
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
