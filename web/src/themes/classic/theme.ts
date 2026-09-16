import type { ThemeManifest } from "../contract.ts";

/**
 * Classic: the site as it was before themes existed.
 *
 * Not a design of its own — its templates are the marketing layout's
 * chrome, the homepage's composition, `PageHero` and `CtaBand` moved here
 * verbatim on 2026-09-16, docblocks and all, so that `git log --follow`
 * still tells their history. Its `theme.css` is a comment: everything
 * classic paints is `globals.css`, which every other theme inherits and
 * overrides under its own `[data-theme]`. It is the default, and the
 * fallback for every id the site does not know.
 */
export const classicManifest: ThemeManifest = {
  id: "classic",
  name: "Classic",
  blurb: "The site as designed: the mega menu, the sectioned homepage, the banner heroes.",
  screenshot: "/themes/classic.png",
};
