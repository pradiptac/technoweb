/**
 * Pick fluorescent icon colours that actually clear WCAG 1.4.11 (3:1 for a
 * meaningful graphical object) against the nav background in each scheme.
 *
 * True neon is a light, highly saturated colour — #39FF14 on near-white is
 * about 1.4:1. So the hue is kept and the lightness is searched until the
 * ratio clears the bar: on light that means going darker, on dark it means the
 * neon can stay as bright as it wants to be.
 */

const LIGHT_BG = "#f4f4ef"; // surface-2, the darkest light row a nav icon sits on
const DARK_BG = "#151613";  // its dark-scheme value

const lum = (hex) => {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const hslToHex = (h, s, l) => {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return "#" + [f(0), f(8), f(4)]
    .map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
};

/** The fluorescent hues, in the order they will be handed out. */
const HUES = [
  ["lime", 96], ["cyan", 186], ["magenta", 316], ["orange", 26], ["violet", 268],
  ["spring", 152], ["rose", 342], ["azure", 208], ["amber", 44], ["jade", 168],
  ["fuchsia", 292], ["coral", 8],
];

/** Walk lightness until the ratio clears `target`, keeping saturation pinned. */
const tune = (hue, bg, target, from, step) => {
  for (let l = from; l >= 12 && l <= 92; l += step) {
    const hex = hslToHex(hue, 96, l);
    if (ratio(hex, bg) >= target) return { hex, l, r: ratio(hex, bg) };
  }
  return null;
};

console.log("name      light                     dark");
const out = [];
for (const [name, hue] of HUES) {
  // Light: start bright and darken until it clears.
  const light = tune(hue, LIGHT_BG, 3.35, 62, -1);
  // Dark: start bright; neon clears easily, so this mostly confirms it.
  const dark = tune(hue, DARK_BG, 3.05, 74, 1) ?? tune(hue, DARK_BG, 3.05, 74, -1);
  out.push({ name, light: light.hex, dark: dark.hex });
  console.log(
    `${name.padEnd(9)} ${light.hex} ${light.r.toFixed(2)}:1 (L${light.l})   ` +
    `${dark.hex} ${dark.r.toFixed(2)}:1 (L${dark.l})`,
  );
}

console.log("\n--- tokens ---");
console.log(out.map((c, i) => `  --color-neon-${i + 1}: ${c.light};`).join("\n"));
console.log("\n--- dark ---");
console.log(out.map((c, i) => `  --color-neon-${i + 1}: ${c.dark};`).join("\n"));
