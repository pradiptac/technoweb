import { inkOn } from "./palette.ts";
import { paletteFor } from "./themes.ts";
import { themeFor } from "./presets.ts";
import type { SiteSettings } from "./site-settings.ts";

/**
 * How the homepage's statistic figures look — Settings → Homepage.
 *
 * Two settings shared by every statistic row (the hero's, the support
 * band's, a theme's readout strip): `stats_colour`, a hex or blank, and
 * `stats_size`. The figure's colour defaults to the palette's brand
 * — `brand-ink` on a page ground, `brand-300` on a dark band — which is
 * what "set according to the theme colour" means, and what the CSS
 * fallbacks in `globals.css` (`.stat-figures`) resolve to when nothing is
 * chosen. A chosen colour is pushed until it clears 4.5:1 on each ground
 * it will sit on: the light page, the dark page and the dark band (which
 * does not invert) — so the client's hex is hue intent, the palette's
 * rule, and the figures are graded on arithmetic. Pure and isomorphic, so
 * the layout reads it beside the other settings.
 */
export type StatLook = {
  size: "small" | "medium" | "large";
  /** The chosen colour as it will paint on each ground, or null for the palette's brand. */
  ink: { light: string; dark: string; band: string } | null;
};

const SIZES = new Set(["small", "medium", "large"]);
const HEX = /^#[0-9a-f]{6}$/i;

export function statLookFor(settings: SiteSettings): StatLook {
  const size = settings.stats_size?.trim() ?? "";
  const hex = settings.stats_colour?.trim().toLowerCase();
  let ink: StatLook["ink"] = null;
  if (hex && HEX.test(hex)) {
    const theme = themeFor(settings);
    const light = paletteFor(theme, "light");
    const dark = paletteFor(theme, "dark");
    ink = { light: inkOn(hex, light.page), dark: inkOn(hex, dark.page), band: inkOn(hex, light.dark) };
  }
  return { size: (SIZES.has(size) ? size : "medium") as StatLook["size"], ink };
}

/** The pixel size each choice maps to; the figure reads it as `--stat-size`. */
export const STAT_PX: Record<StatLook["size"], string> = { small: "20px", medium: "26px", large: "34px" };
