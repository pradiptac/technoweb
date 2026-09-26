/**
 * The shop's review stars — five in a row, or one on its own.
 *
 * Coloured from two tokens and nothing else: `--color-rating` for a star
 * earned and `--color-rating-empty` for the outline of one that was not,
 * both derived per theme by `ratingFor()` (palette.ts) and held to 3:1 on the
 * card and its surface-2 by `npm run themes`. A fraction — the 4.8 of a
 * summary — draws the gold clipped to its share of the star over the empty
 * outline, so the eye reads 4.8 and not 5.
 *
 * Decorative by construction: the row is `role="img"` with the rating in
 * words, and every glyph inside is `aria-hidden`. No directive, so a server
 * component draws it with no client JavaScript.
 */

const STAR = "M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.47L12 17.46l-5.8 3.06 1.1-6.47-4.7-4.6 6.5-.95z";

/** One star: `fill` 1 is gold, 0 an empty outline, anything between a clipped gold over the outline. */
export function StarGlyph({ fill = 1, className = "size-4" }: { fill?: number; className?: string }) {
  const share = Math.max(0, Math.min(1, fill));

  return (
    <span className={`relative inline-block shrink-0 ${className}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" className="absolute inset-0 size-full">
        <path d={STAR} fill="none" stroke="var(--color-rating-empty)" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
      {share > 0 && (
        <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${share * 100}%` }}>
          <svg viewBox="0 0 24 24" className="h-full" style={{ width: `${100 / share}%`, maxWidth: "none" }}>
            <path d={STAR} fill="var(--color-rating)" stroke="var(--color-rating)" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </span>
  );
}

/** "Rated 4.8 out of 5" — or "from 9 reviews" when a count is known. */
export function ratingLabel(value: number, count?: number): string {
  const n = Number.isInteger(value) ? String(value) : value.toFixed(1);
  const base = `Rated ${n} out of 5`;
  return count === undefined ? base : `${base} from ${count} review${count === 1 ? "" : "s"}`;
}

export function Stars({
  value, count, size = "size-4", gap = "gap-0.5", className = "",
}: {
  value: number;
  /** Only for the label; the row draws five stars whatever the count. */
  count?: number;
  /** A size utility for each star. */
  size?: string;
  gap?: string;
  className?: string;
}) {
  return (
    <span role="img" aria-label={ratingLabel(value, count)} className={`inline-flex items-center ${gap} ${className}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <StarGlyph key={n} fill={value - (n - 1)} className={size} />
      ))}
    </span>
  );
}
