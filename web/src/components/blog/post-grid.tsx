import Link from "next/link";
import { IconBook } from "@/components/icons";
import { CategoryChips } from "@/components/blog/category-chips";
import type { BlogPost } from "@/types/api";

/**
 * A row of small cards: "You may have missed", and related reading on a post.
 *
 * One component for both, because they are the same object — a picture, a
 * category and a title — asked for in two places. The heading is the caller's,
 * since "You may have missed" and "Related reading" are different claims and
 * only the caller knows which it is making.
 *
 * Deliberately no excerpt and no date. This sits at the foot of a page
 * somebody has already read down; it is a set of doors, and a paragraph under
 * each one turns a glance into a second article.
 */
export function PostGrid({
  posts, heading, id,
}: {
  posts: BlogPost[];
  heading: string;
  id: string;
}) {
  if (posts.length === 0) return null;

  return (
    <section aria-labelledby={id} data-aos="fade-up">
      <h2
        id={id}
        className="mb-6 text-[19px] font-semibold after:mt-2.5 after:block after:h-[3px] after:w-10 after:rounded-full after:bg-brand-600"
      >
        {heading}
      </h2>

      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {posts.map((post) => (
          <li key={post.id}>
            <article className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-line-strong bg-card transition-colors hover:border-brand-300">
              {/* A fixed well, so a slow image cannot shuffle the row. */}
              <span className="block h-36 overflow-hidden bg-surface-2">
                {post.cover_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={post.cover_image}
                    // From the media library, never derived from the title: a
                    // name is not a description of a picture.
                    alt={post.cover_image_alt ?? ""}
                    className="size-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="grid size-full place-items-center bg-linear-135 from-brand-800 to-brand-600">
                    <IconBook className="size-7 text-white/30" />
                  </span>
                )}
              </span>

              <div className="flex min-w-0 flex-1 flex-col p-4">
                <CategoryChips categories={post.categories} limit={1} className="mb-2" />

                <h3 className="text-[14.5px] leading-snug font-semibold">
                  <Link href={`/blog/${post.slug}`} className="transition-colors hover:text-brand-ink">
                    {/*
                      The card is the target and the title is the name. A whole
                      card wrapped in an anchor announces the picture, the
                      badge and the heading as one link.
                    */}
                    <span className="absolute inset-0" aria-hidden />
                    {post.title}
                  </Link>
                </h3>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
