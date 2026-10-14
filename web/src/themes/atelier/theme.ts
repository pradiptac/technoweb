import type { ThemeManifest } from "../contract.ts";
import { oneRowHeader } from "../chrome-parts.ts";

/**
 * Atelier: a studio's own site — paper, a serif, and room for the work.
 *
 * The fourteenth theme (0.175.0), and the second built from a direction
 * rather than a reference. What it is made of: a warm paper ground, a
 * serif display set at its ordinary weight, an asymmetric hero with the
 * photograph bleeding off one edge, hairline rules where every other
 * theme draws a card, and a gallery grid for the case studies where a
 * wide tile leads. Every inner page opens on a ruled masthead rather than
 * on a banner.
 *
 * **It is the counterweight to Launch.** That theme is a SaaS bento of
 * filled, rounded tiles; this one is a printed page, and the only thing
 * either draws around a piece of content is a line.
 *
 * **The paper is derived, not a literal.** `--color-page` is warmed by
 * mixing a few per cent of the palette's own brand into it, so a
 * generated theme's paper is its own colour and the dark scheme warms the
 * dark ground by the same arithmetic — the rule that a token which
 * inverts may never be paired with a fixed colour.
 *
 * Fraunces is the display face. Editorial already sets Playfair, and the
 * two serifs are not interchangeable: Playfair's high contrast is a
 * newspaper's, Fraunces's soft wedge serifs are a studio's.
 */
export const atelierManifest: ThemeManifest = {
  id: "atelier",
  name: "Atelier",
  blurb: "A studio's page: warm paper, a serif set at its own weight, hairline rules and an asymmetric grid that gives the work room.",
  screenshot: "/themes/atelier.jpg",
  // A child of classic: Chrome, Home and PageHero are its own, and the
  // closing band is classic's with its corners squared in `theme.css`.
  extends: "classic",
  // Every inner page opens on the ruled masthead, with the banner beneath the words.
  ignores: ["hero_style"],
  defaults: { menu_style: "simple" },
  chrome: { header: oneRowHeader(["phone", "utility", "cta"]), footer: { parts: ["brand", "tagline", "address", "phone", "social", "columns", "signup", "legal", "credit", "scheme"], groups: [["tagline", "address", "social"]] } },
};
