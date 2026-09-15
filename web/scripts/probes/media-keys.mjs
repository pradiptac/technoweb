import { chromium } from "playwright";

/**
 * Measures the media grid's keyboard (`admin/(app)/media/media-grid.tsx`).
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/media-keys.mjs
 *
 * Checks: (1) exactly one tile is a tab stop; (2) ArrowRight moves focus to
 * the next tile and ArrowDown by one rendered row (the column count read
 * from the grid's own style, so the check is right at any tile size);
 * (3) Space opens the preview and Escape closes it; (4) `x` ticks the tile
 * and the selection bar appears; (5) Delete asks — the dialog is cancelled,
 * so nothing is binned. Nothing is written.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const { signInAsStaff } = await import("../shared.mjs");
await signInAsStaff(page);
await page.goto(`${BASE}/admin/media`, { waitUntil: "load", timeout: 120000 });

const tiles = page.locator('ul[aria-label="Files"] > li');
const count = await tiles.count();
ok(count >= 3, `${count} tiles on the page`);
ok((await page.locator('ul[aria-label="Files"] > li[tabindex="0"]').count()) === 1, "one tile is the tab stop");

await tiles.first().focus();
const focusedIndex = () => page.evaluate(() => {
  const ul = document.querySelector('ul[aria-label="Files"]');
  return Array.prototype.indexOf.call(ul.children, document.activeElement);
});
await page.keyboard.press("ArrowRight");
ok((await focusedIndex()) === 1, "ArrowRight moves to the next tile");
const cols = await page.evaluate(() => getComputedStyle(document.querySelector('ul[aria-label="Files"]')).gridTemplateColumns.split(" ").length);
await page.keyboard.press("ArrowDown");
ok((await focusedIndex()) === Math.min(1 + cols, count - 1), `ArrowDown moves by a row (${cols} columns)`);

await page.keyboard.press("Space");
const preview = page.locator("dialog[open]");
await preview.waitFor({ timeout: 5000 }).catch(() => {});
ok((await preview.count()) === 1, "Space opens the preview");
await page.keyboard.press("Escape");
await page.waitForFunction(() => !document.querySelector("dialog[open]"), null, { timeout: 5000 }).catch(() => {});
ok((await page.locator("dialog[open]").count()) === 0, "Escape closes it");

await tiles.first().focus();
await page.keyboard.press("x");
await page.waitForSelector("text=/1 file selected/", { timeout: 5000 }).catch(() => {});
ok((await page.locator("text=/1 file selected/").count()) === 1, "x ticks the tile and the bar appears");
await page.keyboard.press("x");

await tiles.first().focus();
await page.keyboard.press("Delete");
// The confirmation is the media screen's own `Dialog` (a `role="dialog"` box), not a native <dialog>.
const confirm = page.locator('[role="dialog"]', { hasText: "Delete" });
await confirm.waitFor({ timeout: 5000 }).catch(() => {});
ok((await confirm.count()) === 1, "Delete asks first");
await confirm.getByRole("button", { name: "Cancel" }).click();
await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), null, { timeout: 5000 }).catch(() => {});
ok((await tiles.count()) === count, "cancelled: nothing binned");

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
