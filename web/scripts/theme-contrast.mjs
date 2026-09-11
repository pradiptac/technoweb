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
 * - the six **presets**, which are generator outputs somebody looked at;
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

import { contrast } from "../src/lib/palette.ts";
import { PRESETS, generate } from "../src/lib/presets.ts";
import { THEMES, themeCss } from "../src/lib/themes.ts";

const WHITE = "#ffffff";

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
  ["white on brand-600", WHITE, c.brand600, 4.5],
  ["white on brand-700", WHITE, c.brand700, 4.5],
  ["dark-ink on dark", c.darkInk, c.dark, 4.5],
  ["dark-ink on dark-2", c.darkInk, c.dark2, 4.5],
  ["dark-muted on dark", c.darkMuted, c.dark, 4.5],
  ["dark-muted on dark-2", c.darkMuted, c.dark2, 4.5],
  ["brand-300 on dark", c.brand300, c.dark, 4.5],
  // The two companion ramps, same roles.
  ["white on secondary-600", WHITE, c.secondary600, 4.5],
  ["white on secondary-700", WHITE, c.secondary700, 4.5],
  ["secondary-ink on card", c.secondaryInk, c.card, 4.5],
  ["white on accent-600", WHITE, c.accent600, 4.5],
  ["white on accent-700", WHITE, c.accent700, 4.5],
  ["accent-ink on card", c.accentInk, c.card, 4.5],
  // The twelve identity hues are graphics on a tile over surface-2: 3:1.
  ...c.neon.map((hex, i) => [`neon-${i + 1} on surface-2`, hex, c.surface2, 3.0]),
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
    brand50: read("--color-brand-50"), brand300: read("--color-brand-300"),
    brand600: read("--color-brand-600"), brand700: read("--color-brand-700"),
    dark: read("--color-dark"), dark2: read("--color-dark-2"),
    darkInk: read("--color-dark-ink"), darkMuted: read("--color-dark-muted"),
    secondary600: read("--color-secondary-600"), secondary700: read("--color-secondary-700"),
    secondaryInk: read("--color-secondary-ink"),
    accent600: read("--color-accent-600"), accent700: read("--color-accent-700"),
    accentInk: read("--color-accent-ink"),
    neon: Array.from({ length: 12 }, (_, i) => read(`--color-neon-${i + 1}`)),
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

console.log(
  failed
    ? `\n${failed} pairing(s) below AA. A palette that fails this is not shippable.`
    : `\nAll ${population.length} palettes (${PRESETS.length} presets, ${THEMES.length} legacy, ${ADVERSARIAL.length} hostile) clear WCAG AA on every pairing the site renders, in both schemes.`,
);
process.exit(failed ? 1 : 0);
