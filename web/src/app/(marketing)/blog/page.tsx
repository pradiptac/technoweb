import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { IconBook } from "@/components/icons";
import { BlogHero } from "@/components/blog/blog-hero";
import { BlogSidebar } from "@/components/blog/blog-sidebar";
import { CategoryStrip } from "@/components/blog/category-strip";
import { PostGrid } from "@/components/blog/post-grid";
import { PostRow } from "@/components/blog/post-row";
import { publicApi } from "@/lib/api";
import { isPrerendering } from "@/lib/build-phase";
import { getSiteSettings } from "@/lib/settings";
import { buildMetadata } from "@/lib/seo";
import type { BlogPost, BlogTaxonomy, Paginated } from "@/types/api";

export const metadata = {
  ...buildMetadata({
    title: "Blog",
    description:
      "Field notes and configuration guides from the engineers doing the work — networking, firewalls, backup, Wi-Fi and infrastructure practice.",
    path: "/blog",
  }),
  /*
   * Advertise the feed.
   *
   * A feed nothing links to is a feed nobody finds — the rule this project
   * already states about screens ("a screen nothing links to does not exist").
   * `alternates.types` is what puts the `<link rel="alternate">` in the head,
   * which is what a reader's "subscribe to this page" button looks for.
   */
  alternates: {
    ...buildMetadata({ title: "Blog", path: "/blog" }).alternates,
    types: { "application/rss+xml": [{ url: "/blog/rss.xml", title: "Technoware — Blog" }] },
  },
};

type SearchParams = { page?: string; q?: string; year?: string; month?: string };

export default async function BlogIndex({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const settings = await getSiteSettings();

  const query = new URLSearchParams();
  if (sp.page) query.set("page", sp.page);
  if (sp.q) query.set("q", sp.q);
  if (sp.year) query.set("year", sp.year);
  if (sp.month) query.set("month", sp.month);

  const qs = query.toString();

  /*
   * The hero is only on the unfiltered first page.
   *
   * A "featured" article above a set of search results is answering a question
   * nobody asked, and it would sit above the very thing somebody came here to
   * find. Same for a month's archive: the page has a subject already.
   */
  const isPlain = !sp.q && !sp.year && !sp.month && (!sp.page || sp.page === "1");

  let posts: Paginated<BlogPost> | null = null;
  let taxonomy: BlogTaxonomy | null = null;
  let featured: BlogPost[] = [];
  let older: BlogPost[] = [];
  let failed = false;

  try {
    const [list, sidebar, hero, tail] = await Promise.all([
      // Caching is **off** whenever there is a search term: `?q=` has an
      // unbounded key space, so caching fills the cache with single-use
      // entries and serves a stale empty result for the whole window.
      publicApi.posts(qs ? `?${qs}` : "", !sp.q),
      publicApi.blogTaxonomy(),
      isPlain ? publicApi.featuredPosts(4) : Promise.resolve({ data: [] as BlogPost[] }),
      // The oldest published, for the row at the foot of the page. Only
      // fetched on the page that renders it.
      isPlain
        ? publicApi.posts("?per_page=8&order=oldest")
        : Promise.resolve(null),
    ]);

    posts = list;
    taxonomy = sidebar.data;
    featured = hero.data;
    older = tail?.data ?? [];
  } catch (error) {
    if (isPrerendering) throw error;
    failed = true;
  }

  /*
   * The hero's articles are not repeated in the list below it.
   *
   * Without this the first four appear twice on the same screen, which reads
   * as a bug rather than as emphasis.
   */
  const heroIds = new Set(featured.map((p) => p.id));
  const rows = (posts?.data ?? []).filter((p) => !heroIds.has(p.id));

  /*
   * On a small blog the hero *is* the blog.
   *
   * With four posts and a four-post hero the list below is empty, and the
   * empty state then says "Nothing published yet" directly underneath four
   * published articles — which is the page calling itself a liar. Measured on
   * this install, which has two.
   *
   * So the list is suppressed rather than emptied: the hero already showed
   * everything there is, and a heading over nothing is worse than no heading.
   * A filtered page never takes this branch, because there the empty state is
   * the correct and useful answer.
   */
  const heroShowedEverything = isPlain && rows.length === 0 && featured.length > 0;

  /*
   * Four older articles, and never one that is already on this screen.
   *
   * A "you may have missed" row repeating what is directly above it is the
   * kind of thing that reads as a broken query rather than as a suggestion.
   */
  const onScreen = new Set([...heroIds, ...rows.map((p) => p.id)]);
  const missed = isPlain ? older.filter((p) => !onScreen.has(p.id)).slice(0, 4) : [];

  return (
    <>
      <PageHero
        kicker="Blog"
        title="Written by the engineers on the job."
        lede="Field notes, post-mortems and configuration guides. No product announcements, no reposted vendor marketing."
        crumbs={[{ name: "Blog", path: "/blog" }]}
      />

      <CategoryStrip categories={taxonomy?.categories ?? []} />

      <Container className="section-y">
        {failed ? (
          <ErrorState title="We could not load the blog">Refresh in a moment.</ErrorState>
        ) : (
          <>
            {featured.length > 0 && (
              <div data-aos="fade-up" className="mb-9">
                <BlogHero posts={featured} />
              </div>
            )}

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-9">
              <div className="min-w-0">
                {sp.q && (
                  <p className="mb-5 text-[14px] text-muted">
                    {posts?.meta.total ?? 0} result{posts?.meta.total === 1 ? "" : "s"} for{" "}
                    <strong className="text-ink">{sp.q}</strong>
                  </p>
                )}

                {heroShowedEverything ? null : rows.length === 0 ? (
                  <EmptyState icon={<IconBook />} title={sp.q ? "Nothing matched" : "Nothing published yet"}>
                    {sp.q
                      ? "Try a shorter phrase, or browse the categories beside this."
                      : "The first articles are being written. Check back shortly."}
                  </EmptyState>
                ) : (
                  <>
                    <ul data-aos="fade-up" className="grid gap-5">
                      {rows.map((post) => (
                        <li key={post.id}>
                          <PostRow post={post} />
                        </li>
                      ))}
                    </ul>

                    {posts && (
                      <Pagination
                        meta={posts.meta}
                        basePath="/blog"
                        params={{ q: sp.q, year: sp.year, month: sp.month }}
                        showPerPage={false}
                      />
                    )}
                  </>
                )}
              </div>

              <BlogSidebar taxonomy={taxonomy} settings={settings} query={sp.q} />
            </div>
          </>
        )}
      </Container>

      {/*
        "You may have missed" — older articles, below the fold and below the
        pagination.

        Taken from the last page of the listing rather than by a second query
        for "random": random is not reproducible, so the row changes on every
        render and a reader who saw something interesting and scrolled back
        cannot find it again. The oldest published are also, on a blog this
        size, genuinely the ones somebody has missed.

        Only on the plain first page. Under a set of search results it would be
        four articles that do not match what was searched for.
      */}
      {missed.length > 0 && (
        <Container className="pb-16 lg:pb-20">
          <PostGrid posts={missed} heading="You may have missed" id="you-may-have-missed" />
        </Container>
      )}

      <CtaBand />
    </>
  );
}
