import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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
