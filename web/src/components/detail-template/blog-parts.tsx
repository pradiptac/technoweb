import Image from "next/image";
import Link from "next/link";
import { Breadcrumbs } from "@/components/ui/page-hero";
import { ProseWithShortcodes } from "@/components/ui/prose-with-shortcodes";
import { ArticleMeta } from "@/components/ui/article-meta";
import { CategoryChips } from "@/components/blog/category-chips";
import { PostGrid } from "@/components/blog/post-grid";
import { Comments } from "@/components/blog/comments";
import { ShareLinks } from "@/components/ui/share-links";
import type { Crumb } from "@/components/ui/breadcrumbs";
import { blurProps } from "@/lib/blur";
import { focalStyle } from "@/lib/focal";
import { publicApi } from "@/lib/api";
import { SITE } from "@/lib/seo";
import type { BlogPost, BlogTaxonomy, PublicComment } from "@/types/api";

/*
 * The pieces of a blog post's page, lifted out of its route (0.161.0) so the
 * route and a detail template draw each from the same code
 * (docs/page-builder.md "Detail templates"). Moved verbatim.
 */

type Comments = { data: PublicComment[]; meta: { open: boolean; total: number } } | null;

/**
 * The sidebar's taxonomy, the stories to read next and the comments — none of
 * which may fail the article. Caught individually and degraded to nothing.
 */
export async function loadBlogContext(post: BlogPost, slug: string): Promise<{
  taxonomy: BlogTaxonomy | null;
  alsoRead: BlogPost[];
  /** Every candidate for the row; the page takes four, a detail template its own count. */
  alsoReadPool: BlogPost[];
  comments: Comments;
}> {
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
  const alsoReadPool = [...related, ...latest].filter((p) => !seen.has(p.id) && seen.add(p.id));
  const alsoRead = alsoReadPool.slice(0, 4);

  return { taxonomy, alsoRead, alsoReadPool, comments };
}

/** The article's heading: where it is, its title, who wrote it, its picture, the share row. */
export function BlogHead({ post, crumbs }: { post: BlogPost; crumbs: Crumb[] }) {
  return (
    <>
      <Breadcrumbs crumbs={crumbs} />

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
              style={focalStyle(post.cover_image_focus)} {...blurProps(post.cover_image_blur)}
            />
          </div>
        </div>
      )}

      <div className="mt-6 border-y border-line py-4">
        <ShareLinks url={`${SITE.url}/blog/${post.slug}`} title={post.title} />
      </div>
    </>
  );
}

/** The written body. */
export function BlogBody({ body }: { body: string }) {
  return (
              <div data-aos="fade-up" className="mt-8">
                {/*
                  The one `Prose` on the site without the 68ch measure. The
                  column beside the sidebar is the measure here — asked for,
                  so a post fills the room the layout gives it rather than
                  stopping two thirds of the way across it.
                */}
                {body && <ProseWithShortcodes html={body} className="max-w-none" />}
              </div>
  );
}

/** The conversation under the article — when the post takes comments or already has some. */
export function BlogComments({ post, comments }: { post: BlogPost; comments: Comments }) {
  return (
    <>
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
    </>
  );
}

/** The way back to the blog. */
export function BlogFooter() {
  return (
      <footer className="mt-8">
        <Link href="/blog" className="inline-block py-1 text-14 font-semibold text-brand-ink hover:underline">
          ← All articles
        </Link>
      </footer>
  );
}

/** The stories to read next. */
export function BlogRelatedStories({ alsoRead }: { alsoRead: BlogPost[] }) {
  return alsoRead.length > 0 ? (
    <div className="mt-14">
      <PostGrid posts={alsoRead} heading="Related stories" id="related-stories" />
    </div>
  ) : null;
}
