import { chromium } from "playwright";

/**
 * Measures the catalogue's compare tray (`components/product/compare.tsx`,
 * `lib/compare.ts`) and the page it opens (`/products/compare`).
 *
 *   node scripts/probes/compare.mjs
 *
 * Checks: (1) the catalogue renders no tray until something is ticked, and
 * the tick sits outside the card's link; (2) one tick shows the tray with
 * "one more" and no Compare link; (3) two ticks give a Compare link to
 * `/products/compare?p=a,b`; (4) that page renders a column per product and
 * the union of their spec keys as rows; (5) the tray survives the
 * navigation (sessionStorage) and Clear empties it.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const dismiss = async () => { await page.locator("dialog[open]").first().waitFor({ state: "visible", timeout: 3000 }).catch(() => {}); await page.keyboard.press("Escape").catch(() => {}); };

await page.goto(`${BASE}/products/switches`, { waitUntil: "load", timeout: 120000 });
await dismiss();
ok((await page.locator("[data-compare-tray]").count()) === 0, "no tray before anything is ticked");
const ticks = page.locator('input[aria-label^="Compare "]');
ok((await ticks.count()) >= 2, `${await ticks.count()} compare ticks on the listing`);
ok(await ticks.first().evaluate((el) => !el.closest("a")), "the tick is outside the card's link");

await ticks.nth(0).check();
const tray = page.locator("[data-compare-tray]");
await tray.waitFor({ timeout: 5000 });
ok((await tray.innerText()).includes("Tick one more"), "one tick: the tray asks for one more");
ok((await tray.getByRole("link", { name: /Compare/ }).count()) === 0, "and offers no Compare link yet");

await ticks.nth(1).check();
const link = tray.getByRole("link", { name: /Compare/ });
await link.waitFor({ timeout: 5000 });
const href = await link.getAttribute("href");
ok(/^\/products\/compare\?p=[a-z0-9-]+,[a-z0-9-]+$/.test(href), `two ticks: ${href}`);

await link.click();
await page.waitForURL((u) => u.pathname === "/products/compare", { timeout: 60000 });
const columns = await page.locator("thead th").count() - 1;
ok(columns === 2, `the page has ${columns} product columns`);
const rows = await page.locator('tbody th[scope="row"]').count();
ok(rows >= 2, `${rows} specification rows`);
ok((await page.locator("[data-compare-tray]").count()) === 1, "the tray survived the navigation");
await page.locator("[data-compare-tray]").getByRole("button", { name: "Clear" }).click();
await page.waitForFunction(() => !document.querySelector("[data-compare-tray]"), null, { timeout: 5000 }).catch(() => {});
ok((await page.locator("[data-compare-tray]").count()) === 0, "Clear empties it");

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
