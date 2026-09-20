import type { CSSProperties } from "react";

/**
 * The style that keeps a picture's subject in frame when the box crops it.
 *
 * A focal point is a property of the file, set once in the media library
 * beside the alt text and published by every resource as `*_focus` — the
 * string `object-position` wants, `"30% 20%"`, or null when nobody has
 * chosen one. This turns it into the one declaration a cover site needs:
 * `object-cover` keeps deciding how the picture fills its box, and
 * `object-position` only ever moves *which part* of it is kept. Nothing
 * here resizes, pads or letterboxes anything.
 *
 * `undefined` for a missing point, deliberately, rather than `50% 50%`: an
 * unset point is the browser's own default, and an element with no `style`
 * prop renders byte-identically to how it rendered before the point
 * existed — which is what makes the whole feature additive. Spread the
 * result or pass it straight to `style`; a `next/image` with `fill` merges
 * it with its own positioning.
 *
 * No directive at the top: this is imported by server components (the
 * tiles, the heroes) and client components (the sliders, the popup) alike.
 */
export function focalStyle(focus?: string | null): CSSProperties | undefined {
  return focus ? { objectPosition: focus } : undefined;
}
