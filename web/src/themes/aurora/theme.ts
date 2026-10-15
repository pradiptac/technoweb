import type { ThemeManifest } from "../contract.ts";
import { oneRowHeader } from "../chrome-parts.ts";

/**
 * Aurora: soft light — a wash, glass edges and room to breathe.
 *
 * The thirteenth theme (0.175.0), and the first built from a direction
 * rather than from a reference site. What it is made of: a wide
 * brand-to-accent wash behind the hero, low in chroma and sitting on the
 * page's own ground rather than on a dark band; the slider or the NOC
 * panel in a frame whose edge catches the wash; rounded geometry
 * throughout and pill buttons; cards lifted by a hairline and a soft
 * shadow rather than by a border; the solutions as a three-up with the
 * identity icon drawn large. Every inner page opens on the same wash with
 * the banner framed beside the words.
 *
 * **It is the light counterweight to Datacenter.** That theme is a hard
 * grid on a dark console; this one has no hard edge anywhere, and the two
 * are the extremes the other eleven sit between.
 *
 * **Nothing here is a colour literal.** The wash is `brand-50` to
 * `accent-50` through transparent, so it is the palette's own tints and
 * it inverts with the scheme like everything else; the dark scheme gets
 * the same wash over the dark ground, which is where the name comes from.
 */
export const auroraManifest: ThemeManifest = {
  id: "aurora",
  name: "Aurora",
  blurb: "Soft light: a wide colour wash behind the hero, glass-edged frames, rounded geometry and generous space.",
  screenshot: "/themes/aurora.jpg",
  // Every inner page opens on the wash with the banner framed beside the words.
  ignores: ["hero_style"],
  defaults: { menu_style: "simple" },
  chrome: { header: oneRowHeader(["search", "utility", "cta"]), footer: { parts: ["brand", "tagline", "address", "phone", "social", "columns", "signup", "legal", "credit", "scheme"], groups: [["tagline", "address", "social"]] } },
};
