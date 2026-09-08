/**
 * Can Google's four brand colours be used as icon hues here?
 *
 * The support hub's four cards are washed with one each — blue, red, yellow,
 * green — and each card's `IconTile` takes the same hue, because a card tinted
 * one colour with a tile of another inside it is the disagreement
 * `hueForIcon`'s own docblock exists to prevent.
 *
 * Google publishes those four for a white logo on a white page. Two of them
 * cannot be used as they are:
 *
 *   #FBBC05 (yellow) is 1.7:1 on white
 *   #34A853 (green)  is 2.9:1 on white
 *
 * WCAG 1.4.11 is the bar — an icon in a tile is a graphical object, so 3:1
 * against its immediate background, which is the tile rather than the page.
 * So the *hue* is Google's and the lightness is whatever clears the bar: darker
 * on light, brighter on dark. That is the rule `neon-contrast.mjs` already
 * applies to the twelve fluorescent hues, for the identical reason — true neon
 * does not survive a light surface.
 *
 * The tile is a 12% wash of the hue itself, so the background moves with the
 * candidate and both are recomputed on every step. The card behind it is a 6%
 * wash, and body copy sits on that, so `ink` and `muted` are checked there at
 * 4.5:1 as text.
 *
 * Mixed in sRGB, matching `color-mix(in srgb, …)` in the CSS. oklab mixes more
 * pleasantly and would make the number this prints a different sum from the one
 * a browser paints — the note `icon-tile-contrast.mjs` already carries.
 *
 * Run: node scripts/google-hue-contrast.mjs
 */

const GOOGLE = {
  blue: "#4285f4",
  red: "#ea4335",
  yellow: "#fbbc05",
  green: "#34a853",
};

const SCHEMES = {
  light: { card: "#ffffff", ink: "#12130f", muted: "#55584d", direction: -1 },
  dark: { card: "#1a1c18", ink: "#f2f3ef", muted: "#a4a89c", direction: +1 },
};

/** The tile's own wash, and the card's. Keep in step with the components. */
const TILE_PCT = 12;
const CARD_PCT = 6;
/**
 * The bar is WCAG 1.4.11's 3:1. The search targets 3.1 so a value ships with a
 * tenth of air rather than sitting on the line — the posture
 * `icon-tile-contrast.mjs` already takes, where 14% was the last mix to clear
 * 3:1 at 3.01 and 12% was chosen instead at 3.11.
 */
const GRAPHIC = 3;
const TARGET = 3.1;
const TEXT = 4.5;

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

const lum = (h) => {
  const [r, g, b] = rgb(h).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

const mix = (hue, base, pct) => {
  const h = rgb(hue);
  const b = rgb(base);
  return hex(h.map((v, i) => (v * pct + b[i] * (100 - pct)) / 100));
};

/* --- HSL, so the hue is held and only the lightness moves ---------------- */

function toHsl(h) {
  const [r, g, b] = rgb(h).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let hh;
  if (max === r) hh = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) hh = ((b - r) / d + 2) / 6;
  else hh = ((r - g) / d + 4) / 6;
  return [hh, s, l];
}

function toHex([h, s, l]) {
  if (!s) { const v = l * 255; return hex([v, v, v]); }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return hex([ch(h + 1 / 3) * 255, ch(h) * 255, ch(h - 1 / 3) * 255]);
}

/* --- derive ------------------------------------------------------------- */

let worst = { r: Infinity };
const out = {};

for (const [scheme, s] of Object.entries(SCHEMES)) {
  out[scheme] = {};
  console.log(`\n${scheme}  (card ${s.card})`);

  for (const [name, base] of Object.entries(GOOGLE)) {
    const [h, sat, l0] = toHsl(base);

    let picked = null;
    // 1% steps from Google's own lightness, away from the card's.
    for (let step = 0; step <= 100; step++) {
      const l = Math.min(0.98, Math.max(0.02, l0 + s.direction * step * 0.01));
      const cand = toHex([h, sat, l]);
      const tile = mix(cand, s.card, TILE_PCT);
      const r = ratio(cand, tile);
      if (r >= TARGET) { picked = { cand, tile, r, moved: step }; break; }
    }

    if (!picked) { console.log(`  ${name}: no value reaches ${TARGET}:1`); continue; }

    const card = mix(picked.cand, s.card, CARD_PCT);
    const inkR = ratio(s.ink, card);
    const mutedR = ratio(s.muted, card);
    out[scheme][name] = picked.cand;

    const flag = picked.r >= GRAPHIC && inkR >= TEXT && mutedR >= TEXT ? "ok" : "FAIL";
    if (picked.r < worst.r) worst = { r: picked.r, name, scheme };

    console.log(
      `  ${name.padEnd(7)} ${base} -> ${picked.cand}  (L${picked.moved > 0 ? ` ${s.direction < 0 ? "-" : "+"}${picked.moved}%` : " unchanged"})` +
      `   glyph-on-tile ${picked.r.toFixed(2)}:1   card ${card}   ink ${inkR.toFixed(2)}  muted ${mutedR.toFixed(2)}  ${flag}`,
    );
  }
}

console.log(`\nworst graphic ratio: ${worst.r.toFixed(2)}:1 (${worst.scheme} ${worst.name})`);
console.log("\n--- tokens ---");
for (const [scheme, hues] of Object.entries(out)) {
  console.log(`  ${scheme}:`);
  for (const [name, v] of Object.entries(hues)) console.log(`    --color-g-${name}: ${v};`);
}
