import Link from "next/link";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { ArticleMeta } from "@/components/ui/article-meta";
import { IconBook } from "@/components/icons";
import { publicApi } from "@/lib/api";
import { isPrerendering } from "@/lib/build-phase";
import { buildMetadata } from "@/lib/seo";
import type { BlogPost, Paginated } from "@/types/api";

export const metadata = buildMetadata({
  title: "Blog",
  description:
    "Field notes and configuration guides from the engineers doing the work — networking, firewalls, backup, Wi-Fi and infrastructure practice.",
  path: "/blog",
});

export default async function BlogIndex({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;

  let posts: Paginated<BlogPost> | null = null;
  let failed = false;

  try {
    posts = await publicApi.posts(sp.page ? `?page=${sp.page}` : "");
  } catch (error) {
    if (isPrerendering) throw error;
    failed = true;
  }

  return (
    <>
      <PageHero
        kicker="Blog"
        title="Written by the engineers on the job."
        lede="Field notes, post-mortems and configuration guides. No product announcements, no reposted vendor marketing."
        crumbs={[{ name: "Blog", path: "/blog" }]}
      />

      <Container data-aos="fade-up" className="py-16 lg:py-20">
        {failed ? (
          <ErrorState title="We could not load the blog">Refresh in a moment.</ErrorState>
        ) : !posts || posts.data.length === 0 ? (
          <EmptyState icon={<IconBook />} title="Nothing published yet">
            The first articles are being written. Check back shortly.
          </EmptyState>
        ) : (
          <>
            <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {posts.data.map((post) => (
                <li key={post.id}>
                  <article className="h-full">
                    <Link
                      href={`/blog/${post.slug}`}
                      className="flex h-full flex-col overflow-hidden rounded-lg border border-line-strong bg-white transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-2"
                    >
                      {post.cover_image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={post.cover_image} alt="" className="h-44 w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="grid h-44 place-items-center bg-linear-135 from-brand-800 to-brand-600">
                          <IconBook className="size-9 text-white/30" />
                        </div>
                      )}
                      <div className="flex flex-1 flex-col p-5">
                        <h2 className="text-[17px] leading-snug">{post.title}</h2>
                        {post.excerpt && (
                          <p className="mt-2.5 text-[14px] leading-[1.55] text-muted">{post.excerpt}</p>
                        )}
                        <ArticleMeta
                          className="mt-auto pt-4"
                          date={post.published_at}
                          readingMinutes={post.reading_minutes}
                          author={post.author?.name}
                        />
                      </div>
                    </Link>
                  </article>
                </li>
              ))}
            </ul>

            {posts.meta.last_page > 1 && (
              <nav className="mt-9 flex items-center justify-between gap-3" aria-label="Pagination">
                <span className="text-[13px] text-muted">
                  Page {posts.meta.current_page} of {posts.meta.last_page}
                </span>
                <span className="flex gap-2">
                  {posts.meta.current_page > 1 && (
                    <Link href={`/blog?page=${posts.meta.current_page - 1}`} className="rounded border border-line-strong bg-white px-3.5 py-2.5 text-[13.5px] font-semibold hover:border-faint">
                      Previous
                    </Link>
                  )}
                  {posts.meta.current_page < posts.meta.last_page && (
                    <Link href={`/blog?page=${posts.meta.current_page + 1}`} className="rounded border border-line-strong bg-white px-3.5 py-2.5 text-[13.5px] font-semibold hover:border-faint">
                      Next
                    </Link>
                  )}
                </span>
              </nav>
            )}
          </>
        )}
      </Container>

      <CtaBand />
    </>
  );
}
