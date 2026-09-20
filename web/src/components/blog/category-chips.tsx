import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BlogCategorySummary } from "@/types/api";

/**
 * The categories a post is filed under, as links.
 *
 * Links rather than decoration: a badge that looks like a control and does
 * nothing is the thing a reader tries once and stops trusting. Each goes to
 * the filtered listing, which is the whole reason the taxonomy has slugs.
 *
 * **Each category has its own colour, and it is the same colour on every
 * page.** The hue is picked by hashing the slug into the twelve `--color-tag-N`
 * tokens — derived per theme in `lib/palette.ts` so 11px text in it clears
 * 4.5:1 on the card whatever the palette, and gated by `npm run themes`. A
 * hash rather than a column: nothing to configure, a new category is
 * coloured the moment it exists, and a rename does not move it because the
 * slug is what a rename leaves alone. Nothing else in the product colours a
 * label by identity except the icon tiles, which do exactly this with the
 * same twelve hues at a different floor.
 *
 * Two looks. `outline` — the default — is the colour as text inside a
 * hairline of itself, for a chip beside a picture or under a heading, where a
 * filled pill competes with what it labels. `solid` is the same hue as a
 * fill under white, for the lead article's caption, where the ground is
 * `dark` in both schemes and an outline would sit on a photograph. Uppercase
 * and tracked because a category is a label, not a sentence, and small caps
 * are what stop it reading as the title's first line. The `+N` overflow
 * chip is counted rather than dropped: "+2" is honest and takes one chip's
 * room. Capped, because a post filed under six categories would otherwise
 * push the title off a card at 320px.
 */
export type ChipVariant = "outline" | "solid";

/** The tag token a slug lands on, 1–12. Stable across renders and pages. */
export function tagIndex(slug: string): number {
  let h = 7;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 12) + 1;
}

export function CategoryChips({
  categories, limit = 3, variant = "outline", className,
}: {
  categories?: BlogCategorySummary[] | null;
  limit?: number;
  variant?: ChipVariant;
  className?: string;
}) {
  if (!categories || categories.length === 0) return null;

  const shown = categories.slice(0, limit);
  const rest = categories.length - shown.length;

  return (
    <ul className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {shown.map((category) => {
        const n = tagIndex(category.slug);
        return (
          <li key={category.id}>
            <Link
              href={`/blog/category/${category.slug}`}
              className="rounded-full transition-opacity hover:opacity-80"
            >
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-[3px] text-11 leading-none font-semibold tracking-[.05em] whitespace-nowrap uppercase",
                  variant === "solid" && "border-transparent text-white",
                )}
                style={variant === "solid"
                  ? { background: `var(--color-tag-fill-${n})` }
                  : { color: `var(--color-tag-${n})`, borderColor: `color-mix(in srgb, var(--color-tag-${n}) 55%, transparent)` }}
              >
                {category.name}
              </span>
            </Link>
          </li>
        );
      })}

      {rest > 0 && (
        <li>
          {/*
            The shared badge whatever the variant: it carries its own fill, so
            it reads on the lead's dark caption and on a card alike. A
            white-on-transparent "+1" was the first cut for the solid variant
            and measured 1:1 the moment a solid chip sat on a light card.
          */}
          <Badge tone="closed" dot={false} className="px-2 py-[3px] text-11 leading-none">+{rest}</Badge>
        </li>
      )}
    </ul>
  );
}
