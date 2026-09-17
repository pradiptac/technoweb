/**
 * The fanned-photos slider — `node scripts/probes/fan-slider.mjs`.
 *
 * Against a homepage whose hero slider is set to the `fan` layout: at 1280
 * and 320 it reads the current card's placement (`0%`, `y 0deg`), a
 * neighbour's (`55% 0 -60px`, `y -12deg`, the brightness and saturation
 * filter), the frame counter, the dots, and that the document does not
 * scroll sideways; then presses Next and samples the arriving card
 * mid-flight and at rest, so the transition is measured rather than
 * assumed. `BASE` from scripts/shared.mjs.
 */
import { BASE } from "../shared.mjs";
import { chromium } from "playwright";
const b = await chromium.launch();
for (const width of [1280, 320]) {
  const p = await b.newPage({ viewport: { width, height: 900 } });
  const errors = []; p.on("pageerror", e => errors.push(e.message)); p.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const r = await p.evaluate(() => {
    const sec = document.querySelector('[aria-roledescription="carousel"]');
    const cards = [...sec.querySelectorAll('button[aria-label^="Show slide"], button[aria-current]:not([aria-label^="Go to"])')];
    const cur = sec.querySelector('button[aria-current]:not([aria-label^="Go to"])');
    const rect = sec.getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      well: [Math.round(rect.width), Math.round(rect.height)],
      cards: cards.length,
      current: cur && { label: cur.getAttribute("aria-label"), translate: getComputedStyle(cur).translate, rotate: getComputedStyle(cur).rotate, w: Math.round(cur.getBoundingClientRect().width) },
      neighbour: (() => { const n = cards.find(c => c !== cur && c.getAttribute("aria-hidden") !== "true"); const cs = getComputedStyle(n); return { translate: cs.translate, rotate: cs.rotate, filter: cs.filter, opacity: cs.opacity }; })(),
      frame: sec.querySelector(".font-mono")?.textContent,
      words: sec.querySelector(".gallery-fade")?.textContent?.trim().slice(0, 50),
      dots: sec.querySelectorAll('button[aria-label^="Go to slide"]').length,
    };
  });
  console.log(width, JSON.stringify(r));
  // press next and measure mid-flight
  await p.click('button[aria-label="Next slide"]');
  await p.waitForTimeout(120);
  const mid = await p.evaluate(() => { const c = document.querySelector('[aria-roledescription="carousel"] button[aria-current]:not([aria-label^="Go to"])'); return { rotate: getComputedStyle(c).rotate, translate: getComputedStyle(c).translate }; });
  await p.waitForTimeout(500);
  const end = await p.evaluate(() => { const s = document.querySelector('[aria-roledescription="carousel"]'); const c = s.querySelector('button[aria-current]:not([aria-label^="Go to"])'); return { rotate: getComputedStyle(c).rotate, translate: getComputedStyle(c).translate, frame: s.querySelector(".font-mono").textContent }; });
  console.log("  mid", JSON.stringify(mid), "end", JSON.stringify(end), "errors", errors.length ? errors : "none");
  await p.close();
}
await b.close();
