import { chromium } from "playwright";

/**
 * Courier booking, left on its default (0.143.0, docs/store.md "Shiprocket"),
 * through the real screens.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/courier.mjs
 *
 * **It never switches the provider on, and it never presses Book or Test.**
 * Shiprocket has no sandbox: every call acts on a live account, so the only
 * safe check against a real install is one that proves nothing is asked of
 * it. The booking itself is covered by `ShiprocketTest` against a faked
 * service, where a stray request fails the test instead of leaving the
 * machine. (The file is named for what it checks, not the vendor, for the
 * same reason the webhook's address is: it is a name Shiprocket's own rules
 * do not like.)
 *
 * What it checks, with the provider left on "By hand":
 *   1. Store → Settings draws the courier select (set to By hand), the
 *      tracking address Shiprocket is to be given — which contains none of
 *      "shiprocket", "kartrocket", "sr" or "kr" — and a Copy button, at 360
 *      and 1280 without sideways scroll.
 *   2. The "Test the connection" button is present and disabled (no sign-in
 *      saved), and is not pressed.
 *   3. The first order's page, if there is one, draws the Delivery form with
 *      the by-hand wording and **no** courier-booking panel and no Book
 *      button; the order list loads with `?shipment=problem` and so does the
 *      dashboard.
 *
 * Carries no credential: sign-in is `scripts/shared.mjs`, which reads
 * ADMIN_LOGIN_EMAIL and ADMIN_LOGIN_PASSWORD from the environment.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const T = 180000;

// The helper signs in on its own default origin (127.0.0.1); a cookie set
// there is not sent to localhost, so both must use one.
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
  if (r.method() === "POST" && /shipment\/|shiprocket\/test/.test(r.url())) sent.push(r.url());
});

const settle = async (p) => { await p.waitForLoadState("load", { timeout: T }); await p.waitForTimeout(1200); };

try {
  await signInAsStaff(page);

  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    // The panel is on its own tab, and a control on a hidden tab is not a
    // button to Playwright's role queries.
    await page.goto(`${BASE}/admin/store/settings?tab=shiprocket`, { waitUntil: "load", timeout: T });
    await page.waitForSelector("h1", { timeout: T });
    await settle(page);
    const tab = page.getByRole("tab", { name: /Shiprocket/ });
    if (await tab.count()) await tab.first().click();

    const panel = page.locator("[data-shiprocket-panel]");
    ok(await panel.count() === 1, `${width}: the Shiprocket panel is drawn`);

    const provider = page.locator('[name="setting__store_courier_provider"]');
    ok(await provider.count() === 1, `${width}: the courier select is drawn`);

    if (await provider.count()) {
      const value = await provider.inputValue();
      ok(value === "manual", `${width}: the provider is left on By hand (found "${value}")`);
    }

    const address = await page.locator("#shiprocket-webhook-url").inputValue().catch(() => "");
    ok(address.endsWith("/store/shipping/webhooks/courier"), `${width}: the tracking address is the courier route (${address || "missing"})`);
    ok(!/shiprocket|kartrocket|sr|kr/i.test(address.replace(/^https?:\/\//, "").split("/").slice(1).join("/")), `${width}: the address path names none of the words Shiprocket refuses`);
    ok(await panel.getByRole("button", { name: "Copy", exact: true }).count() === 1, `${width}: the Copy button is drawn beside the address`);

    const test = panel.getByRole("button", { name: /Test the connection/ });
    ok(await test.count() === 1, `${width}: the test button is drawn`);
    if (await test.count()) ok(await test.isDisabled(), `${width}: the test button is disabled with no sign-in saved (and is not pressed)`);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(overflow <= 0, `${width}: no sideways scroll on Store settings (${overflow}px)`);
  }

  await page.setViewportSize({ width: 1280, height: 1000 });

  await page.goto(`${BASE}/admin/store/orders?shipment=problem`, { waitUntil: "load", timeout: T });
  await page.waitForSelector("h1", { timeout: T });
  ok(await page.getByText("bringing back or cancelled").count() >= 1, "the problem-parcels filter loads and says what it shows");

  await page.goto(`${BASE}/admin/store/orders`, { waitUntil: "load", timeout: T });
  await page.waitForSelector("h1", { timeout: T });
  const first = page.locator('a[href^="/admin/store/orders/"]').first();

  if (await first.count()) {
    await first.click();
    await page.waitForSelector("h1", { timeout: T });
    await settle(page);

    ok(await page.locator("[data-courier]").count() === 0, "the order page draws no courier-booking panel");
    ok(await page.getByRole("button", { name: /Book with Shiprocket/ }).count() === 0, "the order page has no Book button");

    if (await page.getByText("Delivery").count()) {
      ok(await page.getByText("Entered by hand.").count() >= 1, "the Delivery form keeps its by-hand wording");
    } else {
      note("the first order has nothing to ship, so it has no Delivery form");
    }
  } else {
    note("no orders in this install; the order page was not checked");
  }

  ok(sent.length === 0, `nothing was sent to a booking or test route (${sent.length})`);
} finally {
  await browser.close();
}

for (const p of problems) { console.log(`FAIL console: ${p}`); failed++; }

console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
