import { DEFAULT_BODY_FONT, DEFAULT_DISPLAY_FONT, MONO_FONT, fontFor } from "./font-choices.ts";
import { darkNeutrals, hueOf, lightNeutrals, ramp } from "./palette.ts";
import { legacyThemeById, type PaletteInputs, type Theme } from "./themes.ts";

/**
 * The prebuilt palettes — the house theme and the eight the brief drew — and
 * the one function that turns five colours into a theme.
 *
 * A preset is nothing but a saved set of inputs run through `generate()` —
 * the same call the custom editor makes — so "start from Ocean and nudge it"
 * is copying five hexes into five boxes, and a preset can never drift from
 * what custom colours would have produced. Each was generated, looked at in
 * both schemes, and kept; the note says what it is for.
 *
 * `technoware` reproduces today's olive brand so the default install looks
 * the same on the day this ships, and `olive` — the old default's id — is
 * aliased to it.
 */
export type Preset = { id: string; name: string; note: string; inputs: PaletteInputs };

const base = { background: "#ffffff", text: "#12130f", fontDisplay: DEFAULT_DISPLAY_FONT, fontBody: DEFAULT_BODY_FONT };

export const PRESETS: Preset[] = [
  {
    id: "technoware", name: "Technoware",
    note: "The house olive, with the gold the dashboard already uses as its accent.",
    inputs: { ...base, primary: "#6f8641", secondary: "#5b7a5e", accent: "#c9993c" },
  },
  {
    id: "ocean", name: "Ocean",
    note: "Sky, teal and violet. Cool and clean — networking and cloud.",
    inputs: { ...base, primary: "#0ea5e9", secondary: "#06b6d4", accent: "#8b5cf6" },
  },
  {
    id: "forest", name: "Forest",
    note: "Two greens and an amber. Grounded; reads as infrastructure.",
    inputs: { ...base, primary: "#16a34a", secondary: "#047857", accent: "#d97706" },
  },
  {
    id: "sunset", name: "Sunset",
    note: "Orange, red and pink. Loud on purpose — a retail shop, not a NOC.",
    inputs: { ...base, primary: "#f97316", secondary: "#ef4444", accent: "#ec4899" },
  },
  {
    id: "midnight", name: "Midnight",
    note: "Indigo, violet and pink. Software-forward; strongest in dark.",
    inputs: { ...base, primary: "#6366f1", secondary: "#8b5cf6", accent: "#ec4899" },
  },
  {
    id: "corporate", name: "Corporate",
    note: "Two blues and a green. The safest direction for a tender.",
    inputs: { ...base, primary: "#2563eb", secondary: "#3b82f6", accent: "#10b981" },
  },
  {
    id: "rose", name: "Rose",
    note: "Crimson, rose and violet. Warm and confident.",
    inputs: { ...base, primary: "#e11d48", secondary: "#f43f5e", accent: "#a855f7" },
  },
  {
    id: "slate", name: "Slate",
    note: "Two greys and a blue. The quietest of the set; the blue does the work.",
    inputs: { ...base, primary: "#475569", secondary: "#64748b", accent: "#3b82f6" },
  },
  {
    id: "emerald", name: "Emerald",
    note: "Two greens and an amber, brighter than Forest. Reads as growth.",
    inputs: { ...base, primary: "#059669", secondary: "#10b981", accent: "#f59e0b" },
  },
];

export const DEFAULT_PRESET = PRESETS[0];

export function presetById(id: string | null | undefined): Preset | null {
  return PRESETS.find((p) => p.id === id) ?? null;
}

const HEX = /^#[0-9a-f]{6}$/i;

export function isHex(v: unknown): v is string {
  return typeof v === "string" && HEX.test(v);
}

/**
 * Five colours and two fonts, into a full theme.
 *
 * The light neutrals come from the background and text; the dark bands
 * (`dark-*`, used on a light page) and the whole dark scheme come from the
 * primary's hue through `darkNeutrals()` — see `lib/palette.ts` for why
 * neither is a fixed grey any more.
 */
export function generate(inputs: PaletteInputs, id = "custom", name = "Custom"): Theme {
  const card = inputs.background;
  const brand = ramp(inputs.primary, { card });
  const secondary = ramp(inputs.secondary, { card });
  const accent = ramp(inputs.accent, { card });
  const hue = hueOf(inputs.primary);
  const n = lightNeutrals(inputs.background, inputs.text, hue);
  const d = darkNeutrals(hue);

  return {
    id, name,
    note: "Your own colours, with the shades adjusted so text stays readable.",
    colors: {
      brand50: brand[50], brand100: brand[100], brand200: brand[200], brand300: brand[300],
      brand400: brand[400], brand500: brand[500], brand600: brand[600], brand700: brand[700],
      brand800: brand[800], brand900: brand[900],
      brandInk: brand.ink,
      ...n,
      dark: d.dark, dark2: d.dark2, darkLine: d.darkLine, darkInk: d.darkInk, darkMuted: d.darkMuted,
    },
    fonts: {
      display: fontFor(inputs.fontDisplay, "display"),
      body: fontFor(inputs.fontBody, "body"),
      mono: MONO_FONT,
    },
    secondary,
    accent,
    inputs,
  };
}

/** The flat public settings map, as `getSiteSettings()` returns it. */
type SettingsLike = Record<string, string | undefined>;

/**
 * The theme an install has chosen, from its settings.
 *
 * `theme` is a preset id, a legacy theme id, or `custom`. Anything else —
 * and `olive`, the old default's id — is Technoware, the rule `themeById`
 * always followed: an unknown value falls back rather than half-applying.
 * A custom colour that is not a hex falls back to Technoware's for that
 * field alone, so one bad key cannot blank the site.
 *
 * The two font settings apply to every kind, legacy themes included: a font
 * is a choice about the site, not about a palette.
 */
export function themeFor(settings: SettingsLike): Theme {
  const id = settings.theme || DEFAULT_PRESET.id;
  const fontDisplay = settings.theme_font_display || undefined;
  const fontBody = settings.theme_font_body || undefined;

  if (id === "custom") {
    const d = DEFAULT_PRESET.inputs;
    return generate({
      primary: isHex(settings.theme_primary) ? settings.theme_primary : d.primary,
      secondary: isHex(settings.theme_secondary) ? settings.theme_secondary : d.secondary,
      accent: isHex(settings.theme_accent) ? settings.theme_accent : d.accent,
      background: isHex(settings.theme_background) ? settings.theme_background : d.background,
      text: isHex(settings.theme_text) ? settings.theme_text : d.text,
      fontDisplay: fontDisplay ?? d.fontDisplay,
      fontBody: fontBody ?? d.fontBody,
    });
  }

  const preset = presetById(id === "olive" ? DEFAULT_PRESET.id : id);
  if (preset) {
    const inputs = {
      ...preset.inputs,
      fontDisplay: fontDisplay ?? preset.inputs.fontDisplay,
      fontBody: fontBody ?? preset.inputs.fontBody,
    };
    const generated = generate(inputs, preset.id, preset.name);

    /*
     * The house preset keeps the hand-tuned olive ramp rather than the
     * generated one — they differ by a few points of lightness, and "the
     * default install looks the same on the day this ships" is a promise
     * about pixels. Its secondary and accent are generated like any other
     * preset's, because it never had them.
     */
    const house = preset.id === DEFAULT_PRESET.id ? legacyThemeById("olive") : null;

    return house
      ? { ...generated, colors: house.colors, note: preset.note }
      : { ...generated, note: preset.note };
  }

  const legacy = legacyThemeById(id);
  if (legacy) {
    return {
      ...legacy,
      fonts: {
        display: fontDisplay ? fontFor(fontDisplay, "display") : legacy.fonts.display,
        body: fontBody ? fontFor(fontBody, "body") : legacy.fonts.body,
        mono: legacy.fonts.mono,
      },
    };
  }

  return generate(DEFAULT_PRESET.inputs, DEFAULT_PRESET.id, DEFAULT_PRESET.name);
}
