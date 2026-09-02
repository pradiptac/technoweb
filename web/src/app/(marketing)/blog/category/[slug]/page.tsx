import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { IconBook } from "@/components/icons";
import { BlogSidebar } from "@/components/blog/blog-sidebar";
import { CategoryStrip } from "@/components/blog/category-strip";
import { PostRow } from "@/components/blog/post-row";
import { publicApi } from "@/lib/api";
import { isPrerendering } from "@/lib/build-phase";
import { getSiteSettings } from "@/lib/settings";
import { buildMetadata } from "@/lib/seo";
import type { BlogCategorySummary, BlogPost, BlogTaxonomy, Paginated } from "@/types/api";

/**
 * One category's articles.
 *
 * The page every badge, every sidebar row and every item in the category strip
 * points at — three components' worth of links, which is why its absence was
 * the largest set of dead links on the site the moment the index shipped
 * without it.
 *
 * **The category is read from the taxonomy endpoint, not from one of its
 * own.** That response already carries the name, the slug and the count, it is
 * needed on this page anyway for the sidebar, and Next dedupes the two calls
 * within a render — so a per-category endpoint would be a second way to ask a
 * question already being asked.
 */
type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> };

async function findCategory(slug: string): Promise<{
  category: BlogCategorySummary | null;
  taxonomy: BlogTaxonomy | null;
}> {
  try {
    const { data } = await publicApi.blogTaxonomy();

    return { category: data.categories.find((c) => c.slug === slug) ?? null, taxonomy: data };
  } catch {
    return { category: null, taxonomy: null };
  }
}

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const { category } = await findCategory(slug);

  if (!category) return buildMetadata({ title: "Category", path: `/blog/category/${slug}` });

  return buildMetadata({
    title: category.name,
    description:
      category.description
      ?? `Articles on ${category.name.toLowerCase()} from the engineers doing the work.`,
    path: `/blog/category/${category.slug}`,
  });
}

export default async function BlogCategoryPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const sp = await searchParams;
  const settings = await getSiteSettings();

  const { category, taxonomy } = await findCategory(slug);

  /*
   * A category with nothing published in it is a 404, not an empty listing.
   *
   * The taxonomy omits empty categories deliberately — the sidebar must not
   * offer a row that opens nothing — so "not in that list" and "does not
   * exist" are the same answer here, and both should be a 404 rather than a
   * page that ranks for a subject this site has not written about.
   */
  if (!category) notFound();

  const query = new URLSearchParams({ category: slug });
  if (sp.page) query.set("page", sp.page);

  let posts: Paginated<BlogPost> | null = null;
  let failed = false;

  try {
    posts = await publicApi.posts(`?${query.toString()}`);
  } catch (error) {
    if (isPrerendering) throw error;
    failed = true;
  }

  return (
    <>
      <PageHero
        kicker="Blog"
        title={category.name}
        lede={category.description ?? undefined}
        crumbs={[
          { name: "Blog", path: "/blog" },
          { name: category.name, path: `/blog/category/${category.slug}` },
        ]}
      />

      <CategoryStrip categories={taxonomy?.categories ?? []} active={category.slug} />

      <Container className="section-y">
        {failed ? (
          <ErrorState title="We could not load these articles">Refresh in a moment.</ErrorState>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-9">
            <div className="min-w-0">
              {posts && posts.data.length === 0 ? (
                <EmptyState icon={<IconBook />} title="Nothing here yet">
                  Nothing is filed under {category.name} at the moment.
                </EmptyState>
              ) : (
                <>
                  <ul data-aos="fade-up" className="grid gap-5">
                    {(posts?.data ?? []).map((post) => (
                      <li key={post.id}>
                        <PostRow post={post} />
                      </li>
                    ))}
                  </ul>

                  {posts && (
                    <Pagination
                      meta={posts.meta}
                      basePath={`/blog/category/${category.slug}`}
                      showPerPage={false}
                    />
                  )}
                </>
              )}
            </div>

            <BlogSidebar taxonomy={taxonomy} settings={settings} activeCategory={category.slug} />
          </div>
        )}
      </Container>

      <CtaBand />
    </>
  );
}
