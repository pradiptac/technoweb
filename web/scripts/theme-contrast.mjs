/**
 * Every theme, every text-on-background pair that the site actually renders.
 *
 * `npm run audit` fails on any WCAG AA failure, so a theme whose muted text
 * lands at 4.2:1 does not produce a slightly-off page — it produces a build
 * that will not pass. Checking here means finding that while choosing the
 * colour rather than after a browser has drawn it.
 *
 * The pairs below are the combinations the components use today: body text on
 * the page, muted text on both surfaces, brand text on white and on its own
 * 50-tint, white on the brand fill, and the dark-band pairings. Anything not
 * listed here is not checked, so a new component that invents a pairing needs
 * a line adding.
 */

import { THEMES } from "../src/lib/themes.ts";

const srgb = (hex) => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
};

const luminance = (hex) => {
  const [r, g, b] = srgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const WHITE = "#ffffff";

/** [label, foreground, background, minimum] — 4.5 for body text, 3.0 for large. */
const pairs = (c) => [
  ["ink on white", c.ink, WHITE, 4.5],
  ["ink on surface", c.ink, c.surface, 4.5],
  ["ink-2 on white", c.ink2, WHITE, 4.5],
  ["muted on white", c.muted, WHITE, 4.5],
  ["muted on surface", c.muted, c.surface, 4.5],
  ["muted on surface-2", c.muted, c.surface2, 4.5],
  // `faint` is used for small labels, which are text and get no discount.
  ["faint on white", c.faint, WHITE, 4.5],
  ["faint on surface", c.faint, c.surface, 4.5],
  // brand-600 is the coloured-text token; brand-500 is a fill and is exempt.
  ["brand-600 on white", c.brand600, WHITE, 4.5],
  ["brand-600 on brand-50", c.brand600, c.brand50, 4.5],
  ["brand-700 on brand-50", c.brand700, c.brand50, 4.5],
  ["white on brand-600", WHITE, c.brand600, 4.5],
  ["white on brand-700", WHITE, c.brand700, 4.5],
  // the dark bands
  ["dark-ink on dark", c.darkInk, c.dark, 4.5],
  ["dark-ink on dark-2", c.darkInk, c.dark2, 4.5],
  ["dark-muted on dark", c.darkMuted, c.dark, 4.5],
  ["dark-muted on dark-2", c.darkMuted, c.dark2, 4.5],
  ["brand-300 on dark", c.brand300, c.dark, 4.5],
];

let failed = 0;
for (const theme of THEMES) {
  const results = pairs(theme.colors).map(([label, fg, bg, min]) => ({
    label, r: ratio(fg, bg), min, fg, bg,
  }));
  const bad = results.filter((r) => r.r < r.min);
  const worst = results.reduce((a, b) => (a.r < b.r ? a : b));

  console.log(
    `${bad.length ? "FAIL" : "ok  "} ${theme.id.padEnd(10)} ${theme.name.padEnd(18)} ` +
    `worst ${worst.r.toFixed(2)}:1 (${worst.label})`,
  );
  for (const b of bad) {
    failed++;
    console.log(`       ${b.label}: ${b.r.toFixed(2)}:1 needs ${b.min} — ${b.fg} on ${b.bg}`);
  }
}

console.log(
  failed
    ? `\n${failed} pairing(s) below AA. A theme that fails this is not shippable.`
    : `\nAll ${THEMES.length} themes clear WCAG AA on every pairing the site renders.`,
);
process.exit(failed ? 1 : 0);
