import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The type scale declared in `globals.css` (`--text-13` and friends), which
 * tailwind-merge has to be told about: it classifies an unknown `text-*` as
 * a colour, so `cn("text-brand-on", "text-13")` dropped the colour as though
 * two colours had been passed — measured as white-on-nothing at 1:1 on the
 * header's consultation button the moment the scale replaced `text-[13px]`.
 * Keep this list equal to the `--text-*` block in `@theme`.
 */
const TEXT_SIZES = [
  "10-5", "11", "11-5", "12", "12-5", "13", "13-5", "14", "14-5", "15", "15-5",
  "16-5", "17", "19", "22", "24",
];

const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: TEXT_SIZES }] } },
});

/** Merge conditional class names, with later Tailwind utilities winning. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Stagger steps for a revealed card grid: `data-aos-delay={STAGGER[i % STAGGER.length]}`.
 *
 * Cycling rather than multiplying by the index is deliberate — each row
 * restarts, so the cascade reads left-to-right per row and the hundredth
 * card is not seconds behind the first. Values must exist in the
 * `[data-aos-delay="…"]` scale in globals.css.
 */
export const STAGGER = [undefined, "75", "150"] as const;
