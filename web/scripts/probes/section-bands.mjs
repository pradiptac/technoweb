import { chromium } from "playwright";

/**
 * The builder's figures, steps and tabs sections (0.107.0,
 * `page-sections/visual-sections.tsx`), measured in a browser.
 *
 *   PAGE=<slug of a published builder page with a bars section, vertical
 *   steps and a tabs section> node scripts/probes/section-bands.mjs
 *
 * Checks: (1) a bar is part-way through growing shortly after its section
 * scrolls into view, and full at rest — sampled mid-flight, because a value
 * read at once is the start and one read later is the end, and neither says
 * anything moved; (2) the steps' line is drawn by the time it rests;
 * (3) under reduced motion the bar is full the moment it is seen;
 * (4) the tabs: one tab stop, ArrowRight selects the next tab and shows its
 * panel, End the last, and the hidden panels are in the markup; (5) no
 * console errors.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const PAGE = process.env.PAGE;
if (!PAGE) { console.error("PAGE is required"); process.exit(2); }

const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const problems = [];

const scaleX = (page, sel) => page.locator(sel).first().evaluate((el) => {
  const m = getComputedStyle(el).transform;
  return m === "none" ? 1 : Number(m.match(/matrix\(([^,]+)/)?.[1] ?? 1);
});

{
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on("console", (m) => { if (m.type() === "error") problems.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => problems.push(e.message.slice(0, 200)));
  await page.goto(`${BASE}/${PAGE}`, { waitUntil: "load", timeout: 180000 });
  await page.waitForTimeout(1500);

  // (1) the bars grow when reached
  const bars = page.locator('[data-page-section="stats"]:has([data-meter-fill])').first();
  await bars.scrollIntoViewIfNeeded();
  await page.waitForTimeout(650);
  const mid = await scaleX(page, '[data-page-section="stats"] [data-meter-fill]');
  await page.waitForTimeout(1800);
  const rest = await scaleX(page, '[data-page-section="stats"] [data-meter-fill]');
  ok(mid > 0.05 && mid < 0.97, `a bar is part-way through growing (${mid.toFixed(2)})`);
  ok(rest > 0.99, `and full at rest (${rest.toFixed(2)})`);

  // (2) the steps' line
  const line = page.locator("[data-step-line]").first();
  await line.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2000);
  const drawn = await line.evaluate((el) => { const m = getComputedStyle(el).transform; return m === "none" ? 1 : Number(m.split(",")[3]); });
  ok(drawn > 0.99, `the steps' line is drawn at rest (${drawn})`);

  // (4) tabs
  const tabs = page.locator("[data-section-tabs] [role=tab]");
  const count = await tabs.count();
  ok(count >= 2, `the tabs section draws its tabs (${count})`);
  const focusable = await tabs.evaluateAll((els) => els.filter((e) => e.tabIndex === 0).length);
  ok(focusable === 1, "one tab stop");
  await tabs.first().focus();
  await page.keyboard.press("ArrowRight");
  ok(await tabs.nth(1).getAttribute("aria-selected") === "true", "ArrowRight selects the next tab");
  ok(await page.locator("[data-section-tabs] [role=tabpanel]").nth(1).isVisible(), "and shows its panel");
  await page.keyboard.press("End");
  ok(await tabs.nth(count - 1).getAttribute("aria-selected") === "true", "End selects the last");
  ok(await page.locator("[data-section-tabs] [role=tabpanel]").count() === count, "every panel is in the markup");
}

{
  // (3) reduced motion: nothing to wait for
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" })).newPage();
  await page.goto(`${BASE}/${PAGE}`, { waitUntil: "load", timeout: 180000 });
  await page.locator('[data-page-section="stats"]:has([data-meter-fill])').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const at = await scaleX(page, '[data-page-section="stats"] [data-meter-fill]');
  ok(at > 0.99, `under reduced motion the bar is full at once (${at.toFixed(2)})`);
}

ok(problems.length === 0, `no console errors${problems.length ? ": " + problems.join(" | ") : ""}`);
await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
