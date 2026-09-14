import { chromium } from "playwright";
const b = await chromium.launch(); const out = process.env.TEMP;
for (const [w, scheme] of [[1920, "light"], [1440, "light"], [1440, "dark"], [1024, "light"], [390, "light"]]) {
  const c = await b.newContext({ viewport: { width: w, height: 900 } });
  await c.addInitScript((s) => { try { localStorage.tw_scheme_site = s; sessionStorage.tw_splash = "1"; } catch {} }, scheme);
  const p = await c.newPage();
  await p.goto("http://localhost:3000/blog", { waitUntil: "networkidle" });
  const r = await p.evaluate(() => {
    const box = (el) => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    const grid = document.querySelector('.grid:has(> article)');
    const lead = grid.children[0]; const rows = [...grid.querySelectorAll(':scope > ul > li')];
    return {
      lead: box(lead),
      rows: rows.map((li) => ({ li: box(li), thumb: box(li.querySelector('span')), img: li.querySelector('img') ? box(li.querySelector('img')) : null, title: li.querySelector('h3').textContent })),
      chips: [...grid.querySelectorAll(':scope > ul a > span')].slice(0, 3).map((s) => { const cs = getComputedStyle(s); return { t: s.textContent, color: cs.color, bg: cs.backgroundColor, border: cs.borderColor }; }),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      caption: (() => { const ov = lead.querySelector('.absolute.inset-x-0'); const h2 = ov.querySelector('h2'); const o = ov.getBoundingClientRect(), t = ov.querySelector('ul').getBoundingClientRect(), hh = h2.getBoundingClientRect();
        return { overlayH: +o.height.toFixed(1), solidFrom: +(o.bottom - o.height * .6).toFixed(1), chipsTop: +t.top.toFixed(1), titleTop: +hh.top.toFixed(1), inSolid: t.top >= o.bottom - o.height * .6 }; })(),
    };
  });
  console.log(w, scheme, JSON.stringify(r, null, 1));
  const grid = p.locator('[data-aos] > .grid').first();
  await grid.screenshot({ path: `${out}/blog-hero-${w}-${scheme}.png` });
  await c.close();
}
await b.close();
