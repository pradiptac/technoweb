import type { ThemeManifest } from "../contract.ts";

/**
 * Sentinel: the security company's site, after eset.com.
 *
 * The tenth theme (2026-09-18, one of three built from references the
 * client named: eset.com, technerd.altisinfonet.in, truenas.com). What the
 * reference is made of: a near-black ground that stays dark at the top,
 * one glowing hairline in the brand colour used as a seam — under the
 * header, around the two audience cards, across the closing band — and
 * display type set *light* rather than bold, with the statistics as huge
 * thin numerals. Everything else is quiet. Outfit at 300 carries the
 * display; Work Sans the body. Every colour is a token: the dark ground
 * tokens do not invert with the scheme, so the top of the page is the same
 * black in both, and the rest sits on the page's ground, the Summit rule
 * (an always-dark page cannot be graded in the light scheme).
 */
export const sentinelManifest: ThemeManifest = {
  id: "sentinel",
  name: "Sentinel",
  blurb: "A security company's page: near-black at the top, one glowing brand hairline as the seam, light display type and huge thin figures.",
  screenshot: "/themes/sentinel.jpg",
  // Every page opens on the dark band with the hairline; the section's picture is not drawn.
  ignores: ["hero_style"],
  // The category cards' name beside or at the far edge of its icon — asked for on 2026-09-19.
  offers: ["heading_align"],
  defaults: { menu_style: "mega", heading_align: "left" },
};
