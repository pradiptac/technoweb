import type { ThemeManifest } from "../contract.ts";

/**
 * Launch: the site as a product launch page.
 *
 * The second of the technology-company themes (2026-09-16): the SaaS
 * identity — a floating pill header, a **bento** front page of unequal
 * rounded tiles on a tinted ground (the hero is a tile, the statistics are
 * tiles, a picture is a tile, the support desk is a tile), pill buttons,
 * and every inner page opening on a rounded panel with the section's
 * picture framed beside the words. Sora for display and Figtree for body,
 * the two roundest faces in the vendored set. It is the theme with the most
 * imagery: two Freepik pictures ship under `public/themes/launch/` for the
 * tiles that have no CMS picture to draw.
 */
export const launchManifest: ThemeManifest = {
  id: "launch",
  name: "Launch",
  blurb: "A product launch page: floating pill header, a bento front page of rounded tiles, pictures everywhere, pill buttons.",
  screenshot: "/themes/launch.jpg",
  // Every page opens on the rounded panel with the picture beside the words.
  ignores: ["hero_style"],
  defaults: { menu_style: "semi" },
};
