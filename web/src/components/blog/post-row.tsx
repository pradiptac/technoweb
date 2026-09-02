import Link from "next/link";
import { IconArrowRight, IconBook } from "@/components/icons";
import { formatDate } from "@/components/ui/article-meta";
import { CategoryChips } from "@/components/blog/category-chips";
import type { BlogPost } from "@/types/api";

/**
 * One article in the listing: picture left, everything else right.
 *
 * A row rather than the card grid this page used to be, because the design
 * gives the excerpt three lines and a card cannot: at 320px a three-column
 * grid leaves ~300px for a title, a date and a paragraph, so the paragraph is
 * the thing that gets cut. Below `sm` this stacks, which is the same shape a
 * card had anyway.
 *
 * **The whole row is not one link.** The title is the link and the categories
 * are their own; wrapping the lot would swallow the chips into the article's
 * href and put a link inside a link, which is invalid and which a screen
 * reader announces as one enormous target.
 */
export function PostRow({ post }: { post: BlogPost }) {
  return (
    <article className="grid gap-0 overflow-hidden rounded-lg border border-line-strong bg-card transition-colors duration-200 hover:border-brand-300 sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
      {/*
        A fixed well, so a slow image cannot move the text beside it. Every
        other cover on this site sits in one for the same reason — the case
        study hero is the single deliberate exception.
      */}
      <Link
        href={`/blog/${post.slug}`}
        tabIndex={-1}
        aria-hidden
        className="block h-44 overflow-hidden bg-surface-2 sm:h-full sm:min-h-[196px]"
      >
        {post.cover_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.cover_image}
            // The alt text stored against the file in the media library, never
            // a string invented from the title: a name is not a description of
            // a picture. Empty when there is none, because this image is
            // decorative beside a title that already says the same thing.
            alt={post.cover_image_alt ?? ""}
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="grid size-full place-items-center bg-linear-135 from-brand-800 to-brand-600">
            <IconBook className="size-9 text-white/30" />
          </span>
        )}
      </Link>

      <div className="flex min-w-0 flex-col p-5">
        <CategoryChips categories={post.categories} className="mb-2.5" />

        <h2 className="text-[17px] leading-snug">
          <Link href={`/blog/${post.slug}`} className="transition-colors hover:text-brand-ink">
            {post.title}
          </Link>
        </h2>

        {post.published_at && (
          <p className="mt-1.5 font-mono text-[11.5px] tracking-[.06em] text-faint uppercase">
            {formatDate(post.published_at)}
          </p>
        )}

        {post.excerpt && (
          <p className="mt-2.5 line-clamp-3 text-[14px] leading-[1.6] text-muted">{post.excerpt}</p>
        )}

        <Link
          href={`/blog/${post.slug}`}
          className="mt-auto inline-flex w-fit items-center gap-2 pt-4 text-[12.5px] font-semibold tracking-[.06em] text-brand-ink uppercase transition-colors hover:text-brand-700"
        >
          <IconArrowRight className="size-4" aria-hidden />
          Read more<span className="sr-only"> about {post.title}</span>
        </Link>
      </div>
    </article>
  );
}
