/**
 * How the public site and the portal move — seven settings, one list each.
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
  { id: "assemble", label: "Assemble", note: "A section's pieces — heading, text, cards, pictures — arrive one after another from slightly smaller and tilted, and click into place." },
  { id: "cascade", label: "Cascade", note: "A section's pieces rise and fade in one after another, top to bottom." },
  { id: "unfold", label: "Unfold", note: "Each section is uncovered from the top down, like a curtain lifting." },
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

/**
 * What a card does under the pointer (`motion_cards`, 0.103.0). `lift` is
 * the hover the site always had. `tilt` follows the pointer in 3-D through
 * `components/ui/card-tilt.tsx`, the only one that needs JavaScript; every
 * one is a fine-pointer, motion-allowed effect — on a phone a card simply
 * sits there, which is all a tap needs.
 */
export const CARDS: MotionChoice[] = [
  { id: "lift", label: "Lift", note: "A card rises a little under the pointer. The current behaviour." },
  { id: "tilt", label: "Tilt", note: "A card leans towards the pointer in 3-D as it moves across it." },
  { id: "float", label: "Float", note: "A card rises further and casts a deeper shadow. More presence." },
  { id: "still", label: "Still", note: "Cards do not move. The border and colour still answer the pointer." },
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

/**
 * The reading-progress line (`motion_progress`, 0.114.0): a thin bar along the
 * top of the viewport that fills as the page is scrolled. Pure CSS — a
 * `scroll(root)` timeline on one fixed element the marketing layout renders —
 * so it costs no JavaScript, and a browser without scroll-driven animations or
 * a reduced-motion visitor simply never sees it (`[data-scroll-progress]` in
 * globals.css).
 */
export const PROGRESS: MotionChoice[] = [
  { id: "none", label: "None", note: "No reading indicator. The current behaviour." },
  { id: "bar", label: "Bar", note: "A thin line along the top of the page fills as the reader scrolls down it." },
];

export type HeroVariant = "grid" | "aurora" | "dots" | "none";

export const HEROS: (MotionChoice & { id: HeroVariant })[] = [
  { id: "grid", label: "Grid", note: "The blueprint grid behind the hero and page headings. The current look." },
  { id: "aurora", label: "Aurora", note: "Three soft washes in the theme's hues drift slowly behind the heading." },
  { id: "dots", label: "Dots", note: "A fine dot field, fading out toward the bottom." },
  { id: "none", label: "Plain", note: "No backdrop at all." },
];

/**
 * How one section arrives — a per-section choice (2026-09-27), made on a
 * builder section in the page form and on a homepage section on the Themes
 * screen. Each id but `default` and `none` is a `data-aos` value
 * `globals.css` already styles, so the site-wide `motion_reveal` style
 * (float, focus, none…) still applies on top of it and reduced motion still
 * turns all of it off. Vertical and scale only: a horizontal slide fails the
 * zero-tolerance overflow check. (Assemble's 2° tilt is on a piece already
 * scaled to 90%, so it stays inside the piece's own box.) Assemble and
 * cascade move a section's *pieces* rather than the section — the selector
 * list and why they arrive by animation rather than transition are beside
 * the CSS in globals.css. The API checks the shape of the id and
 * `sectionReveal()` falls back, the rule every `motion_*` id follows.
 *
 * `default` is "what this kind of section does on its own" — a builder
 * section rises, an opening hero and a content block do not — and is never
 * stored. A homepage section's default is not to move (the 2026-09-15 UX
 * audit), so the Themes screen offers the list without it, `none` first.
 */
export type SectionRevealAttr = "fade-up" | "fade" | "zoom-in" | "fade-down" | "assemble" | "cascade" | "focus" | "unfold";

export const SECTION_REVEALS: MotionChoice[] = [
  { id: "default", label: "Default", note: "What this kind of section does on its own." },
  { id: "fade-up", label: "Rise", note: "Fades in while rising, in the site's Sections arriving style." },
  { id: "fade", label: "Fade", note: "Fades in where it stands." },
  { id: "zoom-in", label: "Zoom", note: "Fades in from slightly smaller." },
  { id: "fade-down", label: "Drop", note: "Fades in while settling down from above." },
  { id: "assemble", label: "Assemble", note: "Its pieces arrive one after another, slightly smaller and tilted, and click into place." },
  { id: "cascade", label: "Cascade", note: "Its pieces rise and fade in one after another." },
  { id: "focus", label: "Focus", note: "Sharpens from a soft blur as it fades in." },
  { id: "unfold", label: "Unfold", note: "Uncovered from the top down, like a curtain lifting." },
  { id: "none", label: "None", note: "Simply there, no animation." },
];

const REVEAL_ATTRS: readonly string[] = ["fade-up", "fade", "zoom-in", "fade-down", "assemble", "cascade", "focus", "unfold"];

/**
 * The `data-aos` value a section carries, or null for none. `fallback` is
 * what `default` — and anything absent or unknown — resolves to.
 */
export function sectionReveal(id: string | null | undefined, fallback: SectionRevealAttr | null): SectionRevealAttr | null {
  if (id === "none") return null;
  return id && REVEAL_ATTRS.includes(id) ? (id as SectionRevealAttr) : fallback;
}

/**
 * The aurora backdrop's *ceiling* opacity per scheme. The value actually
 * painted is derived per theme by `auroraAlpha()` in lib/themes.ts — this
 * is where the search starts, and it is lower in dark because a tint that
 * is a pale wash over white is a mid-tone slab over near-black. Plain data
 * here so themes.ts can import it without a cycle.
 */
export const AURORA_ALPHA = { light: 0.32, dark: 0.16 } as const;

export const SPLASH_NOTE =
  "On the first page of a session a small loader in the theme's own style plays over the page colour for about a second, then never again that session. Never shown to reduced-motion visitors or to crawlers.";

export type Motion = {
  reveal: string;
  buttons: string;
  page: string;
  loader: string;
  splash: boolean;
  hero: HeroVariant;
  cards: string;
  progress: string;
};

const pick = (list: MotionChoice[], id: string | undefined): string =>
  list.some((c) => c.id === id) ? (id as string) : list[0].id;

/** The choices, each resolved with its default for an unknown or absent id. */
export function motionFor(settings: Record<string, string | undefined>): Motion {
  return {
    reveal: pick(REVEALS, settings.motion_reveal),
    buttons: pick(BUTTONS, settings.motion_buttons),
    page: pick(PAGES, settings.motion_page),
    loader: pick(LOADERS, settings.motion_loader),
    splash: settings.motion_splash === "1",
    hero: pick(HEROS, settings.motion_hero) as HeroVariant,
    cards: pick(CARDS, settings.motion_cards),
    progress: pick(PROGRESS, settings.motion_progress),
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
    "data-motion-cards": m.cards,
    "data-motion-progress": m.progress,
  };
}
