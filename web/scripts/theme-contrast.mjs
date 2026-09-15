/**
 * Every palette, every text-on-background pair the site actually renders —
 * and twelve palettes nobody chose.
 *
 * `npm run audit` fails on any WCAG AA failure, so a theme whose muted text
 * lands at 4.2:1 does not produce a slightly-off page — it produces a build
 * that will not pass. Checking here means finding that while choosing the
 * colour rather than after a browser has drawn it.
 *
 * Three populations run through the same pairings:
 *
 * - the nine **presets** — the house theme and the eight drawn in the brief —
 *   which are generator outputs somebody looked at;
 * - the 25 **legacy** themes, hand-tuned ramps whose dark neutrals are now
 *   derived (this is the run that proves the olive tint's removal cost no
 *   pairing);
 * - twelve **adversarial** custom inputs — pure red, pure yellow, neon
 *   green, near-white, near-black, a flat grey, and a hue every 60° — that
 *   nobody would choose and somebody will. These are the argument that the
 *   generator holds for *any* input rather than only the ones that were
 *   checked by eye. A generator that passes the presets and fails yellow is
 *   a generator that will fail a customer.
 *
 * The pairs are the combinations the components use today. Anything not
 * listed here is not checked, so a new component that invents a pairing
 * needs a line adding.
 */

import { announcementBand, contrast, hexToRgb, rgbToHex, topBarBand } from "../src/lib/palette.ts";
import { PRESETS, generate } from "../src/lib/presets.ts";
import { THEMES, themeCss } from "../src/lib/themes.ts";

const WHITE = "#ffffff";
/* The CTA card's lede is a literal on a band that never inverts (sections.tsx). */
const CTA_LEDE = "#cdd6bb";

/**
 * A tint at `alpha` over an opaque ground, per channel in sRGB — what the
 * browser paints under text that sits over an aurora blob. The blur only
 * lowers alpha towards a blob's edge, so its un-blurred centre is the worst
 * case; and the three blobs are anchored so they never overlap, so one tint
 * is the bound rather than two compounding. The audit cannot see this — it
 * walks *ancestors* for a background and the blobs are siblings — which is
 * why it is checked here, against every palette, at the same opacities the
 * component paints (`AURORA_ALPHA`).
 */
const composite = (top, ground, alpha) => {
  const t = hexToRgb(top), g = hexToRgb(ground);
  return rgbToHex(t.map((v, i) => alpha * v + (1 - alpha) * g[i]));
};

/** [label, foreground, background, minimum] — 4.5 for text, 3.0 for a graphic. */
const pairs = (c) => [
  ["ink on card", c.ink, c.card, 4.5],
  ["ink2 on card", c.ink2, c.card, 4.5],
  ["muted on card", c.muted, c.card, 4.5],
  ["faint on card", c.faint, c.card, 4.5],
  ["brand-ink on card", c.brandInk, c.card, 4.5],
  ["brand-ink on surface", c.brandInk, c.surface, 4.5],
  ["brand-ink on brand-50", c.brandInk, c.brand50, 4.5],
  ["ink on surface", c.ink, c.surface, 4.5],
  ["muted on surface", c.muted, c.surface, 4.5],
  ["muted on surface-2", c.muted, c.surface2, 4.5],
  ["faint on surface", c.faint, c.surface, 4.5],
  ["faint on surface-2", c.faint, c.surface2, 4.5],
  // A fill's text is its `on` token: white in light, near-black in dark,
  // where the fill is bright. The bands (800/900) stay dark under white.
  ["brand-on on brand-600", c.brandOn, c.brand600, 4.5],
  ["brand-on on brand-700", c.brandOn, c.brand700, 4.5],
  ["white on brand-900", WHITE, c.brand900, 4.5],
  ["dark-ink on dark", c.darkInk, c.dark, 4.5],
  ["dark-ink on dark-2", c.darkInk, c.dark2, 4.5],
  ["dark-muted on dark", c.darkMuted, c.dark, 4.5],
  ["dark-muted on dark-2", c.darkMuted, c.dark2, 4.5],
  ["brand-300 on dark", c.brand300, c.dark, 4.5],
  // The two companion ramps, same roles.
  ["secondary-on on secondary-600", c.secondaryOn, c.secondary600, 4.5],
  ["secondary-on on secondary-700", c.secondaryOn, c.secondary700, 4.5],
  ["secondary-ink on card", c.secondaryInk, c.card, 4.5],
  ["accent-on on accent-600", c.accentOn, c.accent600, 4.5],
  ["accent-on on accent-700", c.accentOn, c.accent700, 4.5],
  ["white on accent-900", WHITE, c.accent900, 4.5],
  ["accent-ink on card", c.accentInk, c.card, 4.5],
  // The twelve identity hues are graphics on a tile over surface-2: 3:1.
  ...c.neon.map((hex, i) => [`neon-${i + 1} on surface-2`, hex, c.surface2, 3.0]),
  // Text over an aurora blob (Backdrop, `aurora`). Light hosts wash the
  // `300` tints over the page and the brand-50 hero; dark hosts and the
  // brand-900 CTA card wash the `500`s. Every text token each host sets.
  ...[c.brand300, c.secondary300, c.accent300].flatMap((tint, i) => [
    [`ink over aurora-${i} on page`, c.ink, composite(tint, c.page, c.auroraAlpha), 4.5],
    [`muted over aurora-${i} on page`, c.muted, composite(tint, c.page, c.auroraAlpha), 4.5],
    [`brand-ink over aurora-${i} on page`, c.brandInk, composite(tint, c.page, c.auroraAlpha), 4.5],
    [`ink over aurora-${i} on brand-50`, c.ink, composite(tint, c.brand50, c.auroraAlpha), 4.5],
    [`muted over aurora-${i} on brand-50`, c.muted, composite(tint, c.brand50, c.auroraAlpha), 4.5],
  ]),
  ...[c.brand500, c.secondary500, c.accent500].flatMap((tint, i) => [
    [`dark-ink over aurora-${i} on dark`, c.darkInk, composite(tint, c.dark, c.auroraAlpha), 4.5],
    [`dark-muted over aurora-${i} on dark`, c.darkMuted, composite(tint, c.dark, c.auroraAlpha), 4.5],
    [`brand-300 over aurora-${i} on dark`, c.brand300, composite(tint, c.dark, c.auroraAlpha), 4.5],
    [`white over aurora-${i} on brand-900`, WHITE, composite(tint, c.brand900, c.auroraAlpha), 4.5],
    [`cta lede over aurora-${i} on brand-900`, CTA_LEDE, composite(tint, c.brand900, c.auroraAlpha), 4.5],
  ]),
  // The blog's category chips: twelve label colours as 11px text on the
  // card, and the same hues as a fill under white on the lead's caption.
  ...c.tags.map((hex, i) => [`tag-${i + 1} on card`, hex, c.card, 4.5]),
  ...c.tagFills.map((hex, i) => [`white on tag-fill-${i + 1}`, WHITE, hex, 4.5]),
];

/** The scheme's values, read back out of the CSS themeCss actually emits. */
const paletteFor = (theme, scheme) => {
  const css = themeCss(theme, scheme);
  const read = (name) => css.match(new RegExp(`${name}:(#[0-9a-fA-F]{3,8})`))?.[1];
  return {
    ink: read("--color-ink"), ink2: read("--color-ink-2"),
    muted: read("--color-muted"), faint: read("--color-faint"),
    surface: read("--color-surface"), surface2: read("--color-surface-2"),
    card: read("--color-card"), brandInk: read("--color-brand-ink"),
    page: read("--color-page"),
    // The generator's own answer, read back out of the CSS: the largest
    // opacity at which every pairing below holds, or 0 for a palette that
    // cannot carry a wash at all (which passes trivially — and correctly).
    auroraAlpha: Number(css.match(/--aurora-alpha:([0-9.]+)/)?.[1] ?? 0),
    brand50: read("--color-brand-50"), brand300: read("--color-brand-300"), brand500: read("--color-brand-500"),
    secondary300: read("--color-secondary-300"), secondary500: read("--color-secondary-500"),
    accent300: read("--color-accent-300"), accent500: read("--color-accent-500"),
    brand600: read("--color-brand-600"), brand700: read("--color-brand-700"),
    brand900: read("--color-brand-900"), brandOn: read("--color-brand-on"),
    dark: read("--color-dark"), dark2: read("--color-dark-2"),
    darkInk: read("--color-dark-ink"), darkMuted: read("--color-dark-muted"),
    secondary600: read("--color-secondary-600"), secondary700: read("--color-secondary-700"),
    secondaryInk: read("--color-secondary-ink"), secondaryOn: read("--color-secondary-on"),
    accent600: read("--color-accent-600"), accent700: read("--color-accent-700"),
    accent900: read("--color-accent-900"),
    accentInk: read("--color-accent-ink"), accentOn: read("--color-accent-on"),
    neon: Array.from({ length: 12 }, (_, i) => read(`--color-neon-${i + 1}`)),
    tags: Array.from({ length: 12 }, (_, i) => read(`--color-tag-${i + 1}`)),
    tagFills: Array.from({ length: 12 }, (_, i) => read(`--color-tag-fill-${i + 1}`)),
  };
};

const fonts = { fontDisplay: "instrument", fontBody: "inter" };
const hostile = (id, primary, secondary = primary, accent = primary, background = "#ffffff", text = "#12130f") =>
  generate({ primary, secondary, accent, background, text, ...fonts }, id, `hostile: ${id}`);

const ADVERSARIAL = [
  hostile("red", "#ff0000"),
  hostile("yellow", "#ffff00", "#ffff00", "#ffff00"),
  hostile("neon-green", "#39ff14"),
  hostile("near-white", "#f8f8f8", "#f0f0f0", "#fafafa"),
  hostile("near-black", "#050505", "#0a0a0a", "#111111"),
  hostile("flat-grey", "#808080", "#808080", "#808080"),
  hostile("hue-0", "#ff3366"), hostile("hue-60", "#ffcc00"), hostile("hue-120", "#00ff66"),
  hostile("hue-180", "#00ffff"), hostile("hue-240", "#3333ff"), hostile("hue-300", "#ff33ff"),
  // A dark background typed as the light scheme, and a pale text.
  hostile("inverted-base", "#2563eb", "#3b82f6", "#10b981", "#0b1020", "#e5e7eb"),
  hostile("pale-text", "#2563eb", "#3b82f6", "#10b981", "#ffffff", "#cccccc"),
];

const population = [
  ...PRESETS.map((p) => ({ ...generate(p.inputs, p.id, p.name), kind: "preset" })),
  ...THEMES.map((t) => ({ ...t, kind: "legacy" })),
  ...ADVERSARIAL.map((t) => ({ ...t, kind: "hostile" })),
];

let failed = 0;
for (const theme of population) {
  for (const scheme of ["light", "dark"]) {
    const palette = paletteFor(theme, scheme);
    const results = pairs(palette).map(([label, fg, bg, min]) => ({
      label, r: contrast(fg, bg), min, fg, bg,
    }));
    const bad = results.filter((r) => r.r < r.min);
    const worst = results.reduce((a, b) => (a.r / a.min < b.r / b.min ? a : b));

    console.log(
      `${bad.length ? "FAIL" : "ok  "} ${theme.kind.padEnd(7)} ${theme.id.padEnd(14)} ${scheme.padEnd(6)} ` +
      `worst ${worst.r.toFixed(2)}:1 (${worst.label})`,
    );
    for (const b of bad) {
      failed++;
      console.log(`       ${b.label}: ${b.r.toFixed(2)}:1 needs ${b.min} — ${b.fg} on ${b.bg}`);
    }
  }
}

/*
 * The top bar's colour is a setting of its own, typed as one hex and derived
 * for both schemes by `topBarBand()`. The bar's two text roles are pushed to
 * AA by construction, so what this checks is that the pushing worked for the
 * inputs most likely to defeat it: pure white and pure black (nowhere to
 * push toward on one side), a mid-tone grey (neither white nor black clears
 * AA by much), pure yellow and a neon (high chroma, high lightness), and a
 * brand navy (the ordinary case). Both schemes, because dark re-derives the
 * bar from the hue and has to be readable on the result too.
 */
const BAR_INPUTS = ["#ffffff", "#000000", "#808080", "#ffff00", "#39ff14", "#1e3a8a", "#e11d48", "#f8f8f8"];
for (const hex of BAR_INPUTS) {
  for (const scheme of ["light", "dark"]) {
    const b = topBarBand(hex, scheme);
    const results = [
      ["topbar-ink on topbar", b.ink, b.bar, 4.5],
      ["topbar-ink on topbar-2", b.ink, b.bar2, 4.5],
      ["topbar-muted on topbar", b.muted, b.bar, 4.5],
      ["topbar-muted on topbar-2", b.muted, b.bar2, 4.5],
      ["topbar-line on topbar", b.line, b.bar, 1.3],
    ].map(([label, fg, bg, min]) => ({ label, r: contrast(fg, bg), min, fg, bg }));
    const bad = results.filter((r) => r.r < r.min);
    const worst = results.reduce((a, b2) => (a.r / a.min < b2.r / b2.min ? a : b2));
    console.log(`${bad.length ? "FAIL" : "ok  "} topbar  ${hex.padEnd(14)} ${scheme.padEnd(6)} bar ${b.bar} worst ${worst.r.toFixed(2)}:1 (${worst.label})`);
    for (const x of bad) {
      failed++;
      console.log(`       ${x.label}: ${x.r.toFixed(2)}:1 needs ${x.min} — ${x.fg} on ${x.bg}`);
    }
  }
}

/*
 * The announcement bar takes one or two stops and derives one ink for all of
 * them (`announcementBand()`), so the pairs here are the ink and the muted
 * ink against *every* stop — the audit grades a gradient on its worst stop.
 * The inputs: same-side pairs the ink can only flee from, two mid-tones
 * neither black nor white clears, a pure-white pair, a hostile clash, and
 * the seeded default. Solid bars are the one-stop case.
 */
const BAR_STOPS = [
  ["#12140d", "#2f3a1f"], ["#e11d48", "#3b82f6"], ["#ffff00", "#000000"], ["#808080", "#7f7f7f"],
  ["#ffffff", "#ffffff"], ["#e11d48"], ["#808080"], ["#ffcc00", "#39ff14"], ["#f8f8f8", "#f0f0f0"],
  ["#1e3a8a", "#0b1020"], ["#ff3366", "#ffcc00"], ["#f4f6ec"],
];
for (const stops of BAR_STOPS) {
  const b = announcementBand(stops);
  const results = b.stops.flatMap((stop, i) => [
    [`ink on stop ${i + 1}`, b.ink, stop, 4.5],
    [`muted on stop ${i + 1}`, b.muted, stop, 4.5],
  ]).map(([label, fg, bg, min]) => ({ label, r: contrast(fg, bg), min, fg, bg }));
  const bad = results.filter((r) => r.r < r.min);
  const worst = results.reduce((a, b2) => (a.r / a.min < b2.r / b2.min ? a : b2));
  console.log(`${bad.length ? "FAIL" : "ok  "} announce ${stops.join(",").padEnd(16)} → ${b.stops.join(",")} ink ${b.ink} worst ${worst.r.toFixed(2)}:1 (${worst.label})`);
  for (const x of bad) {
    failed++;
    console.log(`       ${x.label}: ${x.r.toFixed(2)}:1 needs ${x.min} — ${x.fg} on ${x.bg}`);
  }
}

console.log(
  failed
    ? `\n${failed} pairing(s) below AA. A palette that fails this is not shippable.`
    : `\nAll ${population.length} palettes (${PRESETS.length} presets, ${THEMES.length} legacy, ${ADVERSARIAL.length} hostile) clear WCAG AA on every pairing the site renders, in both schemes.`,
);
process.exit(failed ? 1 : 0);
