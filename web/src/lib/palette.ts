/**
 * A whole palette from five colours, with contrast enforced at every step.
 *
 * The site consumes a *ramp* — `brand-50…900` in ~460 places, `brand-ink` in
 * 207 — and every one of those consumers was designed around a step sitting
 * at a particular lightness: white text on `600`, coloured text on `card` via
 * `brand-ink`, a `50` wash under a `brand-ink` label. A hex typed into a box
 * cannot fill ten steps, and read literally it breaks the gate on the first
 * bright input: `#ffff00` as a primary is yellow buttons under white text.
 *
 * So the typed hex is treated as **hue and chroma intent**. Each step is
 * placed at a fixed OKLCH lightness, and the steps that carry text are pushed
 * until they pass 4.5:1 — which is what makes the generated palette pass the
 * same `npm run themes` gate the hand-tuned ones do, for any input at all.
 * The console shows the adjusted shade beside the typed one, so "we moved
 * your yellow" is visible rather than silent.
 *
 * **Dark is derived, never fixed.** The old `darkScheme()` painted every
 * theme's dark neutrals olive-grey, so a blue theme's dark mode had green
 * tints under blue buttons. Here the dark neutrals take the primary's hue at
 * near-zero chroma — Material's tinted neutral — and the dark brand tints
 * (`300`, `400`) are given more chroma than their light counterparts, which
 * is the "fluorescent on dark" that makes a dark scheme look designed rather
 * than inverted.
 *
 * OKLCH throughout, because lightness in OKLCH is perceptual: two steps at
 * L .48 look equally dark whatever their hue, which no HSL ramp can promise.
 * No dependency — the conversions are forty lines, and this file is imported
 * by the root layout on every request.
 */

export type Hex = `#${string}`;

/** One ramp: ten steps and the "coloured text" role derived from them. */
export type Ramp = {
  50: string; 100: string; 200: string; 300: string; 400: string;
  500: string; 600: string; 700: string; 800: string; 900: string;
  ink: string;
  /**
   * The text colour on a `600`/`700` fill. White in light; in dark the fill
   * is bright and this is near-black in the fill's own hue. A component
   * writes `text-brand-on`, never `text-white`, on a brand fill — the same
   * split `brand-ink` made for coloured text, applied to the fill's label.
   */
  on: string;
};

export type Neutrals = {
  ink: string; ink2: string; muted: string; faint: string;
  surface: string; surface2: string; page: string; card: string; line: string; lineStrong: string;
  dark: string; dark2: string; darkLine: string; darkInk: string; darkMuted: string;
};

/* ------------------------------------------------------------ colour maths */

type Lch = { L: number; C: number; h: number };

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

function rgbToOklab([r8, g8, b8]: [number, number, number]): [number, number, number] {
  const r = toLinear(r8 / 255), g = toLinear(g8 / 255), b = toLinear(b8 / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Linear-light sRGB, unclamped — the caller decides what "out of gamut" means. */
function oklabToLinear([L, a, b]: [number, number, number]): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function hexToLch(hex: string): Lch {
  const [L, a, b] = rgbToOklab(hexToRgb(hex));
  const C = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L, C, h };
}

function inGamut(lin: [number, number, number]): boolean {
  return lin.every((v) => v >= -0.0005 && v <= 1.0005);
}

/**
 * OKLCH → hex, reducing chroma until the colour is displayable.
 *
 * Reducing chroma rather than clipping channels keeps the hue and the
 * lightness — which are the two things every rule in this file is about —
 * and gives up only saturation, which is the one thing a screen may not have.
 */
export function lchToHex({ L, C, h }: Lch): string {
  const rad = (h * Math.PI) / 180;
  let lo = 0, hi = C;
  let best = oklabToLinear([L, 0, 0]);
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const lin = oklabToLinear([L, mid * Math.cos(rad), mid * Math.sin(rad)]);
    if (inGamut(lin)) { best = lin; lo = mid; } else { hi = mid; }
  }
  return rgbToHex(best.map((v) => fromLinear(clamp(v, 0, 1)) * 255) as [number, number, number]);
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => toLinear(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, order-independent. */
export function contrast(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/* ------------------------------------------------------------- the ramp */

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

/** Where each step sits, in OKLCH lightness. `600` is the fill under white text. */
const RAMP_L: Record<(typeof STEPS)[number], number> = {
  50: 0.97, 100: 0.93, 200: 0.86, 300: 0.76, 400: 0.66,
  500: 0.57, 600: 0.48, 700: 0.41, 800: 0.34, 900: 0.26,
};

/** Chroma tapers toward both ends so pale and deep steps stay in gamut and read as tints. */
const RAMP_C: Record<(typeof STEPS)[number], number> = {
  50: 0.22, 100: 0.38, 200: 0.6, 300: 0.82, 400: 0.95,
  500: 1, 600: 1, 700: 0.95, 800: 0.85, 900: 0.7,
};

/**
 * Walk lightness until `fg` on `bg` clears `min`, moving in `dir`.
 * Returns the hex reached, or the furthest tried if nothing passes — which
 * cannot happen for a text colour against a background inside sRGB, but a
 * loop with no exit is still a loop with no exit.
 */
function pushUntil(fg: Lch, bg: string, min: number, dir: 1 | -1): string {
  let L = fg.L;
  let hex = lchToHex({ ...fg, L });
  for (let i = 0; i < 60 && contrast(hex, bg) < min; i++) {
    L = clamp(L + dir * 0.01, 0.02, 0.99);
    hex = lchToHex({ ...fg, L });
  }
  return hex;
}

/**
 * A full ramp from one hue.
 *
 * The input's chroma is clamped into a band: too little and a grey typed as a
 * brand produces ten indistinguishable greys; too much and the pale steps go
 * out of gamut before the taper reaches them.
 */
export function ramp(seed: string, opts: { card: string } = { card: "#ffffff" }): Ramp {
  const { h, C } = hexToLch(seed);
  const chroma = clamp(C, 0.05, 0.17);
  const out: Record<string, string> = {};

  for (const step of STEPS) {
    out[step] = lchToHex({ L: RAMP_L[step], C: chroma * RAMP_C[step], h });
  }

  // The fill under white text, and the step below it. Pushed darker until
  // white passes, then the deeper steps are kept below them so the ramp
  // stays monotonic — a 700 lighter than 600 is a hover that goes the wrong way.
  out[600] = pushUntil({ L: RAMP_L[600], C: chroma, h }, "#ffffff", 4.5, -1);
  const L600 = hexToLch(out[600]).L;
  out[700] = lchToHex({ L: Math.min(RAMP_L[700], L600 - 0.06), C: chroma * RAMP_C[700], h });
  out[700] = pushUntil(hexToLch(out[700]), "#ffffff", 4.5, -1);
  const L700 = hexToLch(out[700]).L;
  out[800] = lchToHex({ L: Math.min(RAMP_L[800], L700 - 0.06), C: chroma * RAMP_C[800], h });
  out[900] = lchToHex({ L: Math.min(RAMP_L[900], hexToLch(out[800]).L - 0.07), C: chroma * RAMP_C[900], h });

  // Coloured text: on the card and on its own 50 wash, the two places the
  // site puts a `text-brand-ink` label. Starts at the fill and moves *away
  // from the card* — darker on a light card, lighter on a dark one, which is
  // the case a customer who types a dark background into the light scheme
  // produces, and the one a "darken until it passes" loop never reaches.
  const cardIsDark = hexToLch(opts.card).L < 0.5;

  // On a dark card the washes invert as well: a `bg-brand-50` panel on a
  // near-black page must be a dark tint of the hue, not a near-white one —
  // the rule `darkRamp()` applies to the dark scheme, applied here because a
  // dark background typed into the light scheme is the same situation.
  // Only `50` and `100` invert. `200` stays a light tint: it is the kicker
  // colour over the dark page-hero banner (`text-brand-200`, measured at
  // 4.74:1 against the darkest a `brightness(.35)` photo can be), and a dark
  // 200 there is 1.7:1 — found by the dark audit, not by reasoning.
  if (cardIsDark) {
    out[50] = lchToHex({ L: 0.20, C: Math.min(chroma, 0.05), h });
    out[100] = lchToHex({ L: 0.25, C: Math.min(chroma, 0.06), h });
  }

  const wash = out[50];
  let ink = cardIsDark ? out[400] : out[600];
  for (let i = 0; i < 60 && (contrast(ink, opts.card) < 4.5 || contrast(ink, wash) < 4.5); i++) {
    const l = hexToLch(ink);
    ink = lchToHex({ ...l, L: clamp(l.L + (cardIsDark ? 0.01 : -0.01), 0.02, 0.99) });
  }
  out.ink = ink;
  out.on = "#ffffff";

  return out as Ramp;
}

/* ---------------------------------------------------------- the neutrals */

/** A neutral at a lightness, faintly tinted by a hue. */
function tint(L: number, h: number, C = 0.008): string {
  return lchToHex({ L, C, h });
}

/**
 * Light neutrals from the two base colours.
 *
 * `page` and `card` *are* the background. The surfaces step from it toward
 * the text by fixed amounts; the text roles step from the text toward the
 * background. Each text role is then pushed until it clears 4.5:1 on
 * `surface-2`, which is the pairing the gate has always checked and the one
 * a pale grey typed as "text" would otherwise fail.
 */
export function lightNeutrals(background: string, text: string, hue: number): Omit<Neutrals, "dark" | "dark2" | "darkLine" | "darkInk" | "darkMuted"> {
  const bg = hexToLch(background);
  const tx = hexToLch(text);
  const dir: 1 | -1 = tx.L < bg.L ? -1 : 1; // which way "toward the text" is

  // Ink must sit hard against the background; a text colour that only just
  // passes reads as faded on every paragraph of the site.
  const ink = pushUntil({ L: tx.L, C: Math.min(tx.C, 0.03), h: tx.h }, background, 7, dir);
  const inkL = hexToLch(ink).L;

  const surface = tint(bg.L + dir * 0.02, hue, 0.006);
  const surface2 = tint(bg.L + dir * 0.045, hue, 0.006);
  const line = tint(bg.L + dir * 0.075, hue, 0.006);
  const lineStrong = tint(bg.L + dir * 0.125, hue, 0.006);

  const role = (towardBg: number, min: number) =>
    pushUntil({ L: inkL - dir * towardBg, C: Math.min(tx.C, 0.02), h: tx.h }, surface2, min, dir);

  return {
    page: background,
    card: background,
    surface, surface2, line, lineStrong,
    ink,
    ink2: role(0.10, 7),
    muted: role(0.28, 4.5),
    faint: role(0.36, 4.5),
  };
}

/**
 * Dark neutrals, derived from the primary's hue — the fix for every theme
 * having an olive-grey dark mode.
 *
 * `card` is *lighter* than the page, not darker: a dark interface separates
 * a panel from its background by lifting it, because there is nothing below
 * near-black to go to. The `dark-*` band tokens sit *on* a dark page and are
 * lifted and given a stronger line for the same reason.
 */
export function darkNeutrals(hue: number): Neutrals {
  // Deeper and a touch more tinted than the first cut (page .16 at chroma
  // .008): a bright fill wants a darker ground under it, and the ground
  // carrying the theme's hue is what makes a dark scheme read as *this*
  // theme's rather than as "dark".
  const N = 0.012;
  const surface2 = tint(0.215, hue, N);
  const dark = tint(0.11, hue, N);

  return {
    page: tint(0.13, hue, N),
    surface: tint(0.15, hue, N),
    card: tint(0.18, hue, N),
    surface2,
    line: tint(0.28, hue, N),
    lineStrong: tint(0.35, hue, N),
    ink: tint(0.95, hue, 0.004),
    ink2: pushUntil({ L: 0.88, C: 0.004, h: hue }, surface2, 7, 1),
    muted: pushUntil({ L: 0.72, C: 0.006, h: hue }, surface2, 4.5, 1),
    faint: pushUntil({ L: 0.64, C: 0.006, h: hue }, surface2, 4.5, 1),
    dark,
    dark2: tint(0.16, hue, N),
    darkLine: tint(0.28, hue, N),
    darkInk: tint(0.96, hue, 0.004),
    darkMuted: pushUntil({ L: 0.73, C: 0.006, h: hue }, dark, 4.5, 1),
  };
}

/**
 * The brand ramp as it reads in dark.
 *
 * The fill steps (`600`–`900`) are the light ramp's own — white text still
 * sits on them, and that is what keeps thirty themes distinguishable in dark
 * without thirty palettes. What changes: the `50`/`100` washes become dark
 * tints of the hue (a `bg-brand-50` panel in dark must be a dark wash, not a
 * near-white one), and `300`/`400` — the coloured-text steps in dark — are
 * given **more** chroma than in light. That is the fluorescent step: a tint
 * that would look chalky on white looks lit on near-black.
 */
export function darkRamp(light: Ramp, card: string): Ramp {
  const { h, C } = hexToLch(light[600]);
  const chroma = clamp(C * 1.4, 0.12, 0.22);
  const glow = (L: number) => lchToHex({ L, C: chroma, h });

  /*
   * The fill is bright and its text is dark — the references' cyan button
   * on black. White text caps a fill at roughly L .60 (nothing brighter
   * passes 4.5:1 under white), which is why the first cut's dark buttons
   * were a mid-tone slab: they kept the light ramp's L .48 fill. `on` is
   * near-black in the fill's own hue, and the fill is pushed darker only if
   * that pairing somehow fails, which at L .76 it does not.
   */
  const on = tint(0.12, h, 0.02);
  const r600 = pushUntil(hexToLch(glow(0.76)), on, 4.5, -1);
  const r700 = pushUntil(hexToLch(glow(0.70)), on, 4.5, -1);
  const r300 = pushUntil(hexToLch(glow(0.80)), card, 4.5, 1);

  // `200` is deliberately not inverted — see `ramp()`: it is the kicker over
  // the dark hero banner and has to stay a light tint in both schemes. `800`
  // and `900` are the dark bands under white text and stay the light ramp's.
  return {
    ...light,
    50: lchToHex({ L: 0.21, C: Math.min(chroma, 0.07), h }),
    100: lchToHex({ L: 0.27, C: Math.min(chroma, 0.07), h }),
    300: r300,
    400: glow(0.72),
    500: glow(0.66),
    600: r600,
    700: r700,
    ink: r300,
    on,
  };
}

/* --------------------------------------------------------------- neon */

/** The twelve identity hues, in OKLCH degrees — read once off the shipped light values. */
export const NEON_HUES = [130, 205, 330, 45, 300, 155, 5, 250, 85, 175, 315, 25];

/**
 * The identity hues re-tuned for a surface.
 *
 * They were tuned once, by hand, against olive surfaces, and so held their
 * 3:1 floor only under the olive theme. Here each is walked in lightness —
 * downward on a light surface, upward on a dark one — until it clears the
 * floor on *this* palette's `surface-2`, the darkest light surface an icon
 * tile sits on. 3.35 and 3.05 rather than 3.0 leave the margin the 12%
 * `color-mix` tile wash needs.
 */
export function neonFor(surface2: string, scheme: "light" | "dark"): string[] {
  const dark = scheme === "dark";
  return NEON_HUES.map((h) =>
    pushUntil({ L: dark ? 0.78 : 0.62, C: dark ? 0.22 : 0.2, h }, surface2, dark ? 3.05 : 3.35, dark ? 1 : -1),
  );
}

/* ------------------------------------------------------ hue rotation */

/** A related hue for a theme that did not name one — used for the 25 legacy themes. */
export function rotated(seed: string, degrees: number): string {
  const l = hexToLch(seed);
  return lchToHex({ ...l, h: (l.h + degrees + 360) % 360 });
}

export function hueOf(hex: string): number {
  return hexToLch(hex).h;
}

/** Whether the generator moved a typed colour enough to notice. */
export function differs(a: string, b: string): boolean {
  const x = hexToLch(a), y = hexToLch(b);
  return Math.abs(x.L - y.L) > 0.03 || Math.abs(x.C - y.C) > 0.03;
}

/** The step of a ramp nearest the typed colour — what "your primary" became. */
export function nearestStep(r: Ramp, hex: string): string {
  const L = hexToLch(hex).L;
  let best = r[600], d = Infinity;
  for (const step of STEPS) {
    const dd = Math.abs(hexToLch(r[step]).L - L);
    if (dd < d) { d = dd; best = r[step]; }
  }
  return best;
}
