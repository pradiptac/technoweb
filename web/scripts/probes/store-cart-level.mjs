/**
 * Every Add to basket in a row of product cards sits on one line, in every
 * theme — `node scripts/probes/store-cart-level.mjs`.
 *
 * The client's rule (2026-09-28, CLAUDE.md "The store"): the actions row is
 * the card's last part with `mt-auto`, so a two-line name, a longer summary
 * or a wrapped discount badge above it cannot move it. Opens `/store` at
 * 1440 and 390, switches `data-theme` through all twelve themes (every
 * theme's stylesheet is always loaded, and the card is one component), and
 * groups the cards by their top *and* bottom — Launch's bento lead tile
 * spans two rows and is a row of its own. Fails on a spread over 1px.
 * `BASE` from scripts/shared.mjs.
 */
import { chromium } from "playwright";
import { BASE } from "../shared.mjs";

const THEMES = ["classic", "editorial", "datacenter", "launch", "terminal", "enterprise", "summit", "horizon", "canvas", "sentinel", "vantage", "keystone"];
const b = await chromium.launch();
let worst = 0;

for (const [w, h] of [[1440, 900], [390, 844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto(`${BASE}/store`, { waitUntil: "load", timeout: 180000 });
  await p.waitForTimeout(3000);

  for (const theme of THEMES) {
    const r = await p.evaluate(async (theme) => {
      document.querySelectorAll("[data-theme]").forEach((el) => el.setAttribute("data-theme", theme));
      await new Promise((res) => setTimeout(res, 150));
      let worst = 0; let rows = 0;
      for (const grid of document.querySelectorAll('[data-collection="products"]')) {
        const byRow = new Map();
        for (const card of grid.querySelectorAll('[data-tile-kind="product"]')) {
          const a = card.querySelector("[data-tile-actions]");
          if (!a || !a.offsetParent) continue;
          const cr = card.getBoundingClientRect(); const top = `${Math.round(cr.top)}:${Math.round(cr.bottom)}`; // a bento tile spanning two rows is its own row
          if (!byRow.has(top)) byRow.set(top, []);
          byRow.get(top).push(a.getBoundingClientRect().top);
        }
        for (const tops of byRow.values()) {
          if (tops.length < 2) continue;
          rows++;
          worst = Math.max(worst, Math.max(...tops) - Math.min(...tops));
        }
      }
      return { rows, worst: Math.round(worst * 10) / 10 };
    }, theme);
    worst = Math.max(worst, r.worst);
    console.log(`${w}px ${theme.padEnd(11)} rows ${String(r.rows).padStart(2)}  spread ${r.worst}px`);
  }
  await p.close();
}

await b.close();
console.log(worst <= 1 ? "PASS: every Add to basket in a row on one line" : `FAIL: worst spread ${worst}px`);
process.exit(worst <= 1 ? 0 : 1);
