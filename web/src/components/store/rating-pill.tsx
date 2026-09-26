import { StarGlyph, ratingLabel } from "@/components/store/stars";
import { cn } from "@/lib/utils";
import type { StoreRating } from "@/types/api";

/**
 * The rating on a product card's picture: a gold star, the average, a rule,
 * the count — "★ 4.8 | 9" — in a small pill at the image's bottom-left.
 *
 * Drawn only when there is a rating (`rating` is null until a review is
 * published), because an empty pill reads as "rated nothing". The pill is
 * `bg-card` so the star is graded against a ground the theme gate checks,
 * whatever the photograph behind it; the words are ink on that card. The
 * label says it in full for a screen reader, which hears the pill and not
 * its glyphs. A sibling of the card's link, and not interactive.
 */
export function RatingPill({ rating, className = "" }: { rating?: StoreRating | null; className?: string }) {
  if (!rating || rating.count < 1) return null;

  return (
    <span
      role="img"
      aria-label={ratingLabel(rating.average, rating.count)}
      data-rating-pill
      className={cn("pointer-events-none absolute bottom-2.5 left-2.5 z-10 inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-12 font-semibold text-ink shadow-1", className)}
    >
      <StarGlyph className="size-3.5" />
      <span className="tabular-nums">{rating.average.toFixed(1)}</span>
      <span aria-hidden="true" className="h-3 w-px bg-line-strong" />
      <span className="tabular-nums text-muted">{rating.count}</span>
    </span>
  );
}
