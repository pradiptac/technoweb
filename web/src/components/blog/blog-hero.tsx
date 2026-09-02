import Link from "next/link";
import { IconBook } from "@/components/icons";
import { formatDate } from "@/components/ui/article-meta";
import { CategoryChips } from "@/components/blog/category-chips";
import type { BlogPost } from "@/types/api";

/**
 * The lead article, and three beside it.
 *
 * The one place on the blog where a picture is allowed to be large. Everything
 * below is a row at a fixed 260px well; this is a 16/9 well with the title
 * over it, which is what makes the top of the page read as an editorial front
 * rather than as the first item of a list.
 *
 * **The title is on a solid band, not over the photograph**, and that was
 * measured rather than reasoned about: the first cut put white text on a
 * gradient over the image and `npm run audit` returned **1.14:1**. It is the
 * same finding the gallery already carries — a background nobody has seen yet
 * cannot be made safe, because white is legible over a dark image and
 * invisible over a pale one, and a wash dark enough to guarantee 4.5:1 over a
 * white photograph greys the picture anyway.
 *
 * So the band is opaque `bg-dark` and the gradient above it only softens the
 * join. The contrast is then a property of the design rather than of whichever
 * cover an editor happened to upload.
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
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      <FeatureCard post={lead} />

      {rest.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          {rest.map((post) => (
            <li key={post.id}>
              <SideCard post={post} />
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
      <div className="aspect-[16/10] w-full sm:aspect-[16/9] lg:min-h-0 lg:flex-1">
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
        A short gradient over the foot of the image, so the solid band below
        does not cut the photograph off with a hard line. It is decoration
        only — nothing legible sits on it.
      */}
      <div className="pointer-events-none -mt-16 h-16 bg-linear-to-t from-dark to-transparent" />

      <div className="bg-dark p-5 pt-0 sm:p-7 sm:pt-0">
        <CategoryChips categories={post.categories} className="mb-3" />

        <h2 className="text-[22px] leading-[1.2] font-semibold text-balance text-white sm:text-[28px]">
          <Link href={`/blog/${post.slug}`} className="transition-opacity hover:opacity-90">
            {/*
              The whole card is the target, not just the words. `after:` covers
              the article so a click anywhere works, while the accessible name
              stays the title alone — the pattern that avoids wrapping an
              entire card in an anchor and announcing a paragraph as a link.
            */}
            <span className="absolute inset-0" aria-hidden />
            {post.title}
          </Link>
        </h2>

        {post.published_at && (
          <p className="mt-2 font-mono text-[11.5px] tracking-[.08em] text-dark-muted uppercase">
            {formatDate(post.published_at)}
          </p>
        )}
      </div>
    </article>
  );
}

function SideCard({ post }: { post: BlogPost }) {
  return (
    <article className="group relative grid h-full grid-cols-[110px_minmax(0,1fr)] items-center gap-3.5 overflow-hidden rounded-lg border border-line-strong bg-card p-3 transition-colors hover:border-brand-300 sm:grid-cols-[128px_minmax(0,1fr)]">
      <span className="block aspect-[4/3] overflow-hidden rounded bg-surface-2">
        {post.cover_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.cover_image}
            alt={post.cover_image_alt ?? ""}
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="grid size-full place-items-center bg-linear-135 from-brand-800 to-brand-600">
            <IconBook className="size-6 text-white/30" />
          </span>
        )}
      </span>

      <div className="min-w-0">
        <CategoryChips categories={post.categories} limit={2} className="mb-2" />

        <h3 className="text-[14.5px] leading-snug font-semibold">
          <Link href={`/blog/${post.slug}`} className="transition-colors hover:text-brand-ink">
            <span className="absolute inset-0" aria-hidden />
            {post.title}
          </Link>
        </h3>
      </div>
    </article>
  );
}
