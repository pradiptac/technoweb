/**
 * How the public site and the portal move — six settings, one list each.
 *
 * Plain data, no client imports, so the settings picker and the area
 * layouts can both read it. Every id here is a value the `motion` settings
 * group stores; the API checks only the *shape* of an id (the fonts' rule),
 * and `motionFor()` falls back per field to the default for anything it
 * does not know — so a value typed straight into the database cannot leave
 * a page half-animated, and there is no second list on the far side of the
 * wire to keep in step.
 *
 * The **first entry of every list is the default and is the site as it
 * moved before the group existed.** An install that never opens the Motion
 * tab changes nothing on deploy.
 *
 * The choices are applied as `data-motion-*` attributes on the area
 * layouts' wrappers (`.public-site` and the portal's), never on `<html>`:
 * every rule in globals.css is keyed on an ancestor, so the admin console —
 * which stamps nothing — is excluded by construction, and a picker tile can
 * carry the same attribute to preview the real rule.
 */
export type MotionChoice = { id: string; label: string; note: string };

export const REVEALS: MotionChoice[] = [
  { id: "lift", label: "Lift", note: "Sections rise 20px as they fade in. The site as it has always moved." },
  { id: "float", label: "Float", note: "A longer, slower rise — 40px over 800ms. More presence on a long page." },
  { id: "fade", label: "Fade", note: "Opacity only. The calmest option that still reveals." },
  { id: "zoom", label: "Zoom", note: "Each section settles in from 96% as it fades." },
  { id: "blur", label: "Focus", note: "Each section sharpens as it arrives. The most cinematic, and the heaviest on a phone." },
  { id: "none", label: "None", note: "Everything is simply there. What reduced-motion visitors always get." },
];

export const BUTTONS: MotionChoice[] = [
  { id: "lift", label: "Lift", note: "A one-pixel rise on hover. The current behaviour." },
  { id: "glow", label: "Glow", note: "A soft ring in the brand colour blooms around the button on hover." },
  { id: "scale", label: "Scale", note: "Grows to 103% on hover and presses to 97%." },
  { id: "shine", label: "Shine", note: "A highlight sweeps across the face on hover." },
  { id: "ripple", label: "Ripple", note: "A pulse spreads from the centre when pressed." },
  { id: "flat", label: "Flat", note: "Colour change only. No movement at all." },
];

export const PAGES: MotionChoice[] = [
  { id: "none", label: "None", note: "The next page paints at once. The current behaviour." },
  { id: "fade", label: "Fade", note: "Each page fades in over 320ms." },
  { id: "rise", label: "Rise", note: "Each page fades in while rising 12px." },
  { id: "zoom", label: "Zoom", note: "Each page settles in from 98.5%." },
];

export const LOADERS: MotionChoice[] = [
  { id: "none", label: "None", note: "No indicator while the next page loads. The current behaviour." },
  { id: "bar", label: "Bar", note: "A thin brand-coloured bar creeps across the top of the page and completes on arrival." },
  { id: "pulse", label: "Pulse", note: "A full-width line at the top pulses until the page arrives." },
];

export type HeroVariant = "grid" | "aurora" | "dots" | "none";

export const HEROS: (MotionChoice & { id: HeroVariant })[] = [
  { id: "grid", label: "Grid", note: "The blueprint grid behind the hero and page headings. The current look." },
  { id: "aurora", label: "Aurora", note: "Three soft washes in the theme's hues drift slowly behind the heading." },
  { id: "dots", label: "Dots", note: "A fine dot field, fading out toward the bottom." },
  { id: "none", label: "Plain", note: "No backdrop at all." },
];

/**
 * The aurora backdrop's *ceiling* opacity per scheme. The value actually
 * painted is derived per theme by `auroraAlpha()` in lib/themes.ts — this
 * is where the search starts, and it is lower in dark because a tint that
 * is a pale wash over white is a mid-tone slab over near-black. Plain data
 * here so themes.ts can import it without a cycle.
 */
export const AURORA_ALPHA = { light: 0.32, dark: 0.16 } as const;

export const SPLASH_NOTE =
  "On the first page of a session the logo settles in over the page colour for under a second, then never again that session. Never shown to reduced-motion visitors or to crawlers.";

export type Motion = {
  reveal: string;
  buttons: string;
  page: string;
  loader: string;
  splash: boolean;
  hero: HeroVariant;
};

const pick = (list: MotionChoice[], id: string | undefined): string =>
  list.some((c) => c.id === id) ? (id as string) : list[0].id;

/** The six choices, each resolved with its default for an unknown or absent id. */
export function motionFor(settings: Record<string, string | undefined>): Motion {
  return {
    reveal: pick(REVEALS, settings.motion_reveal),
    buttons: pick(BUTTONS, settings.motion_buttons),
    page: pick(PAGES, settings.motion_page),
    loader: pick(LOADERS, settings.motion_loader),
    splash: settings.motion_splash === "1",
    hero: pick(HEROS, settings.motion_hero) as HeroVariant,
  };
}

/**
 * The attributes an area layout stamps on its wrapper. The loader and the
 * splash are components rather than CSS, so they are not here.
 */
export function motionAttrs(m: Motion): Record<string, string> {
  return {
    "data-motion-reveal": m.reveal,
    "data-motion-buttons": m.buttons,
    "data-motion-page": m.page,
    "data-motion-hero": m.hero,
  };
}
