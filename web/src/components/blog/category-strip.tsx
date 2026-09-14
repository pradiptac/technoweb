import Link from "next/link";
import { Container } from "@/components/ui/container";
import type { CSSProperties } from "react";
import { tagIndex } from "@/components/blog/category-chips";
import { cn } from "@/lib/utils";
import type { BlogCategorySummary } from "@/types/api";

/**
 * The blog's own navigation, under the site header.
 *
 * A strip rather than entries in the main header, the answer the newsletter
 * and the store already give: the site header is at its measured limit — both
 * flanking groups are `shrink-0` and the consultation button is a fixed
 * 150px — and six category names would reopen the 320px overflow the logo cap
 * exists for.
 *
 * **It wraps on a phone and scrolls from `sm`.** The first cut scrolled at
 * every width, on the argument that the number of categories is editorial
 * and unbounded and a wrapping strip at 320px could become four rows of
 * chrome above the first article. Measured, the cost of scrolling was the
 * one that was paid: a phone showed "ALL NETWORKING SECURITY INFRASTRUCTURE
 * BACKU" with nothing to say the rest existed, and a cut-off word is not a
 * strong enough hint. Seven categories wrap to three rows at 320px, which is
 * the price of every category being reachable; from `sm` the row fits and
 * scrolls if it ever does not.
 */
export function CategoryStrip({
  categories, active,
}: {
  categories: BlogCategorySummary[];
  active?: string;
}) {
  if (categories.length === 0) return null;

  return (
    <nav aria-label="Blog categories" className="border-b border-line bg-surface-2">
      <Container>
        <ul className="flex flex-wrap gap-2 py-3 sm:flex-nowrap sm:overflow-x-auto sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden">
          <li className="strip-in" style={{ "--i": 0 } as CSSProperties}>
            <StripLink href="/blog" active={!active}>All</StripLink>
          </li>

          {categories.map((category, i) => (
            <li key={category.id} className="strip-in" style={{ "--i": i + 1 } as CSSProperties}>
              <StripLink
                href={`/blog/category/${category.slug}`}
                active={category.slug === active}
                hue={tagIndex(category.slug)}
                count={category.posts_count}
              >
                {category.name}
              </StripLink>
            </li>
          ))}
        </ul>
      </Container>
    </nav>
  );
}

/**
 * One pill. A category is drawn in its own colour — the same hue its chips
 * carry on every card, hashed from the slug — as a dot and a hairline on the
 * card, and on hover or when current it fills with the `-fill` step of the
 * same hue under white. "All" has no hue and takes the brand.
 *
 * The text sits on `card`, not on the strip's `surface-2`: the tag colours
 * are walked to their floor against the card, and a pill that carried the
 * strip's ground would be a pairing nothing has measured. The fill under
 * white is the gate's `white on tag-fill-N` pair.
 *
 * `whitespace-nowrap` on a wrapping row moves whole pills to the next line,
 * which is what a wrapping row is for; it is a *text* that cannot wrap inside
 * a box that cannot grow that paints past its edge, and no pill here is
 * wider than the narrowest screen.
 */
function StripLink({
  href, active, hue, count, children,
}: {
  href: string;
  active?: boolean;
  hue?: number;
  count?: number;
  children: React.ReactNode;
}) {
  const colour = hue ? `var(--color-tag-${hue})` : "var(--color-brand-ink)";
  const fill = hue ? `var(--color-tag-fill-${hue})` : "var(--color-brand-600)";
  // A tag fill is the same dark hue in both schemes, so white is measured on
  // it; `brand-600` inverts and is bright in dark, so "All" takes `brand-on`
  // — the rule every brand fill on the site follows. The dark audit caught
  // white on it at 2.09:1.
  const onFill = hue ? "text-white" : "text-brand-on";

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group/pill inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-12-5 font-semibold tracking-[.04em] whitespace-nowrap uppercase",
        "transition-[background-color,border-color,color,translate,box-shadow] duration-(--duration-base) motion-safe:hover:-translate-y-px hover:shadow-1",
        // The colours are custom properties read by utilities, never inline
        // `color`/`background`: an inline declaration outranks every class,
        // so a `hover:text-white` beside an inline `color` never applies —
        // which is exactly what the first cut shipped, a fill that arrived
        // on hover with the text still in its own colour on top of it.
        active
          ? cn("border-(--pill-fill) bg-(--pill-fill)", onFill)
          : cn("border-(--pill-line) bg-card text-(--pill-colour) hover:border-(--pill-fill) hover:bg-(--pill-fill)", hue ? "hover:text-white" : "hover:text-brand-on"),
      )}
      style={{ "--pill-colour": colour, "--pill-fill": fill, "--pill-line": `color-mix(in srgb, ${colour} 45%, transparent)` } as CSSProperties}
    >
      {hue && (
        <i
          aria-hidden
          className={cn(
            "size-1.5 shrink-0 rounded-full transition-[transform,background-color] duration-(--duration-base) motion-safe:group-hover/pill:scale-150",
            active ? "bg-white" : "bg-(--pill-colour) group-hover/pill:bg-white",
          )}
        />
      )}
      {children}
      {/*
        Full white on the fill, not white at 80%: the count is 11px text and
        the softened version measured 4.33:1 on the darkest fill.
      */}
      {count !== undefined && (
        <span className={cn("text-11 font-medium tabular-nums", active ? "text-white" : "text-muted group-hover/pill:text-white")}>
          {count}
        </span>
      )}
    </Link>
  );
}
