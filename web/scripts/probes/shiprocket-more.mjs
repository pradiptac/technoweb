import { chromium } from "playwright";

/**
 * Rate quotes, manifests and return pickups, left on the default (0.159.0,
 * docs/store.md "Shiprocket"), through the real screens.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/shiprocket-more.mjs
 *
 * **It never switches the provider on and it never presses a button that
 * could reach Shiprocket.** Shiprocket has no sandbox: every call acts on a
 * live account. The behaviour itself is `ShiprocketMoreTest`, against a faked
 * service where a stray request fails the test. This probe only proves what
 * the screens draw — and, more to the point, do not draw — while the
 * provider is "By hand", and when the install happens to have Shiprocket on,
 * that the panels are there; it clicks none of them.
 *
 * What it checks:
 *   1. The orders list draws no tick column and no "Make a manifest" bar
 *      while Shiprocket is off, and fits 360 and 1280 without sideways scroll.
 *   2. An order page draws no "See couriers and prices" or "Make the
 *      manifest" while Shiprocket is off.
 *   3. A return page (the first one, if there is one) draws no "Courier
 *      pickup" panel while Shiprocket is off — and with it on, draws the
 *      panel without pressing anything in it.
 *   4. Nothing was POSTed to a shipment, manifest or pickup route.
 *
 * Carries no credential: sign-in is `scripts/shared.mjs`.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const T = 180000;

// The helper signs in on its own default origin; a cookie set there is not
// sent to another host, so both must use one.
process.env.BASE = BASE;
const { signInAsStaff } = await import("../shared.mjs");

const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const note = (l) => console.log(`note ${l}`);

const staff = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await staff.newPage();
const problems = [];
page.on("console", (m) => {
  if (m.type() !== "error" && m.type() !== "warning") return;
  // Dev only (CLAUDE.md, "How the audits behave").
  if (m.text().includes("was preloaded using link preload but not used")) return;
  problems.push(`${m.type()} at ${page.url().replace(BASE, "")}: ${m.text().slice(0, 400)}`);
});
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`));

/** Anything a press could send to Shiprocket, through this site, is a failure of this probe. */
const sent = [];
page.on("request", (r) => {
  if (r.method() === "POST" && /shipment\/|\/pickup\/|orders\/manifest/.test(r.url())) sent.push(r.url());
});

const settle = async (p) => { await p.waitForLoadState("load", { timeout: T }); await p.waitForTimeout(1200); };

try {
  await signInAsStaff(page);

  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${BASE}/admin/store/orders`, { waitUntil: "load", timeout: T });
    await page.waitForSelector("h1", { timeout: T });
    await settle(page);

    const ticks = await page.locator('table input[type="checkbox"]').count();
    const bar = await page.locator("[data-manifest-bar]").count();
    const rows = await page.locator("table.admin-table tbody tr").count();

    if (rows === 0) {
      note(`${width}: no orders in this install; the list was not checked for ticks`);
    } else if (ticks > 0) {
      note(`${width}: Shiprocket is on in this install — the list offers ticks (${ticks}); none was pressed`);
    } else {
      ok(bar === 0, `${width}: no manifest bar while Shiprocket is off`);
      ok(true, `${width}: no tick column while Shiprocket is off`);
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(overflow <= 0, `${width}: no sideways scroll on the orders list (${overflow}px)`);
  }

  await page.setViewportSize({ width: 1280, height: 1000 });

  await page.goto(`${BASE}/admin/store/orders`, { waitUntil: "load", timeout: T });
  await page.waitForSelector("h1", { timeout: T });
  const order = page.locator('table.admin-table a[href^="/admin/store/orders/"]').first();

  if (await order.count()) {
    await order.click();
    await page.waitForSelector("h1", { timeout: T });
    await settle(page);

    const courier = await page.locator("[data-courier]").count();

    if (courier === 0) {
      ok(await page.getByRole("button", { name: /See couriers and prices/ }).count() === 0, "the order page offers no courier quote");
      ok(await page.getByRole("button", { name: /Make the manifest/ }).count() === 0, "the order page offers no manifest");
    } else {
      note("the order has a courier panel (Shiprocket is on or was used); no button in it was pressed");
    }
  } else {
    note("no orders in this install; the order page was not checked");
  }

  await page.goto(`${BASE}/admin/store/returns`, { waitUntil: "load", timeout: T });
  await page.waitForSelector("h1", { timeout: T });
  const ret = page.locator('a[href^="/admin/store/returns/"]').first();

  if (await ret.count()) {
    await ret.click();
    await page.waitForSelector("h1", { timeout: T });
    await settle(page);

    const pickup = await page.locator("[data-pickup]").count();

    if (pickup === 0) {
      ok(await page.getByRole("heading", { name: "Courier pickup" }).count() === 0, "the return page draws no courier-pickup panel while Shiprocket is off");
    } else {
      ok(await page.getByRole("heading", { name: "Courier pickup" }).count() === 1, "the return page draws the courier-pickup panel (none of its buttons was pressed)");
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(overflow <= 0, `no sideways scroll on the return page (${overflow}px)`);
  } else {
    note("no returns in this install; the return page was not checked");
  }

  ok(sent.length === 0, `nothing was sent to a shipment, manifest or pickup route (${sent.length})`);
} finally {
  await browser.close();
}

for (const p of problems) { console.log(`FAIL console: ${p}`); failed++; }

console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
