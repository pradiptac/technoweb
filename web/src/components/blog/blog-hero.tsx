import Link from "next/link";
import { IconBook } from "@/components/icons";
import { formatDate } from "@/components/ui/article-meta";
import { CategoryChips } from "@/components/blog/category-chips";
import type { BlogPost } from "@/types/api";

/**
 * The lead article, and three beside it.
 *
 * Two equal columns: the lead is a 4:3 picture with the title on it, the
 * other three are rows — a thumbnail, then the chips and the title beside
 * it. **Every picture on the blog is 4:3**, this one included, so the lead's
 * height is a known function of its width and the side column is sized to
 * meet it: the thumbnail is 5/16 of its row, which puts three 4:3
 * thumbnails and two gaps within a few pixels of one 4:3 lead at every width
 * from `lg` up (measured at 1024, 1440 and 1920). The remainder is absorbed
 * in both directions — the list is `grid-rows-3`, so a taller lead spreads
 * the rows with each thumbnail centred, and the lead's picture is `flex-1`,
 * so a taller list stretches the picture by the few pixels rather than
 * leaving a strip of nothing under it.
 *
 * Each row is a card — a hairline, the card ground, a little padding — so
 * the three read as three things beside the one picture rather than as
 * text floating next to it; the first cut drew them flush and they were
 * asked for with an edge. The padding comes out of the thumbnail's width,
 * so the 5/16 arithmetic above is measured *with* it.
 *
 * **The title sits over the photograph, and the part of the overlay it sits
 * on is opaque.** The first cut put white text on a gradient and `npm run
 * audit` returned **1.14:1** — the finding the gallery already carries: a
 * background nobody has seen yet cannot be made safe, because white is
 * legible over a dark image and invisible over a pale one. The second cut
 * put the title on a solid band *below* the picture, which passed and read
 * as a caption rather than a cover. This one is the overlay with its
 * gradient's first stop held: `from-dark from-60%` keeps the bottom 60% of
 * the overlay solid `dark`, and the chips, the title and the date all sit
 * inside that 60% — the fade above them is decoration, exactly as the slide
 * caption's is. The audit grades the worst *opaque* stop, so it measures
 * white on `dark` here and that is also what a reader gets.
 *
 * **`bg-dark`, never `bg-ink`.** `ink` is the *text* token and it inverts — in
 * the dark scheme it is near-white, so `bg-ink text-white` is white on white.
 * The first cut used it and the dark audit returned **1.11:1** across six
 * elements. `--color-dark` is the one that stays dark in both schemes, which
 * is why the footer, the CTA band and the NOC panel all use it. This project's
 * note is exact: a token that inverts cannot be paired with a literal colour.
 */
export function BlogHero({ posts }: { posts: BlogPost[] }) {
  const [lead, ...rest] = posts;

  if (!lead) return null;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <FeatureCard post={lead} />

      {rest.length > 0 && (
        <ul className="grid gap-5 lg:min-h-0 lg:grid-rows-3">
          {rest.map((post) => (
            <li key={post.id} className="lg:min-h-0">
              <SideRow post={post} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FeatureCard({ post }: { post: BlogPost }) {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-lg bg-dark lg:h-full">
      <div className="aspect-[4/3] w-full lg:min-h-0 lg:flex-1">
        {post.cover_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.cover_image}
            alt={post.cover_image_alt ?? ""}
            // The one image on the blog worth loading eagerly: it is the
            // largest thing above the fold and therefore the LCP element.
            className="size-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.03]"
            fetchPriority="high"
          />
        ) : (
          <span className="grid size-full place-items-center bg-linear-135 from-brand-800 to-brand-600">
            <IconBook className="size-12 text-white/25" />
          </span>
        )}
      </div>

      {/*
        The caption, over the foot of the picture. The gradient's first stop
        is held at 60% so everything legible sits on solid `dark`; only the
        upper half of the overlay fades, and nothing sits there.
      */}
      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-dark from-60% to-transparent px-5 pt-28 pb-5 sm:px-7 sm:pt-36 sm:pb-7">
        <CategoryChips categories={post.categories} variant="solid" className="mb-3.5" />

        <h2 className="text-[22px] leading-[1.2] font-semibold text-balance text-white sm:text-[28px] lg:text-[30px]">
          <Link href={`/blog/${post.slug}`} className="transition-opacity hover:opacity-90">
            {/*
              The whole card is the target, not just the words. The span
              covers the article so a click anywhere works, while the
              accessible name stays the title alone — the pattern that avoids
              wrapping an entire card in an anchor and announcing a paragraph
              as a link.
            */}
            <span className="absolute inset-0" aria-hidden />
            {post.title}
          </Link>
        </h2>

        {post.published_at && (
          <p className="mt-2.5 font-mono text-[11.5px] tracking-[.08em] text-dark-muted uppercase">
            {formatDate(post.published_at)}
          </p>
        )}
      </div>
    </article>
  );
}

function SideRow({ post }: { post: BlogPost }) {
  return (
    <article className="group relative grid h-full grid-cols-[minmax(0,5fr)_minmax(0,11fr)] items-center gap-4 rounded-lg border border-line-strong bg-card p-2.5 pr-4 transition-colors hover:border-brand-300 sm:gap-5">
      <span className="block aspect-[4/3] overflow-hidden rounded-md bg-surface-2">
        {post.cover_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.cover_image}
            alt={post.cover_image_alt ?? ""}
            className="size-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <span className="grid size-full place-items-center bg-linear-135 from-brand-800 to-brand-600">
            <IconBook className="size-7 text-white/30" />
          </span>
        )}
      </span>

      <div className="min-w-0">
        <CategoryChips categories={post.categories} limit={2} variant="outline" className="mb-2.5" />

        <h3 className="line-clamp-2 text-[15.5px] leading-snug font-semibold text-balance sm:text-[18px] lg:text-[19px]">
          <Link href={`/blog/${post.slug}`} className="transition-colors hover:text-brand-ink">
            <span className="absolute inset-0" aria-hidden />
            {post.title}
          </Link>
        </h3>
      </div>
    </article>
  );
}
