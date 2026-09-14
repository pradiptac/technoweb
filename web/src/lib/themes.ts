/**
 * The site's visual directions, each a set of token overrides.
 *
 * Two kinds live here now. The 25 **legacy** themes below are hand-tuned
 * palettes kept as "More presets"; the six **presets** and any **custom**
 * palette are generated from five colours by `lib/palette.ts` and arrive
 * through `lib/presets.ts` as the same `Theme` shape. The emitter, the gate,
 * the picker and the root layout do not care which kind they hold — a theme
 * is a full palette however it was made.
 *
 * The rule "never hard-code a hex — if a colour is not in globals.css it does
 * not ship" still holds; this file is simply the other place tokens are
 * allowed to live, because a theme *is* a set of tokens. Nothing outside here
 * and `globals.css` may name a colour.
 *
 * Every theme overrides the same keys, so a theme cannot half-apply and leave
 * a page wearing two palettes. `olive` reproduces what `globals.css` already
 * declares, which is what makes "no theme chosen" and "the default theme"
 * identical rather than merely similar.
 *
 * **Contrast is not a matter of taste here.** `npm run audit` fails the build
 * on any WCAG AA failure, so `brandText` must clear 4.5:1 on white and `ink`
 * and `muted` must clear it on `bg`. `scripts/theme-contrast.mjs` checks all
 * every one; a theme that fails it is not a theme, it is a bug with a name.
 * `brand` is the fill — buttons and blocks, white text on top — and is
 * allowed to be lighter than `brandText`, exactly as brand-500 and brand-600
 * differ today.
 */

import { composite, contrast, darkNeutrals, darkRamp, hueOf, neonFor, ramp, rotated, tagFills, tagsFor, type Ramp } from "./palette.ts";
import { AURORA_ALPHA } from "./motion-choices.ts";

export type ThemeFont = {
  /** The CSS variable the family is bound to, declared in lib/fonts.ts. */
  variable: string;
  /** Shown in the admin picker. */
  label: string;
};

export type Theme = {
  id: string;
  name: string;
  /** One line in the admin picker: what this direction is for. */
  note: string;
  colors: {
    brand50: string; brand100: string; brand200: string; brand300: string;
    brand400: string; brand500: string; brand600: string; brand700: string;
    brand800: string; brand900: string;
    ink: string; ink2: string; muted: string; faint: string;
    surface: string; surface2: string; page: string; card: string; line: string; lineStrong: string;
    brandInk: string;
    /** Text on a brand fill. Absent on a legacy theme means white; dark derives it. */
    brandOn?: string;
    dark: string; dark2: string; darkLine: string; darkInk: string; darkMuted: string;
  };
  fonts: { display: ThemeFont; body: ThemeFont; mono: ThemeFont };
  /**
   * The two companion ramps. A generated theme carries its own; a legacy
   * theme leaves them out and `expand()` derives them by hue rotation, so
   * the tokens always exist and nothing on the site can render unstyled.
   */
  secondary?: Ramp;
  accent?: Ramp;
  /** The five colours a preset was generated from, so the editor can open it. */
  inputs?: PaletteInputs;
};

/** What the custom editor collects. Fonts are ids from `lib/fonts.ts`. */
export type PaletteInputs = {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  fontDisplay: string;
  fontBody: string;
};

const INTER = { variable: "--font-inter", label: "Inter" };
const MONO = { variable: "--font-jetbrains", label: "JetBrains Mono" };

export const THEMES: Theme[] = [
  {
    id: "olive",
    name: "Olive Field",
    note: "The current identity — warm neutrals under a field-olive brand, derived from the logo.",
    colors: {
      brand50: "#f4f6ec", brand100: "#e6ebd4", brand200: "#cfd9b0", brand300: "#b0c184",
      brand400: "#8fa65e", brand500: "#6f8641", brand600: "#4a5a2a", brand700: "#3d4a23",
      brand800: "#313b1e", brand900: "#22290f",
      ink: "#12130f", ink2: "#2a2c25", muted: "#55584d", faint: "#6b6d61",
      page: "#ffffff", card: "#ffffff", brandInk: "#4a5a2a",
      surface: "#fafaf7", surface2: "#f4f4ef", line: "#ecece6", lineStrong: "#e0e0d8",
      dark: "#12140d", dark2: "#1b1e14", darkLine: "#2a2e20", darkInk: "#f6f7f2", darkMuted: "#9ba095",
    },
    fonts: { display: { variable: "--font-instrument", label: "Instrument Sans" }, body: INTER, mono: MONO },
  },
];

/**
 * The dark palette for a theme, derived from that theme's own hue.
 *
 * This used to be one fixed set of olive-grey neutrals shared by every theme
 * — argued for as "ten bespoke dark palettes is ten times the work" — and
 * it meant a blue theme's dark mode had green-grey tints under blue buttons.
 * `darkNeutrals()` takes the brand's hue at near-zero chroma, so the work is
 * done once for all of them and the tint follows the theme.
 *
 * Two mappings are not what they look like. `card` is *lighter* than the
 * page, not darker: a dark interface separates a panel by lifting it. And
 * `brandInk` takes the theme's **300** step, not its 600 — coloured text in
 * dark has to be a light tint, which is the whole reason the role was split
 * out of `brand-600`. `darkRamp()` raises that step's chroma above the light
 * one's: a tint that would look chalky on white looks lit on near-black.
 */
export function darkScheme(c: Theme["colors"]): Theme["colors"] {
  const n = darkNeutrals(hueOf(c.brand600));
  const r = darkRamp(rampOf(c), n.card);

  return {
    ...c,
    ...n,
    brand50: r[50], brand100: r[100], brand200: r[200],
    brand300: r[300], brand400: r[400], brand500: r[500],
    brand600: r[600], brand700: r[700],
    brandInk: r.ink,
    brandOn: r.on,
  };
}

/** A legacy theme's brand keys as a `Ramp`, so the generator's dark rule can read them. */
function rampOf(c: Theme["colors"]): Ramp {
  return {
    50: c.brand50, 100: c.brand100, 200: c.brand200, 300: c.brand300, 400: c.brand400,
    500: c.brand500, 600: c.brand600, 700: c.brand700, 800: c.brand800, 900: c.brand900,
    ink: c.brandInk,
    on: c.brandOn ?? "#ffffff",
  };
}

/** A legacy theme by id, or null. Presets and custom palettes live in `lib/presets.ts`. */
export function legacyThemeById(id: string | null | undefined): Theme | null {
  return THEMES.find((t) => t.id === id) ?? null;
}

/**
 * The theme as CSS custom properties, for a `<style>` in the document head.
 *
 * These are the same names `@theme` declares in globals.css, so every existing
 * `bg-brand-600` / `text-muted` utility picks the override up without a single
 * component changing. Emitted on `:root` so it beats the `@theme` defaults on
 * source order without needing specificity or `!important`.
 */
export type Scheme = "light" | "dark";

/** A theme's colours as they render under a given scheme. */
export function paletteFor(theme: Theme, scheme: Scheme): Theme["colors"] {
  return scheme === "dark" ? darkScheme(theme.colors) : theme.colors;
}

/**
 * Everything a scheme needs beyond the 26 base keys: the two companion ramps
 * and the twelve identity hues, each as it reads under that scheme.
 *
 * A legacy theme names no secondary or accent, so they are rotated off its
 * brand — +30° is the neighbour, +150° the near-complement — which keeps the
 * tokens present on every theme rather than only the generated ones. The
 * neon hues are re-tuned against *this* palette's `surface-2`; they were
 * tuned once against olive and held their floor only there. The tag colours
 * are the same hues walked against `card` to a text floor — see `tagsFor`.
 */
export function expand(theme: Theme, scheme: Scheme): { secondary: Ramp; accent: Ramp; neon: string[]; tags: string[] } {
  const light = paletteFor(theme, "light");
  const secondary = theme.secondary ?? ramp(rotated(light.brand600, 30), { card: light.card });
  const accent = theme.accent ?? ramp(rotated(light.brand600, 150), { card: light.card });
  const c = paletteFor(theme, scheme);

  return scheme === "dark"
    ? { secondary: darkRamp(secondary, c.card), accent: darkRamp(accent, c.card), neon: neonFor(c.surface2, "dark"), tags: tagsFor(c.card) }
    : { secondary, accent, neon: neonFor(c.surface2, "light"), tags: tagsFor(c.card) };
}

function rampPairs(prefix: string, r: Ramp): [string, string][] {
  return [
    [`--color-${prefix}-50`, r[50]], [`--color-${prefix}-100`, r[100]],
    [`--color-${prefix}-200`, r[200]], [`--color-${prefix}-300`, r[300]],
    [`--color-${prefix}-400`, r[400]], [`--color-${prefix}-500`, r[500]],
    [`--color-${prefix}-600`, r[600]], [`--color-${prefix}-700`, r[700]],
    [`--color-${prefix}-800`, r[800]], [`--color-${prefix}-900`, r[900]],
    [`--color-${prefix}-ink`, r.ink],
    [`--color-${prefix}-on`, r.on],
  ];
}

/**
 * The theme as custom-property pairs — what `themeCss()` serialises, and what
 * the settings picker sets as inline `style` on a preview wrapper so real
 * components render inside the palette being chosen.
 */
export function themeVars(theme: Theme, scheme: Scheme = "light"): Record<string, string> {
  const c = paletteFor(theme, scheme);
  const x = expand(theme, scheme);
  const pairs: [string, string][] = [
    ["--color-brand-50", c.brand50], ["--color-brand-100", c.brand100],
    ["--color-brand-200", c.brand200], ["--color-brand-300", c.brand300],
    ["--color-brand-400", c.brand400], ["--color-brand-500", c.brand500],
    ["--color-brand-600", c.brand600], ["--color-brand-700", c.brand700],
    ["--color-brand-800", c.brand800], ["--color-brand-900", c.brand900],
    ["--color-ink", c.ink], ["--color-ink-2", c.ink2],
    ["--color-muted", c.muted], ["--color-faint", c.faint],
    ["--color-surface", c.surface], ["--color-surface-2", c.surface2],
    ["--color-page", c.page], ["--color-card", c.card], ["--color-brand-ink", c.brandInk],
    ["--color-brand-on", c.brandOn ?? "#ffffff"],
    ["--color-line", c.line], ["--color-line-strong", c.lineStrong],
    ["--color-dark", c.dark], ["--color-dark-2", c.dark2],
    ["--color-dark-line", c.darkLine], ["--color-dark-ink", c.darkInk],
    ["--color-dark-muted", c.darkMuted],
    ...rampPairs("secondary", x.secondary),
    ...rampPairs("accent", x.accent),
    ...x.neon.map((hex, i): [string, string] => [`--color-neon-${i + 1}`, hex]),
    ...x.tags.map((hex, i): [string, string] => [`--color-tag-${i + 1}`, hex]),
    ...tagFills().map((hex, i): [string, string] => [`--color-tag-fill-${i + 1}`, hex]),
    ["--aurora-alpha", String(auroraAlpha(theme, scheme))],
    ["--font-display", `var(${theme.fonts.display.variable})`],
    ["--font-sans", `var(${theme.fonts.body.variable})`],
    ["--font-mono", `var(${theme.fonts.mono.variable})`],
  ];

  return Object.fromEntries(pairs);
}

/*
 * The lede on the closing CTA card, a literal in home/sections.tsx on a band
 * that never inverts. Named here because it is one of the texts the aurora
 * alpha is bounded against.
 */
const CTA_LEDE = "#cdd6bb";

/**
 * The aurora backdrop's opacity for this theme and scheme: the largest step
 * at or below `AURORA_ALPHA[scheme]` at which every text token the three
 * hosts render still clears 4.5:1 over every tint, composited over the ground
 * it sits on. Derived per theme for the reason every other token is — the
 * hand-tuned legacy themes put `brand-ink` at exactly 4.5:1 on white, so no
 * single opacity holds for all of them, and a wash that cannot be made safe
 * for a palette is turned off for that palette (0) rather than shipped at a
 * number somebody looked at once. `npm run themes` reads the emitted value
 * back and checks the same pairs, so the two cannot drift.
 */
export function auroraAlpha(theme: Theme, scheme: Scheme): number {
  const c = paletteFor(theme, scheme);
  const x = expand(theme, scheme);
  const light = [c.brand300, x.secondary[300], x.accent[300]];
  const deep = [c.brand500, x.secondary[500], x.accent[500]];
  const passes = (alpha: number) =>
    light.every((tint) =>
      contrast(c.ink, composite(tint, c.page, alpha)) >= 4.5
      && contrast(c.muted, composite(tint, c.page, alpha)) >= 4.5
      && contrast(c.brandInk, composite(tint, c.page, alpha)) >= 4.5
      && contrast(c.ink, composite(tint, c.brand50, alpha)) >= 4.5
      && contrast(c.muted, composite(tint, c.brand50, alpha)) >= 4.5)
    && deep.every((tint) =>
      contrast(c.darkInk, composite(tint, c.dark, alpha)) >= 4.5
      && contrast(c.darkMuted, composite(tint, c.dark, alpha)) >= 4.5
      && contrast(c.brand300, composite(tint, c.dark, alpha)) >= 4.5
      && contrast("#ffffff", composite(tint, c.brand900, alpha)) >= 4.5
      && contrast(CTA_LEDE, composite(tint, c.brand900, alpha)) >= 4.5);
  for (let a = AURORA_ALPHA[scheme]; a >= 0.06; a = Math.round((a - 0.02) * 100) / 100) {
    if (passes(a)) return a;
  }
  return 0;
}

export function themeCss(theme: Theme, scheme: Scheme = "light"): string {
  return `:root{${Object.entries(themeVars(theme, scheme)).map(([k, v]) => `${k}:${v}`).join(";")}}`;
}
