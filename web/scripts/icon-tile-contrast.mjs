/**
 * Can an identity icon sit on a tint of its own colour?
 *
 * The twelve neon hues were derived against a *plain* surface — see
 * `neon-contrast.mjs`, which walks lightness until each clears 3:1 on the
 * darkest light row a nav icon sits on. Filling the tile with a wash of the
 * icon's own hue moves the background toward the icon, so that derivation no
 * longer answers the question: a strong enough wash and the glyph disappears
 * into its own box.
 *
 * WCAG 1.4.11 is the bar. An icon in a tile is a graphical object rather than
 * text, so 3:1 against its immediate background — the tile, not the page.
 *
 * Mixing is done in sRGB here and with `color-mix(in srgb, …)` in the CSS, so
 * the number this prints and the colour a browser paints are the same
 * arithmetic. Mixing in oklab would look slightly nicer and would make this
 * check a different sum from the one that ships.
 *
 * Run: node scripts/icon-tile-contrast.mjs
 */

const LIGHT = {
  label: "light",
  card: "#ffffff",
  hues: [
    "#3e9603", "#0390a0", "#f505b5", "#d76004", "#9841fb", "#039651",
    "#fb2867", "#0585f5", "#a57a03", "#039679", "#dd1efa", "#fa3719",
    // The fallback a tile uses when its icon is not an identity one — the
    // same formula, so a generic tile cannot be the one that fails.
    // Every theme's own `brandInk`, light scheme, from `lib/themes.ts`.
    "#4a5a2a", "#4338ca", "#0f766e", "#b45309", "#9d174d", "#1d4ed8",
  ],
};

const DARK = {
  label: "dark",
  card: "#1a1c18",
  hues: [
    "#b0fc7d", "#7df0fc", "#fc7dda", "#fcb47d", "#b87dfc", "#7dfcc1",
    "#fc7da3", "#7dc1fc", "#fcda7d", "#7dfce3", "#eb7dfc", "#fc8e7d",
    // `brandInk` in dark is each theme's own brand-300 — the light step.
    "#c3d49a", "#a5b4fc", "#5eead4", "#fcd34d", "#f9a8d4", "#93c5fd",
  ],
};

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

const lum = (hex) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

/** `color-mix(in srgb, hue P%, base)`. */
const mix = (hue, base, pct) => {
  const h = rgb(hue);
  const b = rgb(base);
  const out = h.map((v, i) => Math.round((v * pct + b[i] * (100 - pct)) / 100));
  return "#" + out.map((v) => v.toString(16).padStart(2, "0")).join("");
};

const TARGET = 3;
let worstOverall = { pct: null };

console.log("mix%   worst ratio   scheme/hue        verdict");
console.log("─".repeat(58));

for (const pct of [8, 10, 12, 14, 16, 18, 20, 25]) {
  let worst = { r: Infinity };

  for (const scheme of [LIGHT, DARK]) {
    scheme.hues.forEach((hue, i) => {
      const r = ratio(hue, mix(hue, scheme.card, pct));
      if (r < worst.r) worst = { r, hue, i: i + 1, scheme: scheme.label };
    });
  }

  const ok = worst.r >= TARGET;
  console.log(
    `${String(pct).padStart(3)}%   ${worst.r.toFixed(2).padStart(9)}   ` +
    `${worst.scheme}/neon-${worst.i}`.padEnd(17) +
    (ok ? " passes" : " FAILS 1.4.11"),
  );

  if (ok) worstOverall = { pct, ...worst };
}

console.log("─".repeat(58));

if (worstOverall.pct === null) {
  console.log("No mix clears 3:1. The tint has to come from something other than the hue.");
  process.exit(1);
}

console.log(
  `Highest mix that still clears ${TARGET}:1 everywhere: ${worstOverall.pct}% ` +
  `(worst ${worstOverall.r.toFixed(2)} on ${worstOverall.scheme}/neon-${worstOverall.i}).`,
);
