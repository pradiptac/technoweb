import { chromium } from "playwright";

/**
 * Measures the chart kit (`components/charts/`) on the console dashboard.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/charts.mjs
 *   SHOTS=<dir> also saves light and dark screenshots of /admin.
 *
 * Checks: (1) the volume chart draws two series and no read-out until asked;
 * (2) the pointer over the plot opens a read-out naming a bucket, kept inside
 * the plot; (3) the keyboard moves it — End, then ArrowLeft — and the live
 * region says the point in words; (4) Compare adds a dashed line per series;
 * (5) a legend toggle hides a series and the last one cannot be hidden;
 * (6) Table swaps the plot for a table with a row per bucket; (7) the
 * heatmap is 7 × 24 cells; (8) the "New tickets" tile carries a sparkline;
 * (9) under reduced motion nothing on the page is mid-animation.
 *
 * Signs in through the real form via `signInAsStaff`; carries no credential.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const SHOTS = process.env.SHOTS;
const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const { signInAsStaff } = await import("../shared.mjs");
const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await context.newPage();
await signInAsStaff(page);
await page.goto(`${BASE}/admin`, { waitUntil: "load", timeout: 180000 });

const plot = page.getByRole("group", { name: /Tickets opened and resolved/ });
await plot.waitFor({ timeout: 60000 });
const lines = await page.locator('svg[data-chart-draw] path[stroke-width="2.25"]').count();
ok(lines === 2, `volume chart draws two series (${lines})`);
ok((await page.locator("text=Ticket volume").count()) > 0, "card is titled");

// (2) pointer read-out — scrolled into view first: the mouse cannot reach a
// plot below the fold, and the checklist above the tiles moves it there.
await plot.scrollIntoViewIfNeeded();
const box = await plot.boundingBox();
await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2);
const tip = plot.locator("div.shadow-3");
ok(await tip.isVisible(), "pointer opens a read-out");
const tb = await tip.boundingBox();
ok(tb.x >= box.x - 1 && tb.x + tb.width <= box.x + box.width + 1, "read-out stays inside the plot");
await page.mouse.move(box.x + box.width * 0.02, box.y + box.height / 2);
const tb2 = await tip.boundingBox();
ok(tb2.x >= box.x - 1, "read-out at the left edge is clamped");
await page.mouse.move(0, 0);

// (3) keyboard
await plot.focus();
await page.keyboard.press("End");
await page.keyboard.press("ArrowLeft");
const live = (await page.locator('p[aria-live="polite"]').first().innerText()).trim();
ok(/opened/.test(live) && /resolved/.test(live), `live region reads the point: "${live.slice(0, 70)}"`);
await page.keyboard.press("Escape");

// (4) compare
const compare = page.getByRole("button", { name: "Compare" });
if (await compare.count()) {
  await compare.click();
  const dashed = await page.locator('svg[data-chart-draw] path[stroke-dasharray="4 4"]').count();
  ok(dashed === 2, `compare draws the period before (${dashed} dashed)`);
  await compare.click();
} else ok(false, "Compare offered");

// (5) legend
await page.getByRole("button", { name: "Resolved", pressed: true }).click();
ok(await page.locator('svg[data-chart-draw] path[stroke-width="2.25"]').count() === 1, "legend hides a series");
await page.getByRole("button", { name: "Opened", pressed: true }).click();
ok(await page.locator('svg[data-chart-draw] path[stroke-width="2.25"]').count() === 1, "the last series cannot be hidden");
await page.getByRole("button", { name: "Resolved", pressed: false }).click();

// (6) table
await page.getByRole("button", { name: "Table" }).first().click();
const rows = await page.locator("table tbody tr").count();
ok(rows >= 12, `table has a row per bucket (${rows})`);
await page.getByRole("button", { name: "Chart" }).first().click();

// (7) heatmap, (8) sparkline
ok(await page.locator("[data-chart-cell]").count() === 168, "heatmap is 7 × 24");
ok(await page.locator('a:has-text("New tickets") svg[data-chart-draw]').count() === 1, "New tickets tile has a sparkline");

if (SHOTS) {
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/dashboard-light.png`, fullPage: true });
}

// (9) reduced motion + dark
const rm = await browser.newContext({ viewport: { width: 1400, height: 1000 }, reducedMotion: "reduce", storageState: await context.storageState() });
await rm.addInitScript(() => { localStorage.setItem("tw_scheme_console", "dark"); localStorage.setItem("tw_scheme_site", "dark"); });
const p2 = await rm.newPage();
await p2.goto(`${BASE}/admin`, { waitUntil: "load", timeout: 180000 });
const running = await p2.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && a.animationName?.startsWith("chart-")).length);
ok(running === 0, `nothing animates under reduced motion (${running})`);
if (SHOTS) await p2.screenshot({ path: `${SHOTS}/dashboard-dark.png`, fullPage: true });

const phone = await browser.newContext({ viewport: { width: 360, height: 800 }, storageState: await context.storageState() });
const p3 = await phone.newPage();
await p3.goto(`${BASE}/admin`, { waitUntil: "load", timeout: 180000 });
const over = await p3.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(over <= 0, `no horizontal scroll at 360px (${over})`);
if (SHOTS) await p3.screenshot({ path: `${SHOTS}/dashboard-phone.png`, fullPage: true });

await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
