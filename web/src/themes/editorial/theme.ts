import type { ThemeManifest } from "../contract.ts";

/**
 * Editorial: the site set like a paper.
 *
 * Swiss-modern editorial — the direction `ui-ux-pro-max` returned for a B2B
 * infrastructure company asked for a magazine: rules not cards, a
 * high-contrast serif for headlines over a plain sans, mathematical
 * spacing, nothing rounded. The masthead is three rules with the nameplate
 * centred and the sections in tracked capitals on the rail that sticks;
 * the front page is a lead, an "in numbers" strip and columns of text
 * under section labels; every inner page opens on a headline rather than a
 * banner. The display face is Playfair Display and the body Source Sans 3,
 * both already vendored — a theme declares its type; the palette's font
 * choice is classic's.
 */
export const editorialManifest: ThemeManifest = {
  id: "editorial",
  name: "Editorial",
  blurb: "Set like a paper: a centred nameplate, sections on a rail, rules instead of cards, a serif headline on every page.",
  screenshot: "/themes/editorial.jpg",
};
