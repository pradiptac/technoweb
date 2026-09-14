import { LogoMarquee } from "@/components/company/logo-marquee";
import type { Brand } from "@/types/api";

/**
 * A continuous, seamless scroll of the manufacturers the catalogue actually
 * carries — real logos now, not the hand-typed name list this replaced.
 *
 * `items` is `publicApi.brands()`, the same endpoint the product filter
 * reads: a brand shown here always has a real logo and at least one
 * published product behind it, and the strip changes on its own as the
 * catalogue does. Nothing to show is nothing to render — a fresh install with
 * no brand tied to a published product would otherwise print the caption over
 * an empty row, which reads as broken rather than as "nothing yet".
 *
 * The track renders the list **twice**, back to back, and slides exactly one
 * copy's width to the left before looping — because the two copies are
 * identical, the loop point is invisible. See `.brand-marquee-track` in
 * globals.css for why that is a hand-written `transform` keyframe rather than
 * a Tailwind `translate-x-*` utility, and why reduced motion needs no extra
 * guard here.
 *
 * The visual track is `aria-hidden`: a screen reader gets the brand names
 * once, from the plain `sr-only` list beside it, rather than twice from a
 * duplicated one it has no way to know is decorative.
 *
 * **Dark scheme turns every logo to solid white rather than pinning the band
 * to a literal light colour.** The first cut did the latter — a trademarked
 * logo's colours are fixed and do not invert with a theme, and HPE Aruba's own
 * artwork has no fill at all on its "HPE" glyph, so it rendered in whatever
 * `color` inherited, i.e. black-on-near-black in dark. Forcing the whole band
 * to always be white fixed that one brand and cost every other one its actual
 * colour on a page that was otherwise dark, and a black-on-white strip sitting
 * in a dark-mode page reads as a mistake, not a design.
 *
 * `brightness(0) invert(1)` in dark scheme instead: it collapses every colour
 * in an image to black and then flips that to white, which is the standard way
 * to make an arbitrary raster or vector-as-image logo a flat white silhouette
 * without touching its file. It answers HPE Aruba's missing fill the same way
 * it answers everything else — there is no colour left to be missing — and it
 * lets the section go back to the page's own background token, dark in dark
 * mode, matching every other strip on the site rather than standing out as a
 * pinned-light exception.
 */
export function Partners({ items }: { items: Brand[] }) {
  return <LogoMarquee items={items} caption="Certified partner & deployment experience across" />;
}
