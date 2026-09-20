/**
 * The gallery lightbox's flow — `node scripts/probes/lightbox-flow.mjs`.
 *
 * Opens the first picture on /gallery at 1280 and 360 and reads the stage:
 * five pictures placed by offset (the current at `-50%`, `y 0deg`, no
 * filter; the neighbours turned, blurred and dimmed), the thumbnail strip
 * with the current one marked, no overflow, no console errors; then
 * presses Next and reads the counter and the strip again. `BASE` from
 * scripts/shared.mjs.
 */
import { BASE } from "../shared.mjs";
import { chromium } from "playwright";
const b = await chromium.launch();
for (const width of [1280, 360]) {
  const p = await b.newPage({ viewport: { width, height: 800 } });
  const errors = []; p.on("pageerror", e => errors.push(e.message)); p.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await p.goto(`${BASE}/gallery`, { waitUntil: "networkidle" });
  await p.click('main button:has(span.sr-only:text-matches("at full size")) >> nth=0');
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => {
    const d = document.querySelector("dialog[open]");
    const slides = [...d.querySelectorAll(".stage3d > div")].map(s => ({ hidden: s.getAttribute("aria-hidden"), t: getComputedStyle(s).translate, r: getComputedStyle(s).rotate, f: getComputedStyle(s).filter, o: getComputedStyle(s).opacity, w: Math.round(s.getBoundingClientRect().width) }));
    const thumbs = d.querySelectorAll('button[aria-label^="Show picture"]');
    return { open: !!d, counter: d.querySelector(".font-mono").textContent, slides, thumbs: thumbs.length, currentThumb: [...thumbs].findIndex(t => t.getAttribute("aria-current")), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  console.log(width, JSON.stringify(r));
  await p.click('dialog button[aria-label="Next picture"]');
  await p.waitForTimeout(450);
  console.log("  after next:", await p.evaluate(() => { const d = document.querySelector("dialog[open]"); const cur = d.querySelector(".stage3d > div:not([aria-hidden])"); return JSON.stringify({ counter: d.querySelector(".font-mono").textContent, t: getComputedStyle(cur).translate, thumb: [...d.querySelectorAll('button[aria-label^="Show picture"]')].findIndex(t => t.getAttribute("aria-current")) }); }), "errors", errors.length ? errors : "none");
  await p.close();
}
await b.close();
