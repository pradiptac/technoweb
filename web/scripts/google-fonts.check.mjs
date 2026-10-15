// node --experimental-strip-types scripts/google-fonts.check.mjs
// Pins lib/google-fonts.ts: what the API publishes becomes same-origin
// @font-face rules, and nothing typed can reach the stylesheet.
import { googleFontsFor, googleFontsCss, googleFontVariable } from "../src/lib/google-fonts.ts";

let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const good = {
  google_fonts: JSON.stringify([{
    id: "g-noto-sans", slug: "noto-sans", family: "Noto Sans", category: "sans-serif",
    faces: [{ weight: 400, range: "U+0000-00FF, U+0131", path: "fonts/google/noto-sans/0.woff2" }],
  }]),
};
const rows = googleFontsFor(good);
ok(rows.length === 1 && rows[0].faces[0].href === "/font/g/noto-sans/0.woff2", "a stored path becomes a same-origin URL");
const css = googleFontsCss(rows);
ok(css.includes('font-family:"tw-g-noto-sans"') && css.includes("unicode-range:U+0000-00FF, U+0131"), "rules use our family name and Google's range");
ok(css.includes('--font-g-noto-sans:"tw-g-noto-sans",ui-sans-serif'), "the variable falls back to the category's generic");

const bad = {
  google_fonts: JSON.stringify([{
    slug: "x", family: "</style><script>", category: "sans-serif",
    faces: [
      { weight: 400, range: "U+0000;}body{display:none", path: "fonts/google/x/0.woff2" },
      { weight: 400, range: "U+0000", path: "https://evil.example/f.woff2" },
      { weight: 400, range: "U+0000", path: "fonts/google/other/0.woff2" },
    ],
  }]),
};
ok(googleFontsFor(bad).length === 0, "a bad range, a foreign path or another slug's file is dropped");
ok(!googleFontsCss(googleFontsFor(bad)).includes("script"), "a typed family name never reaches the CSS");

ok(googleFontVariable("g-noto-sans") === "--font-g-noto-sans" && googleFontVariable("inter") === null && googleFontVariable("g-A!") === null, "only well-formed g- ids resolve");
ok(googleFontsFor({ google_fonts: "{not json" }).length === 0, "broken JSON yields nothing");
ok(googleFontsFor({}).length === 0, "an absent setting yields nothing");

process.exit(failed ? 1 : 0);
