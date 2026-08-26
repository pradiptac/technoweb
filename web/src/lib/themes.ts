/**
 * Fifteen visual directions for the site, each a set of token overrides.
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
    dark: string; dark2: string; darkLine: string; darkInk: string; darkMuted: string;
  };
  fonts: { display: ThemeFont; body: ThemeFont; mono: ThemeFont };
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
  {
    id: "indigo",
    name: "Signal Indigo",
    note: "Software-forward and confident. Reads as a modern platform rather than a contractor.",
    colors: {
      brand50: "#f1f0fe", brand100: "#e3e1fd", brand200: "#c8c4fb", brand300: "#a49df7",
      brand400: "#7c5cf5", brand500: "#5b45e0", brand600: "#4338ca", brand700: "#3a30b0",
      brand800: "#2e278c", brand900: "#1d1a5c",
      ink: "#101018", ink2: "#26262f", muted: "#575765", faint: "#6a6a79",
      page: "#ffffff", card: "#ffffff", brandInk: "#4338ca",
      surface: "#fbfbfd", surface2: "#f3f3f8", line: "#ececf2", lineStrong: "#e0e0ea",
      dark: "#0e0e16", dark2: "#181822", darkLine: "#282836", darkInk: "#f3f3f7", darkMuted: "#a0a0b2",
    },
    fonts: { display: { variable: "--font-inter-tight", label: "Inter Tight" }, body: INTER, mono: MONO },
  },
  {
    id: "teal",
    name: "Fiber Teal",
    note: "Infrastructure-native. Cool and precise without landing on generic networking blue.",
    colors: {
      brand50: "#effbf9", brand100: "#d7f5f0", brand200: "#a9e8df", brand300: "#6fd4c7",
      brand400: "#2bb3a3", brand500: "#12907f", brand600: "#0f766e", brand700: "#0c605a",
      brand800: "#0a4d48", brand900: "#06302d",
      ink: "#0a1a20", ink2: "#1e3038", muted: "#446069", faint: "#587480",
      page: "#ffffff", card: "#ffffff", brandInk: "#0f766e",
      surface: "#f8fbfb", surface2: "#eef5f5", line: "#e2eced", lineStrong: "#d5e3e5",
      dark: "#06171c", dark2: "#0d232a", darkLine: "#173840", darkInk: "#eaf6f6", darkMuted: "#93aeb4",
    },
    fonts: { display: { variable: "--font-sora", label: "Sora" }, body: INTER, mono: MONO },
  },
  {
    id: "graphite",
    name: "Graphite Copper",
    note: "Near-monochrome with a single warm accent. The most editorial, and the hardest to copy.",
    colors: {
      brand50: "#fdf4ec", brand100: "#f9e6d4", brand200: "#f0cba8", brand300: "#e0a86f",
      brand400: "#cd8036", brand500: "#b06615", brand600: "#8f5210", brand700: "#75430d",
      brand800: "#5c350b", brand900: "#3a2107",
      ink: "#16150f", ink2: "#2c2a22", muted: "#57564e", faint: "#6d6c62",
      page: "#ffffff", card: "#ffffff", brandInk: "#8f5210",
      surface: "#ffffff", surface2: "#f6f5f1", line: "#eae9e4", lineStrong: "#e2e1da",
      dark: "#121110", dark2: "#1d1b19", darkLine: "#2f2c29", darkInk: "#f6f5f1", darkMuted: "#a3a199",
    },
    fonts: { display: { variable: "--font-instrument", label: "Instrument Sans" }, body: INTER, mono: MONO },
  },
  {
    id: "harbour",
    name: "Harbour Blue",
    note: "Corporate and calm. The safest direction for a tender document or a hospital procurement.",
    colors: {
      brand50: "#eff5ff", brand100: "#dbe8fe", brand200: "#bfd4fd", brand300: "#93b4fb",
      brand400: "#608df6", brand500: "#3b6ae4", brand600: "#2450bd", brand700: "#1e429b",
      brand800: "#1a367c", brand900: "#12224d",
      ink: "#0d1520", ink2: "#22303f", muted: "#4a5b6e", faint: "#5f7185",
      page: "#ffffff", card: "#ffffff", brandInk: "#2450bd",
      surface: "#f9fbfd", surface2: "#f0f4f9", line: "#e6ecf3", lineStrong: "#d9e2ec",
      dark: "#0a1220", dark2: "#131d2d", darkLine: "#22314a", darkInk: "#f1f5fa", darkMuted: "#97a7bb",
    },
    fonts: { display: { variable: "--font-manrope", label: "Manrope" }, body: INTER, mono: MONO },
  },
  {
    id: "ember",
    name: "Slate Ember",
    note: "Cool slate with a hot accent. Energetic — best where the site has to feel like a product.",
    colors: {
      brand50: "#fff3ed", brand100: "#ffe3d4", brand200: "#fdc3a6", brand300: "#f89a6d",
      brand400: "#ef6c33", brand500: "#d24e13", brand600: "#ab3d0d", brand700: "#8b320b",
      brand800: "#6d2809", brand900: "#451906",
      ink: "#12151a", ink2: "#282d36", muted: "#505863", faint: "#666f7c",
      page: "#ffffff", card: "#ffffff", brandInk: "#ab3d0d",
      surface: "#fafbfc", surface2: "#f1f3f6", line: "#e9ecf0", lineStrong: "#dde1e8",
      dark: "#0f1216", dark2: "#191d23", darkLine: "#2a2f38", darkInk: "#f4f6f8", darkMuted: "#9aa3af",
    },
    fonts: { display: { variable: "--font-space-grotesk", label: "Space Grotesk" }, body: INTER, mono: MONO },
  },
  {
    id: "forest",
    name: "Forest Ink",
    note: "A serif display over deep green. Reads established and long-standing rather than new.",
    colors: {
      brand50: "#eef7f0", brand100: "#d6ecdb", brand200: "#a9d8b6", brand300: "#71bd87",
      brand400: "#3d9a5b", brand500: "#237a41", brand600: "#186234", brand700: "#14512b",
      brand800: "#104022", brand900: "#0a2915",
      ink: "#101711", ink2: "#25302a", muted: "#4b5a51", faint: "#5f6f65",
      page: "#ffffff", card: "#ffffff", brandInk: "#186234",
      surface: "#f9fbf9", surface2: "#eff4f0", line: "#e6ede8", lineStrong: "#d8e2db",
      dark: "#0b120d", dark2: "#141d17", darkLine: "#233026", darkInk: "#f2f7f3", darkMuted: "#98a89e",
    },
    fonts: { display: { variable: "--font-fraunces", label: "Fraunces" }, body: INTER, mono: MONO },
  },
  {
    id: "cobalt",
    name: "Cobalt Steel",
    note: "Technical and neutral, set in IBM Plex — the most at home next to a rack diagram.",
    colors: {
      brand50: "#eef4ff", brand100: "#dae7ff", brand200: "#b8d0ff", brand300: "#88aeff",
      brand400: "#5484f8", brand500: "#3160e6", brand600: "#1f47bd", brand700: "#1a3c9e",
      brand800: "#16317f", brand900: "#0e1f52",
      ink: "#0f1319", ink2: "#242b34", muted: "#4d5561", faint: "#626b78",
      page: "#ffffff", card: "#ffffff", brandInk: "#1f47bd",
      surface: "#f8fafc", surface2: "#eff2f6", line: "#e6eaf0", lineStrong: "#d8dee6",
      dark: "#0c1016", dark2: "#161b23", darkLine: "#252c37", darkInk: "#f2f5f9", darkMuted: "#98a2b1",
    },
    fonts: {
      display: { variable: "--font-ibm-plex", label: "IBM Plex Sans" },
      body: { variable: "--font-ibm-plex", label: "IBM Plex Sans" },
      mono: MONO,
    },
  },
  {
    id: "plum",
    name: "Plum Signal",
    note: "Distinctive without being loud. The direction least likely to be mistaken for a competitor.",
    colors: {
      brand50: "#faf2fd", brand100: "#f3e2fa", brand200: "#e6c4f5", brand300: "#d19bec",
      brand400: "#b56add", brand500: "#9648c2", brand600: "#7a2f9f", brand700: "#652783",
      brand800: "#511f69", brand900: "#341343",
      ink: "#141018", ink2: "#2b2431", muted: "#575060", faint: "#6c6476",
      page: "#ffffff", card: "#ffffff", brandInk: "#7a2f9f",
      surface: "#fbfafc", surface2: "#f4f1f7", line: "#ece8f0", lineStrong: "#e1dce7",
      dark: "#120e17", dark2: "#1c1723", darkLine: "#2c2436", darkInk: "#f6f3f8", darkMuted: "#a49bad",
    },
    fonts: { display: { variable: "--font-manrope", label: "Manrope" }, body: INTER, mono: MONO },
  },
  {
    id: "basalt",
    name: "Sand Basalt",
    note: "Warm sand against near-black. Quiet, tactile, and the closest to print.",
    colors: {
      brand50: "#faf5ee", brand100: "#f3e8d8", brand200: "#e6d0b1", brand300: "#d3b183",
      brand400: "#b98d51", brand500: "#9a6f34", brand600: "#7d5828", brand700: "#674921",
      brand800: "#523a1a", brand900: "#342410",
      ink: "#161412", ink2: "#2d2a26", muted: "#57524b", faint: "#6c665e",
      page: "#ffffff", card: "#ffffff", brandInk: "#7d5828",
      surface: "#fbfaf7", surface2: "#f4f1ec", line: "#ebe7e0", lineStrong: "#ded9d0",
      dark: "#131211", dark2: "#1e1c1a", darkLine: "#2e2b28", darkInk: "#f7f5f1", darkMuted: "#a19a91",
    },
    fonts: { display: { variable: "--font-space-grotesk", label: "Space Grotesk" }, body: INTER, mono: MONO },
  },

  /*
   * The bright five.
   *
   * A fluorescent colour is light and saturated, and light saturated colours
   * fail as text -- #39ff14 on white is 1.4:1. So the hue stays fluorescent
   * where it is a *fill* or sits on a dark band (brand 300-500, which is what
   * buttons, chips and the whole dark scheme wear) and the text steps are deep
   * versions of the same hue. That is the only way "bright" and "legible" are
   * both true, and it is why `brandInk` here looks nothing like `brand400`.
   *
   * The values were searched, not picked: each ramp was walked until it cleared
   * every pairing scripts/theme-contrast.mjs checks, in both schemes. Neon
   * chosen by eye does not survive that gate.
   */

  {
    id: "acid",
    name: "Acid Lime",
    note: "Fluorescent lime over near-black. Loud, technical, hard to ignore.",
    colors: {
      brand50: "#f9ffee", brand100: "#f1ffd1", brand200: "#d1ff66", brand300: "#bfff29",
      brand400: "#abf500", brand500: "#8fcc00", brand600: "#547703", brand700: "#435e02",
      brand800: "#2e4102", brand900: "#192301",
      ink: "#131410", ink2: "#2d2f28", muted: "#595d51", faint: "#6e7364",
      page: "#ffffff", card: "#ffffff", brandInk: "#547703",
      surface: "#fafbf9", surface2: "#f6f7f3", line: "#eef0ea", lineStrong: "#e2e5dc",
      dark: "#131410", dark2: "#1b1d16", darkLine: "#303328", darkInk: "#f5f6f4", darkMuted: "#a6ab9c",
    },
    fonts: { display: { variable: "--font-space-grotesk", label: "Space Grotesk" }, body: INTER, mono: MONO },
  },
  {
    id: "electric",
    name: "Electric Cyan",
    note: "Cold neon cyan. Reads as instrumentation and live monitoring.",
    colors: {
      brand50: "#eefcff", brand100: "#d1f9ff", brand200: "#66ebff", brand300: "#29e2ff",
      brand400: "#00d4f5", brand500: "#00b1cc", brand600: "#037587", brand700: "#02606e",
      brand800: "#024650", brand900: "#012b32",
      ink: "#101314", ink2: "#282e2f", muted: "#515b5d", faint: "#647173",
      page: "#ffffff", card: "#ffffff", brandInk: "#037587",
      surface: "#f9fbfb", surface2: "#f3f6f7", line: "#eaeff0", lineStrong: "#dce4e5",
      dark: "#101314", dark2: "#161c1d", darkLine: "#283233", darkInk: "#f4f5f6", darkMuted: "#9ca9ab",
    },
    fonts: { display: { variable: "--font-sora", label: "Sora" }, body: INTER, mono: MONO },
  },
  {
    id: "hotwire",
    name: "Hotwire Magenta",
    note: "Fluorescent magenta. The most consumer-facing of the bright set.",
    colors: {
      brand50: "#ffeef8", brand100: "#ffd1ee", brand200: "#ff66c7", brand300: "#ff29b0",
      brand400: "#f5009b", brand500: "#cc0081", brand600: "#cc0583", brand700: "#a40469",
      brand800: "#860356", brand900: "#680343",
      ink: "#141012", ink2: "#2f282c", muted: "#5d5158", faint: "#73646d",
      page: "#ffffff", card: "#ffffff", brandInk: "#cc0583",
      surface: "#fbf9fa", surface2: "#f7f3f5", line: "#f0eaee", lineStrong: "#e5dce2",
      dark: "#141012", dark2: "#1d161a", darkLine: "#33282f", darkInk: "#f6f4f5", darkMuted: "#ab9ca5",
    },
    fonts: { display: { variable: "--font-manrope", label: "Manrope" }, body: INTER, mono: MONO },
  },
  {
    id: "flare",
    name: "Safety Flare",
    note: "High-visibility orange, borrowed from site signage and hi-vis.",
    colors: {
      brand50: "#fff4ed", brand100: "#ffe3d1", brand200: "#ffa366", brand300: "#ff7e29",
      brand400: "#f56200", brand500: "#cc5200", brand600: "#b54a03", brand700: "#923c02",
      brand800: "#742f02", brand900: "#552301",
      ink: "#141110", ink2: "#2f2b28", muted: "#5d5551", faint: "#736a64",
      page: "#ffffff", card: "#ffffff", brandInk: "#b54a03",
      surface: "#fbfaf9", surface2: "#f7f4f3", line: "#f0edea", lineStrong: "#e5dfdc",
      dark: "#141110", dark2: "#1d1916", darkLine: "#332d28", darkInk: "#f6f5f4", darkMuted: "#aba29c",
    },
    fonts: { display: { variable: "--font-inter-tight", label: "Inter Tight" }, body: INTER, mono: MONO },
  },
  {
    id: "ultra",
    name: "Ultraviolet",
    note: "Neon violet on charcoal. Nocturnal, closest to a NOC screen.",
    colors: {
      brand50: "#f8eefe", brand100: "#edd1ff", brand200: "#d28fff", brand300: "#be5cff",
      brand400: "#a51fff", brand500: "#9300f5", brand600: "#9f1ef6", brand700: "#7f09ce",
      brand800: "#6d07b0", brand900: "#5b0693",
      ink: "#121014", ink2: "#2c282f", muted: "#58515d", faint: "#6d6473",
      page: "#ffffff", card: "#ffffff", brandInk: "#9d19f5",
      surface: "#faf9fb", surface2: "#f5f3f7", line: "#eeeaf0", lineStrong: "#e1dce5",
      dark: "#121014", dark2: "#1a161d", darkLine: "#2f2833", darkInk: "#f5f4f6", darkMuted: "#a59cab",
    },
    fonts: { display: { variable: "--font-space-grotesk", label: "Space Grotesk" }, body: INTER, mono: MONO },
  },
];

/**
 * One dark palette, shared by every theme, wearing that theme's brand.
 *
 * The neutrals are shared deliberately. Ten bespoke dark palettes is ten times
 * the design work and ten times the contrast surface to keep passing, for a
 * difference most people would not name — in dark, a page is mostly its
 * neutrals, and the brand is the accent that identifies it. That accent is
 * still per-theme, so Fiber Teal and Plum Signal are still distinguishable.
 *
 * Two mappings here are not what they look like:
 *
 * `card` is *lighter* than the page, not darker. A dark interface separates a
 * panel from its background by lifting it, because there is nothing below
 * near-black to go to.
 *
 * `brandInk` takes the theme's **300** step, not its 600. In light, coloured
 * text is a dark tint of the brand; in dark it has to be a light one, and this
 * is the whole reason the role was split out of `brand-600` in the first
 * place. `brand-600` stays the fill, where white text still sits on it.
 */
export function darkScheme(c: Theme["colors"]): Theme["colors"] {
  return {
    ...c,
    // The brand ramp is the theme's own — this is what keeps ten themes
    // distinguishable in dark without ten palettes.
    ink: "#f2f3ef",
    ink2: "#dcded6",
    muted: "#a4a89c",
    faint: "#949488",
    page: "#111310",
    surface: "#151613",
    surface2: "#1c1e1a",
    card: "#1a1c18",
    line: "#2a2d26",
    lineStrong: "#383b32",
    // The soft brand tints invert too: a `bg-brand-50` panel in dark must be a
    // dark brand wash, not a near-white one.
    brand50: "#1d2416",
    brand100: "#26301c",
    brandInk: c.brand300,
    // Dark bands sit *on* a dark page, so they can no longer be the darkest
    // thing on it. Lifted and given a stronger line, they read as a band
    // rather than as a hole.
    dark: "#101210",
    dark2: "#1a1c18",
    darkLine: "#33362e",
  };
}

export const DEFAULT_THEME = THEMES[0];

/** The chosen theme, or the default when the setting is unset or unknown. */
export function themeById(id: string | null | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? DEFAULT_THEME;
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

export function themeCss(theme: Theme, scheme: Scheme = "light"): string {
  const c = paletteFor(theme, scheme);
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
    ["--color-line", c.line], ["--color-line-strong", c.lineStrong],
    ["--color-dark", c.dark], ["--color-dark-2", c.dark2],
    ["--color-dark-line", c.darkLine], ["--color-dark-ink", c.darkInk],
    ["--color-dark-muted", c.darkMuted],
    ["--font-display", `var(${theme.fonts.display.variable})`],
    ["--font-sans", `var(${theme.fonts.body.variable})`],
    ["--font-mono", `var(${theme.fonts.mono.variable})`],
  ];

  return `:root{${pairs.map(([k, v]) => `${k}:${v}`).join(";")}}`;
}
