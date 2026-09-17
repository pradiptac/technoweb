import type { ThemeManifest } from "../contract.ts";

/**
 * Summit: the site as a software product company presents itself.
 *
 * Modelled on everestims.com (the client's reference, 2026-09-17): dark
 * at the top — a near-black one-row header and a centred hero over a
 * plexus picture, the headline on the centre line with two buttons and a
 * row of trust badges under it, the slider framed beneath like a product
 * screenshot — then the trusted-by logos, the statistics as tiles, a
 * **tabbed catalogue** (solutions, products, industries), the credentials,
 * a centred testimonial, and a "book a demo" close. Space Grotesk for
 * display, Inter for body. The dark ground tokens do not invert, so the
 * top is the same near-black in both schemes; below it the page's own
 * ground, because an always-dark page cannot be graded in the light
 * scheme. One Freepik picture under `public/themes/summit/`.
 */
export const summitManifest: ThemeManifest = {
  id: "summit",
  name: "Summit",
  blurb: "A software product company: dark centred hero over a plexus, trust badges, a tabbed catalogue of what you sell, a centred testimonial, book-a-demo everywhere.",
  screenshot: "/themes/summit.jpg",
  // Every page opens on the dark centred band; the section banner is never drawn.
  ignores: ["hero_style"],
  defaults: { menu_style: "mega" },
};
