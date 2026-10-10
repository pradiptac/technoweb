import Link from "next/link";
import { cn } from "@/lib/utils";
import { tagIndex } from "@/lib/tag-colour";
import type { StoreTagChip } from "@/types/store-tags";

/**
 * The shop's tags, a row of small coloured pills under the search strip
 * (0.141.0, `docs/store.md` "Tags"). **Only once a category is chosen** — a
 * category page, or `/store?category=…` — never on the bare shop front (the
 * client, 2026-10-10).
 *
 * **Every chip is a link to `/store`**, never to the page it sits on: the
 * category pages are ISR-cached and must not read `searchParams`, so a tag
 * there opens `/store?category=<slug>&tag=<slug>` — the page's existing
 * filter pattern — and the listing, which is dynamic, does the filtering.
 * On `/store` the chosen tag is marked (`aria-current`, a ring) and pressing
 * it again clears it. A `next/link`, so it prefetches like the rest of the
 * shop and is a plain anchor without JavaScript.
 *
 * **The colour is `tagIndex(slug)`**, the blog category chips' hash into the
 * twelve `--color-tag-fill-N` tokens under white text — gated at 4.5:1 in both
 * schemes by `npm run themes`. Hashed from the slug rather than drawn at
 * random, so a tag is the same colour on every page and every visit, and the
 * server's HTML and the browser's agree. No hex anywhere.
 *
 * **It is not part of the sticky strip.** The strip must stay a direct child
 * of the shop wrapper to keep sticking (a sticky box is held by its own
 * parent), so this row is its sibling, directly after it, and scrolls away
 * with the page. It draws nothing at all with no tags, which is also what the
 * Shown switch and the row's own switch produce.
 *
 * Phone: one line that scrolls sideways, so a dozen tags never push the
 * products down; `w-0 min-w-full` is what lets the scroller contribute no
 * width to whatever holds it. A few tags that fit are centred there too, by
 * auto margins on the first and last chip — `justify-center` on a scroller
 * would put the start of an overflowing line out of reach. From `sm`: centred
 * and wrapping. **The row is as wide as what holds it**, so a page that
 * mounts it outside a `Container` (`/store`, where it is the strip's sibling)
 * passes the container's width as `className`: twelve chips on one line ran
 * to the screen's edges at 1280 and showed beside the sticky strip on a
 * phone until it did. Each chip is
 * 26px high — over the 24px tap-target floor, which is why it is not 22 — at
 * the public site's 12px type floor.
 */
/**
 * A product's own tags, as the same small chips in its buy panel, each opening
 * the tag's page (`/store/tags/<slug>`, 0.157.0) — the row on the category and
 * shop pages keeps its filter links. Left-aligned and wrapping — it sits under
 * a paragraph, not under a search bar. Nothing when there are none.
 */
export function ProductTagChips({ tags, className }: {
  tags?: { name: string; slug: string }[];
  className?: string;
}) {
  if (!tags || tags.length === 0) return null;

  return (
    <ul aria-label="Tags" className={cn("flex flex-wrap items-center gap-2", className)}>
      {tags.map((tag) => (
        <li key={tag.slug}>
          <Link
            href={`/store/tags/${encodeURIComponent(tag.slug)}`}
            className="inline-flex h-[26px] items-center rounded-full px-3 text-12 leading-none font-semibold text-white transition-opacity duration-(--duration-base) hover:opacity-85"
            style={{ background: `var(--color-tag-fill-${tagIndex(tag.slug)})` }}
          >
            {tag.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function TagRow({
  tags, active, category, q, sort, className,
}: {
  tags: StoreTagChip[];
  /** The chosen tag's slug, on `/store`. */
  active?: string;
  /** The category the listing is narrowed to; kept when a tag is chosen. */
  category?: string;
  q?: string;
  sort?: string;
  className?: string;
}) {
  if (tags.length === 0) return null;

  const href = (slug: string | null) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (category) query.set("category", category);
    if (sort) query.set("sort", sort);
    if (slug) query.set("tag", slug);
    const qs = query.toString();
    return qs ? `/store?${qs}` : "/store";
  };

  return (
    <nav aria-label="Browse by tag" data-store-tags className={cn("-mt-2 mb-5", className)}>
      <ul className="-my-1.5 flex w-0 min-w-full items-center gap-2 overflow-x-auto py-1.5 whitespace-nowrap [scrollbar-width:thin] sm:w-auto sm:min-w-0 sm:flex-wrap sm:justify-center sm:overflow-visible">
        {tags.map((tag) => {
          const chosen = tag.slug === active;
          return (
            <li key={tag.slug} className="shrink-0 max-sm:first:ml-auto max-sm:last:mr-auto">
              <Link
                href={href(chosen ? null : tag.slug)}
                aria-current={chosen ? "true" : undefined}
                title={`${tag.count} ${tag.count === 1 ? "product" : "products"}`}
                className={cn(
                  "inline-flex h-[26px] items-center rounded-full px-3 text-12 leading-none font-semibold text-white transition-opacity duration-(--duration-base) hover:opacity-85",
                  chosen && "ring-2 ring-ink ring-offset-2 ring-offset-page",
                )}
                style={{ background: `var(--color-tag-fill-${tagIndex(tag.slug)})` }}
              >
                {tag.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
