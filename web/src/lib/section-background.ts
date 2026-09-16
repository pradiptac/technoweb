import type { CSSProperties } from "react";
import { announcementBand, contrast, hexToLch, lchToHex, ramp } from "./palette.ts";
import type { SectionBackground } from "../themes/options.ts";

/**
 * A section's custom background, and the tokens that make the words on it
 * read.
 *
 * The site's text and panel colours are `@theme` custom properties, and a
 * custom property re-resolves wherever it is redefined — so a section given
 * a background of its own is given, on the same element, a **local palette**:
 * `--color-ink`, `--color-muted`, `--color-card`, `--color-line`,
 * `--color-brand-ink` and the rest, derived from the chosen colour. Every
 * `text-ink`, `bg-card` and `border-line` inside re-resolves against them,
 * and nothing inside the section has to know it is on a colour. That is the
 * only way a coloured section can be added to nine sections of existing
 * markup without touching them — and, more to the point, the only way the
 * contrast is *arithmetic*: the ink is `announcementBand()`'s, pushed until
 * it clears 4.5:1 on every stop, which is exactly what `npm run audit`
 * grades (the worst stop of a gradient), so a colour an editor picks cannot
 * fail the audit on the section's own words. A stop nothing can read on is
 * moved, the announcement bar's rule.
 *
 * Three kinds:
 *
 * - `solid` — one colour. `--color-page` and `--color-surface` become that
 *   colour, so a section that paints `bg-surface` paints the same thing.
 * - `gradient` — two stops at an angle on the wrapper, and `page` and
 *   `surface` become **transparent** so the section's own fill does not
 *   sit over the gradient as a slab. The audit reads through a transparent
 *   background to the gradient behind it, taking its worst stop.
 * - `image` — the picture under an opaque overlay colour. The overlay is the
 *   wrapper's `background-color` and the picture sits *on* it at reduced
 *   opacity, so the words are graded against the overlay colour and the
 *   real composite can only be darker or lighter toward it — `PageHero`'s
 *   banner rule, the other way up. The overlay defaults to near-black; a
 *   light overlay works the same way with dark ink.
 *
 * The card, the surfaces and the lines step from the background toward the
 * ink by the palette's own intervals, and the card is checked again against
 * the ink — a lifted panel on a borderline colour is closer to the text than
 * the ground was. `brand-ink` and the `50` wash come from `ramp()` against
 * that card, which is how the palette derives them for the page.
 *
 * Both schemes paint a custom section the same: the client chose a colour.
 */
export type SectionSurface = {
  /** Inline on the wrapper: the background and the local tokens. */
  style: CSSProperties;
  /** Which way the ink went — for anything that wants to know without reading a token. */
  ground: "light" | "dark";
  /** The opacity the picture sits at, for `image`. */
  imageOpacity: number;
};

const DEFAULT_OVERLAY = "#0b0b12";

/** The three ramps' `600`s, which `ramp()` re-derives the inks and washes from. */
export type Seeds = { brand: string; secondary: string; accent: string };

export function sectionSurface(bg: SectionBackground, seeds: Seeds): SectionSurface {
  const stops = bg.kind === "gradient" && bg.colour2
    ? [bg.colour ?? DEFAULT_OVERLAY, bg.colour2]
    : [bg.colour ?? DEFAULT_OVERLAY];

  const band = announcementBand(stops);
  const painted = band.stops;
  const ground: "light" | "dark" = hexToLch(band.ink).L > hexToLch(painted[0]!).L ? "dark" : "light";
  const dir: 1 | -1 = ground === "dark" ? 1 : -1; // toward the ink

  // The stop the ink sits furthest from is the ground everything steps off.
  const base = painted.reduce((a, b) => (contrast(band.ink, a) >= contrast(band.ink, b) ? a : b));
  const b = hexToLch(base);
  const step = (L: number, C = 0.012) => lchToHex({ L: clamp(L, 0.02, 0.99), C: Math.min(b.C, C), h: b.h });

  let card = step(b.L + dir * 0.055);
  // A panel between the ground and the ink: pushed back toward the ground
  // until the ink clears 4.5:1 on it, so a card on a borderline colour is
  // never the one pairing the audit fails.
  for (let i = 0; i < 40 && contrast(band.ink, card) < 4.5; i++) {
    card = step(hexToLch(card).L - dir * 0.01);
  }
  const surface2 = step(hexToLch(card).L + dir * 0.03);
  const line = step(b.L + dir * 0.15, 0.01);
  const lineStrong = step(b.L + dir * 0.22, 0.01);

  // The coloured-text inks: `ramp()` fits each to the card and its wash;
  // here each is also pushed until it clears 4.5:1 on every painted stop,
  // because a section's kicker sits on the ground and not on a card. All
  // three ramps, since a kicker is `secondary-ink` on some sections.
  const worstOnStops = (hex: string) => Math.min(...painted.map((s) => contrast(hex, s)));
  const inkFor = (seed: string) => {
    const r = ramp(seed, { card });
    let ink = r.ink;
    for (let i = 0; i < 60 && worstOnStops(ink) < 4.5; i++) {
      const l = hexToLch(ink);
      ink = lchToHex({ ...l, L: clamp(l.L + dir * 0.01, 0.02, 0.99) });
    }
    return { ink, 50: r[50], 100: r[100] };
  };
  const brand = inkFor(seeds.brand);
  const secondary = inkFor(seeds.secondary);
  const accent = inkFor(seeds.accent);
  const transparent = bg.kind !== "solid";

  const style: Record<string, string> = {
    // `color` inherits as a *computed* value, so anything inside with no
    // colour class of its own would keep the page's ink from `<body>`; set
    // here, the local ink is what those inherit.
    color: band.ink,
    "--color-page": transparent ? "transparent" : painted[0]!,
    "--color-surface": transparent ? "transparent" : painted[0]!,
    "--color-surface-2": surface2,
    "--color-card": card,
    "--color-line": line,
    "--color-line-strong": lineStrong,
    "--color-ink": band.ink,
    "--color-ink-2": band.ink,
    "--color-muted": band.muted,
    "--color-faint": band.muted,
    "--color-brand-ink": brand.ink,
    "--color-brand-50": brand[50],
    "--color-brand-100": brand[100],
    "--color-secondary-ink": secondary.ink,
    "--color-secondary-50": secondary[50],
    "--color-accent-ink": accent.ink,
    "--color-accent-50": accent[50],
    // The dark-band tokens too: the hero, the support band and the closing
    // band paint `bg-dark` with `dark-ink` on it, and a section given a
    // picture or a colour should show it there as well — with the same
    // derived ink, so a *light* colour under a band that assumed dark still
    // reads. `dark-2` is the card and `dark-line` the line.
    "--color-dark": transparent ? "transparent" : painted[0]!,
    "--color-dark-2": card,
    "--color-dark-line": line,
    "--color-dark-ink": band.ink,
    "--color-dark-muted": band.muted,
  };

  if (bg.kind === "gradient") {
    style.backgroundImage = `linear-gradient(${bg.angle ?? 135}deg, ${painted[0]}, ${painted[1]})`;
  } else {
    style.backgroundColor = painted[0]!;
  }

  return {
    style: style as CSSProperties,
    ground,
    imageOpacity: bg.kind === "image" ? 1 - (bg.overlay ?? 60) / 100 : 1,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
