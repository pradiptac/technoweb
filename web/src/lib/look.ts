import type { SiteSettings } from "@/lib/site-settings";

/**
 * Corners and breathing room (2026-10-05, docs/look-and-feel.md): two
 * `appearance` settings, `theme_radius` and `theme_density`, checked by the
 * API against the same lists (`SettingController::RADII`/`DENSITIES`).
 *
 * The first entry of each is what the site drew before the controls existed,
 * and it stamps **nothing** — so an install that never touches them renders
 * byte for byte as it did, the rule `SectionBg` keeps for an untouched
 * section. Anything else becomes a `data-radius` / `data-density` attribute
 * on the area's wrapper, where `globals.css` re-points the radius tokens and
 * the section paddings for everything inside. The console stamps neither:
 * its density is deliberate.
 */
export type Radius = "soft" | "sharp" | "round";
export type Density = "comfortable" | "compact" | "airy";
/** How a card sits on the page (`theme_surface`, 0.103.0). */
export type Surface = "flat" | "elevated" | "outline";

export const RADII: readonly Radius[] = ["soft", "sharp", "round"];
export const DENSITIES: readonly Density[] = ["comfortable", "compact", "airy"];
export const SURFACES: readonly Surface[] = ["flat", "elevated", "outline"];

export type Look = { radius: Radius; density: Density; surface: Surface };

export function lookFor(settings: SiteSettings): Look {
  const r = settings.theme_radius as Radius | undefined;
  const d = settings.theme_density as Density | undefined;
  const s = settings.theme_surface as Surface | undefined;
  return {
    radius: r && RADII.includes(r) ? r : "soft",
    density: d && DENSITIES.includes(d) ? d : "comfortable",
    surface: s && SURFACES.includes(s) ? s : "flat",
  };
}

/** The wrapper's attributes: none at all for the defaults. */
export function lookAttrs(look: Look): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (look.radius !== "soft") attrs["data-radius"] = look.radius;
  if (look.density !== "comfortable") attrs["data-density"] = look.density;
  if (look.surface !== "flat") attrs["data-surface"] = look.surface;
  return attrs;
}

/**
 * Looks: a palette, two fonts, corners and spacing chosen together, so
 * "make it feel corporate" is one press on Site → Settings → Appearance.
 * Each is a starting point the editor can nudge before saving — the palette
 * presets' own rule. Ids are the palette presets' (`lib/presets.ts`) and the
 * fonts' (`lib/font-choices.ts`); `look-presets` in the theme gate would fail
 * on a typo, and so does `tsc` through the types below.
 */
export type LookPreset = {
  id: string;
  label: string;
  blurb: string;
  palette: string;
  fontDisplay: string;
  fontBody: string;
  radius: Radius;
  density: Density;
  surface: Surface;
};

export const LOOK_PRESETS: readonly LookPreset[] = [
  { id: "corporate", label: "Corporate", blurb: "Navy and steel, IBM Plex, square corners. Reads like an enterprise.", palette: "corporate", fontDisplay: "ibm-plex", fontBody: "ibm-plex", radius: "sharp", density: "comfortable", surface: "outline" },
  { id: "modern", label: "Modern", blurb: "Bright blue, Plus Jakarta, round corners, room to breathe.", palette: "velora-blue", fontDisplay: "plus-jakarta", fontBody: "inter", radius: "round", density: "airy", surface: "elevated" },
  { id: "bold", label: "Bold", blurb: "Deep violet, Outfit headlines, generous curves. Confident.", palette: "velora-violet", fontDisplay: "outfit", fontBody: "dm-sans", radius: "round", density: "comfortable", surface: "elevated" },
  { id: "calm", label: "Calm", blurb: "Slate and green, Manrope, soft corners, airy sections.", palette: "slate", fontDisplay: "manrope", fontBody: "manrope", radius: "soft", density: "airy", surface: "flat" },
  { id: "editorial", label: "Editorial", blurb: "Warm cream, a serif headline, tight and text-led.", palette: "canvas", fontDisplay: "fraunces", fontBody: "inter", radius: "sharp", density: "compact", surface: "outline" },
];
