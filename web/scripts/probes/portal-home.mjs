import { chromium } from "playwright";

/**
 * Measures Portal 2.0 (docs/console-portal.md).
 *
 *   PORTAL_LOGIN_EMAIL=… PORTAL_LOGIN_PASSWORD=… node scripts/probes/portal-home.mjs
 *   EMPTY_LOGIN_EMAIL=… EMPTY_LOGIN_PASSWORD=…   # optional: a customer with nothing yet
 *
 * (1) The top bar carries an account menu and no "Support portal" heading.
 * (2) Exactly one h1 on /portal, /portal/orders, /portal/tickets and
 * /portal/downloads. (3) The home has a hero band, at least one live tile and
 * an activity list with entries for a customer who has something open.
 * (4) A customer with nothing sees "Here's what you can do" and no tiles.
 * (5) No horizontal overflow at 360 and 1280. (6) Nothing is logged.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
process.env.BASE = BASE;
const { switchToPasswordForm } = await import("../shared.mjs");
const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

async function signIn(context, email, password) {
  const page = await context.newPage();
  await page.goto(`${BASE}/portal/login`, { waitUntil: "load", timeout: 180000 });
  await switchToPasswordForm(page);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/portal/login"), { timeout: 180000 }),
    page.click('button[type="submit"]'),
  ]);
  return page;
}

const errors = [];
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await signIn(context, process.env.PORTAL_LOGIN_EMAIL, process.env.PORTAL_LOGIN_PASSWORD);
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)); });
const go = async (p, path) => { await p.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 180000 }); await p.waitForTimeout(1200); };

await go(page, "/portal");
ok(await page.locator("[data-account-menu]").count() === 1, "account menu present");
ok(await page.getByRole("heading", { level: 1, name: "Support portal" }).count() === 0, "no 'Support portal' h1");
for (const path of ["/portal", "/portal/orders", "/portal/tickets", "/portal/downloads"]) {
  await go(page, path);
  const n = await page.locator("h1").count();
  ok(n === 1, `${path}: exactly one h1 (${n})`);
}
// A reference nobody has: the not-found page still names itself (review,
// 2026-10-12 — the layout's h1 went, and only the success paths gained one).
await go(page, "/portal/tickets/TW-2026-99999");
ok(await page.locator("h1").count() === 1, `ticket not found: exactly one h1 (${await page.locator("h1").count()})`);

await go(page, "/portal");
ok(await page.locator("[data-hero-band]").count() === 1, "hero band present");
ok(await page.locator("[data-portal-tile]").count() >= 1, "at least one live tile");
ok(await page.locator("[data-activity] li").count() >= 1, "activity timeline has entries");
for (const width of [360, 1280]) {
  await page.setViewportSize({ width, height: 800 });
  await go(page, "/portal");
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(over <= 0, `${width}: no horizontal overflow (${over})`);
}

if (process.env.EMPTY_LOGIN_EMAIL) {
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p2 = await signIn(ctx2, process.env.EMPTY_LOGIN_EMAIL, process.env.EMPTY_LOGIN_PASSWORD);
  await go(p2, "/portal");
  ok(await p2.getByText("Here's what you can do").count() === 1, "new customer sees the empty state");
  ok(await p2.locator("[data-portal-tile]").count() === 0, "new customer sees no zero tiles");
  ok(await p2.locator("h1").count() === 1, "new customer's home has one h1");
}

ok(errors.length === 0, `nothing logged${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await browser.close();
process.exit(failed ? 1 : 0);
