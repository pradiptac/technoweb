/**
 * No homepage tile section ends on a half-empty row, in any theme —
 * `node scripts/probes/full-rows.mjs`.
 *
 * The client's rule (2026-09-28, docs/themes.md): a `Collection` marked
 * `fill` (`data-fill="rows"`) is a selection, and `components/ui/full-rows.tsx`
 * drops a short last row under a full one and widens a list shorter than a
 * row. This opens `/theme-preview/<id>` for each theme at 1920, 1440, 1024
 * and 390 and, for every such section, checks that the band of the last
 * row reaches the grid's right edge — Launch's lead tile, which spans two
 * rows, counts where it reaches into that band. Reads layout offsets, not
 * rects, so a section mid-reveal measures where it lands.
 *
 * Signs in through ADMIN_LOGIN_EMAIL / ADMIN_LOGIN_PASSWORD (the preview is
 * staff-only). `BASE` from scripts/shared.mjs; `THEMES=a,b` narrows the run.
 */
import { chromium } from "playwright";
import { BASE, signInAsStaff } from "../shared.mjs";

const THEMES = (process.env.THEMES ?? "classic,editorial,datacenter,launch,terminal,enterprise,summit,horizon,canvas,sentinel,vantage,keystone").split(",");
const WIDTHS = [1920, 1440, 1024, 390];
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
await signInAsStaff(page);
let failures = 0;

for (const theme of THEMES) {
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(`${BASE}/theme-preview/${theme}`, { waitUntil: "load", timeout: 180000 });
    // Hydration on a dev server can take seconds; measure once every section has settled.
    await page.waitForFunction(() => [...document.querySelectorAll('[data-fill="rows"]')].every((g) => g.hasAttribute("data-fill-settled")), null, { timeout: 60000 });
    await page.waitForTimeout(300);
    const rows = await page.evaluate(() => [...document.querySelectorAll('[data-fill="rows"]')].map((grid) => {
      const inside = (el) => el.offsetParent === grid;
      const items = [...grid.children].filter((el) => el.offsetParent !== null && el.offsetWidth > 0).map((el) => ({
        top: el.offsetTop - (inside(el) ? 0 : grid.offsetTop),
        left: el.offsetLeft - (inside(el) ? 0 : grid.offsetLeft),
        width: el.offsetWidth, height: el.offsetHeight,
      }));
      const cs = getComputedStyle(grid);
      const inner = grid.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const kind = grid.getAttribute("data-collection");
      if (items.length === 0) return { kind, shown: 0, cut: 0, full: true };
      const lastTop = Math.max(...items.map((i) => i.top));
      const band = items.filter((i) => i.top <= lastTop + 1 && i.top + i.height > lastTop + 1);
      const reach = Math.max(...band.map((i) => i.left + i.width)) - Math.min(...band.map((i) => i.left));
      return { kind, shown: items.length, cut: grid.querySelectorAll(":scope > [data-row-cut]").length, full: reach >= inner - 4, reach: Math.round(reach), inner: Math.round(inner) };
    }));
    const bad = rows.filter((r) => !r.full);
    failures += bad.length;
    console.log(`${theme.padEnd(10)} ${String(w).padStart(4)}  ${rows.map((r) => `${r.kind}:${r.shown}${r.cut ? `(-${r.cut})` : ""}${r.full ? "" : " SHORT"}`).join("  ")}`);
  }
}

await b.close();
console.log(failures ? `FAIL: ${failures} section(s) end on a short row` : "PASS: every homepage section ends on a full row");
process.exit(failures ? 1 : 0);
