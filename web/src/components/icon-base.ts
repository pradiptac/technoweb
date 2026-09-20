import type { SVGProps } from "react";

/**
 * The shared stroke geometry, in its own module so a generated pack can import
 * it without a cycle.
 *
 * These two lived in `icons.tsx` until Reicon became the first pack vendored
 * into a file of its own — every earlier one is written inline there. A
 * generated file importing `base` from `icons.tsx` while `icons.tsx` imports
 * its map back is a circular import in the module 109 components depend on. It
 * happens to resolve, because nothing in either file reads `base` before
 * render — which is exactly the kind of "works until somebody adds a top-level
 * constant" that is not worth carrying in this file.
 *
 * `icons.tsx` re-exports both, so the public surface is unchanged.
 */

/** The props every icon in this set takes. */
export type P = SVGProps<SVGSVGElement>;

/**
 * One visual weight across the whole icon set.
 *
 * `strokeWidth` is 1.7 and every borrowed pack is re-drawn to it — Lucide is 2,
 * Heroicons and TailGrids are 1.5, Reicon is 1.5 — because mixed stroke weights
 * in one grid read as sloppy before anybody can say why. `fill: none` is what
 * makes a filled-outline icon render as nothing at all, which is the trap each
 * pack's generator checks for.
 */
export const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  width: 24,
  height: 24,
  "aria-hidden": true,
};
