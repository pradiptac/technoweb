import { chromium } from "playwright";

/**
 * Measures the cart badge's burst (`components/layout/cart-badge.tsx`, the
 * `cart-*` keyframes in `globals.css`).
 *
 *   node scripts/probes/cart-burst.mjs
 *
 * Checks, each on a computed value sampled mid-flight rather than on a class
 * name: (1) the header's badge is animating and the disc's `translate`
 * leaves zero within the first second of a cycle; (2) the ring's box-shadow
 * spreads past zero in that window; (3) at four seconds in — the rest —
 * everything is back at zero; (4) hovering the Store link stamps
 * `data-quiet` and the animation is `none`; (5) a reload keeps it quiet
 * (sessionStorage); (6) under `prefers-reduced-motion: reduce` nothing
 * animates and the drop dot is invisible; (7) the page adds no horizontal
 * scroll with the ring at full spread.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 120000 });
await page.keyboard.press("Escape").catch(() => {});
const badge = page.locator("header .cart-burst").first();
await badge.waitFor({ timeout: 10000 });

// Restart the cycle so the sample lands in the burst: toggle the animation off and on.
await badge.evaluate((el) => {
  for (const node of [el, ...el.querySelectorAll("*")]) { node.style.animation = "none"; }
  void el.offsetWidth;
  for (const node of [el, ...el.querySelectorAll("*")]) { node.style.animation = ""; }
});
const samples = [];
for (let i = 0; i < 14; i++) {
  samples.push(await badge.evaluate((el) => {
    const s = getComputedStyle(el);
    return { t: s.translate, shadow: s.boxShadow, rot: getComputedStyle(el.querySelector(".cart-burst-mark")).rotate, drop: getComputedStyle(el.querySelector(".cart-burst-drop")).opacity };
  }));
  await page.waitForTimeout(90);
}
ok(samples.some((s) => s.t !== "none" && s.t !== "0px" && s.t !== "0px 0px" && !/^0px( 0px)?$/.test(s.t)), `disc hops (translate samples: ${[...new Set(samples.map((s) => s.t))].join(" | ")})`);
ok(samples.some((s) => /\) 0px 0px 0px [1-9]/.test(s.shadow) || /[1-9](\.\d+)?px$/.test(s.shadow)), "ring spreads");
ok(samples.some((s) => s.rot !== "none" && s.rot !== "0deg"), `mark tilts (${[...new Set(samples.map((s) => s.rot))].join(" | ")})`);
ok(samples.some((s) => Number(s.drop) > 0.5), "the dot appears mid-burst");

await page.waitForTimeout(3000);
const rest = await badge.evaluate((el) => ({ t: getComputedStyle(el).translate, rot: getComputedStyle(el.querySelector(".cart-burst-mark")).rotate, drop: getComputedStyle(el.querySelector(".cart-burst-drop")).opacity }));
ok(/^(none|0px( 0px)?)$/.test(rest.t) && /^(none|0deg)$/.test(rest.rot) && Number(rest.drop) === 0, `at rest four seconds in (${rest.t}, ${rest.rot}, dot ${rest.drop})`);
ok((await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)), "no horizontal scroll");

await badge.hover();
await page.waitForTimeout(200);
ok((await badge.getAttribute("data-quiet")) !== null, "hovering Store stamps data-quiet");
ok((await badge.evaluate((el) => getComputedStyle(el).animationName)) === "none", "and the animation is none");
await page.reload({ waitUntil: "load" });
await page.keyboard.press("Escape").catch(() => {});
// The server renders it live; the stored answer arrives with hydration.
await page.waitForSelector("header .cart-burst[data-quiet]", { timeout: 10000 }).catch(() => {});
ok((await page.locator("header .cart-burst").first().getAttribute("data-quiet")) !== null, "still quiet after a reload");

const reduced = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
const rp = await reduced.newPage();
await rp.goto(`${BASE}/`, { waitUntil: "load", timeout: 120000 });
await rp.keyboard.press("Escape").catch(() => {});
const r = await rp.locator("header .cart-burst").first().evaluate((el) => ({ anim: getComputedStyle(el).animationName, drop: getComputedStyle(el.querySelector(".cart-burst-drop")).opacity }));
ok(r.anim === "none" && Number(r.drop) === 0, `reduced motion: no animation, dot hidden (${r.anim}, ${r.drop})`);

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
