import { chromium } from "playwright";

/**
 * Measures the top bar's `columns` panel and the menu badges end to end
 * (0.150.0): chosen on the Themes screen ("Top bar panel" → Columns), saved
 * through the real form, drawn under the top bar's "Customer Zone".
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/topbar-columns.mjs
 *   RESTORE=1   only puts the choice back to "Same as the menu" and saves.
 *   SHOTS=<dir> saves the open panel at each width.
 *
 * Precondition: the top bar's menu (Site → Menus → Top bar) has a link with a
 * menu under it — a "Customer Zone" whose children are headings holding
 * links — and at least one of those links carries a badge. Against the mock,
 * `MOCK_TOPBAR_MENU=1 npm run mock` serves exactly that. Without a panel the
 * probe exits 2 and says so.
 *
 * Checks, at 1280 and 1920:
 *   1. the panel opens on hover and is `data-topbar-style="columns"`;
 *   2. two or more columns sit side by side (same top, rising left edge);
 *   3. each heading is uppercase, letter-spaced and 12px or more;
 *   4. badges are drawn: uppercase, a 1px border in the text's own colour, no
 *      fill, 12px or more, and the text clears 4.5:1 on the panel's ground;
 *   5. the panel's top edge is a 2px line in the brand colour (or the theme's
 *      own idiom for it: a non-zero top border or the gradient pseudo-element);
 *   6. the panel lies inside the viewport, and the page does not scroll
 *      sideways with it open.
 *
 * Signs in through the real form via `signInAsStaff`; carries no credential.
 * Uses the active theme's options — run it against a development database,
 * and it puts the choice back unless KEEP=1.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS;
const RESTORE = process.env.RESTORE === "1";
const KEEP = process.env.KEEP === "1";
const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

process.env.BASE = BASE; // shared.mjs signs in at its own default host otherwise
const { signInAsStaff } = await import("../shared.mjs");

async function choose(label) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  await signInAsStaff(page);
  await page.goto(`${BASE}/admin/themes`, { waitUntil: "load", timeout: 180000 });
  const group = page.locator("fieldset", { has: page.locator("legend", { hasText: "Top bar panel" }) });
  await group.waitFor({ timeout: 60000 });
  await group.locator("label", { hasText: label }).first().click();
  const save = page.getByRole("button", { name: /Save options|Activate/ });
  await page.waitForTimeout(300);
  // Already the stored choice: the form is not dirty and Save stays disabled.
  if (await save.isEnabled()) {
    await save.click();
    await page.waitForTimeout(4000);
  }
  await ctx.close();
}

if (RESTORE) {
  await choose("Same as the menu");
  await browser.close();
  console.log("restored");
  process.exit(0);
}

await choose("Columns");

for (const width of [1280, 1920]) {
  const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "load", timeout: 180000 });
  const dialog = page.locator("dialog[open]").first();
  await dialog.waitFor({ state: "visible", timeout: 6000 }).catch(() => {});
  if (await dialog.count()) await page.keyboard.press("Escape").catch(() => {});

  console.log(`--- ${width}px`);
  const host = page.locator("div[data-panel-host].group").last();
  if (!(await host.count())) {
    console.error("No top-bar item carries a panel: give one children in /admin/menus first (or MOCK_TOPBAR_MENU=1 with the mock).");
    process.exit(2);
  }
  await host.hover();
  const panel = host.locator('[data-panel="topbar"]');
  await panel.waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(600); // the panel fades in over --duration-menu (340ms)
  ok((await panel.getAttribute("data-topbar-style")) === "columns", "the panel is the columns shape");

  const cols = await page.evaluate(() => [...document.querySelectorAll('[data-panel="topbar"] [data-topbar-column]')].map((c) => { const r = c.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width }; }));
  ok(cols.length >= 2, `${cols.length} columns drawn`);
  ok(cols.every((c, i) => i === 0 || (Math.abs(c.top - cols[0].top) < 2 && c.left > cols[i - 1].left)), "columns sit side by side on one row");
  ok(cols.every((c) => Math.abs(c.width - 240) < 2), "each column is a fixed 240px");

  const heads = await page.evaluate(() => [...document.querySelectorAll('[data-panel="topbar"] [data-topbar-heading]')].map((h) => { const s = getComputedStyle(h); return { upper: s.textTransform === "uppercase" || h.textContent === h.textContent.toUpperCase(), spacing: parseFloat(s.letterSpacing) || 0, size: parseFloat(s.fontSize) }; }));
  ok(heads.length >= 1 && heads.every((h) => h.upper && h.spacing > 0 && h.size >= 12), `${heads.length} headings: uppercase, letter-spaced, 12px or more`);

  const badges = await page.evaluate(() => {
    // WCAG contrast of two plain `rgb()`/`rgba()` strings; null for anything else.
    const rgb = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); return m ? m[1].split(/[ ,/]+/).slice(0, 3).map(Number) : null; };
    const lum = ([r, g, bl]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl); };
    const contrast = (a, c) => {
      const x = rgb(a), y = rgb(c);
      if (!x || !y) return null;
      const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p);
      return (hi + 0.05) / (lo + 0.05);
    };
    const panelEl = document.querySelector('[data-panel="topbar"]');
    const ground = getComputedStyle(panelEl).backgroundColor;
    return [...panelEl.querySelectorAll("[data-menu-badge]")].map((el) => {
      const s = getComputedStyle(el);
      return {
        tone: el.getAttribute("data-menu-badge"), upper: s.textTransform === "uppercase", border: s.borderTopWidth,
        sameColour: s.borderTopColor === s.color, clear: s.backgroundColor === "rgba(0, 0, 0, 0)",
        size: parseFloat(s.fontSize), ratio: contrast(s.color, ground),
      };
    });
  });
  ok(badges.length >= 1, `${badges.length} badges drawn`);
  ok(badges.every((b) => b.upper && b.border === "1px" && b.sameColour && b.clear && b.size >= 12), "badges: uppercase, 1px outline in the text colour, no fill, 12px or more");
  ok(badges.every((b) => b.ratio === null || b.ratio >= 4.5), `badge contrast on the panel: ${badges.map((b) => `${b.tone} ${b.ratio?.toFixed(2)}`).join(", ")}`);

  const edge = await panel.evaluate((el) => { const s = getComputedStyle(el); return { top: s.borderTopWidth, pseudo: getComputedStyle(el, "::before").content }; });
  ok(parseFloat(edge.top) >= 2 || edge.pseudo !== "none", `a line along the top edge (${edge.top}, ::before ${edge.pseudo})`);

  const box = await panel.boundingBox();
  ok(box && box.x >= 0 && box.x + box.width <= width + 0.5, `the panel is inside the viewport (${Math.round(box?.x ?? -1)}–${Math.round((box?.x ?? 0) + (box?.width ?? 0))} of ${width})`);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(over <= 0, `no horizontal scroll with it open (${over})`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/topbar-columns-${width}.png` });
  await ctx.close();
}

if (!KEEP) await choose("Same as the menu");
await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
