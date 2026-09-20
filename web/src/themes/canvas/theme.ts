import type { ThemeManifest } from "../contract.ts";

/**
 * Canvas: the warm editorial system in `DESIGN-claude.md`.
 *
 * The client handed over a design document (2026-09-17, "use this for
 * design") describing a tinted cream canvas, a serif display face at
 * regular weight with negative tracking over a humanist sans, one coral
 * primary reserved for the buttons and full-bleed callout moments, dark
 * navy "product mockup" cards alternating with cream feature cards, and a
 * dark footer that never inverts. The colours are a **palette** — the
 * `canvas` preset in Colour palette, so the cream and the coral come from
 * the same five inputs as every other palette and pass the same gate — and
 * this theme is the *structure*: a 6-6 hero with the words left and a dark
 * mockup card right (the site's own NOC drawing, or the slider, as the
 * product chrome), three-up feature cards on the darker cream, a dark band
 * for the support desk, "model comparison" cards for the solutions on the
 * canvas with a hairline, and a coral callout band to close. Display type
 * at 400, never bolded, is the document's one non-negotiable and is the
 * theme's CSS. Works under any palette; drawn for its own.
 */
export const canvasManifest: ThemeManifest = {
  id: "canvas",
  name: "Canvas",
  blurb: "The warm editorial system from the client's design document: cream canvas, serif headlines at regular weight, coral only on the buttons and the callout band, dark mockup cards between cream feature cards.",
  screenshot: "/themes/canvas.jpg",
  extends: "classic",
  defaults: { menu_style: "semi", hero_style: "split" },
};
