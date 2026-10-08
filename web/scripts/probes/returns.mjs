import { chromium } from "playwright";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Returns (0.132.0, docs/store.md "Returns"), through the real screens: the
 * order link a guest holds, the console's desk and the portal.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… \
 *   ORDER_NUMBER=… ORDER_TOKEN=… \
 *   PORTAL_LOGIN_EMAIL=… PORTAL_LOGIN_PASSWORD=… PORTAL_ORDER=… \
 *     node scripts/probes/returns.mjs
 *   SHOTS=<dir> saves the order page and the desk at 360, 768, 1280 and 1920.
 *
 * `ORDER_NUMBER`/`ORDER_TOKEN` name a **throwaway** order that has been
 * dispatched, is inside its return window and holds one line of two units of
 * a product whose stock is tracked; `PORTAL_ORDER` is another like it that
 * belongs to the portal account. The caller makes them and removes them: a
 * return has no delete, by design, so this probe cannot tidy up after itself.
 *
 * As the guest it opens the order link, checks the Returns section and its
 * closed disclosure, and asks for one unit back **with a photograph** — the
 * multipart path, through the route handler under the order's own address,
 * which is the only place the order's cookie reaches. In the console it
 * finds the request on the desk, fetches the photograph's exact bytes,
 * approves it, marks it received with the unit put back in stock, and
 * records the refund — each move from the panel `allowed_next` offers. Back
 * on the guest's page the return reads Refunded with the amount, and the
 * form now offers one unit, not two. With portal details it signs in as the
 * customer and asks for a return of their own order **without** a
 * photograph, which is the Server Action path.
 *
 * Carries no credential.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const SHOTS = process.env.SHOTS;
const ORDER = process.env.ORDER_NUMBER;
const TOKEN = process.env.ORDER_TOKEN;
const PORTAL_EMAIL = process.env.PORTAL_LOGIN_EMAIL;
const PORTAL_PASSWORD = process.env.PORTAL_LOGIN_PASSWORD;
const PORTAL_ORDER = process.env.PORTAL_ORDER;
const T = 180000;

if (!ORDER || !TOKEN) {
  console.error("Set ORDER_NUMBER and ORDER_TOKEN to a throwaway, dispatched order.");
  process.exit(2);
}

const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const { signInAsStaff, switchToPasswordForm } = await import("../shared.mjs");

// A real 1×1 PNG: the API sniffs the content, so a text file named .png is refused.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const dir = mkdtempSync(join(tmpdir(), "tw-returns-"));
const photoPath = join(dir, "damaged-corner.png");
writeFileSync(photoPath, PNG);

const problems = [];
const listen = (p, where) => {
  p.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(`${where} ${m.type()} at ${p.url().replace(BASE, "")}: ${m.text().slice(0, 2500)}`); });
  p.on("pageerror", (e) => problems.push(`${where} pageerror: ${e.message.slice(0, 300)}`));
};
const overflow = async (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const shots = async (p, name) => {
  for (const width of [360, 768, 1280, 1920]) {
    await p.setViewportSize({ width, height: 900 });
    await p.waitForTimeout(300);
    if (width === 360) ok(await overflow(p) <= 0, `no horizontal overflow on ${name} at 360`);
    // `caret: "initial"`: a screenshot's default caret style on inputs is a hydration mismatch of the probe's own making.
    if (SHOTS) await p.screenshot({ path: join(SHOTS, `${name}-${width}.png`), fullPage: true, caret: "initial" });
  }
  await p.setViewportSize({ width: 1280, height: 900 });
};

/* ---- The guest: the order link, and a return with a photograph ---- */

const guest = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const pub = await guest.newPage();
listen(pub, "order");

await pub.goto(`${BASE}/order/${ORDER}/open?token=${TOKEN}`, { waitUntil: "load", timeout: T });
await pub.waitForSelector("#returns", { timeout: T });
ok(new URL(pub.url()).search === "", "the order page's address carries no token");
ok(await pub.locator("h1").count() === 1, "one h1 on the order page");

const section = pub.locator("#returns");
ok(await section.locator("h2", { hasText: "Returns" }).count() === 1, "the order has a Returns section");
const disclosure = section.locator("details");
ok(await disclosure.count() === 1 && !(await disclosure.evaluate((d) => d.open)), "the form is behind a closed disclosure");

await disclosure.locator("summary").click();
const qty = section.locator('select[name^="qty_"]');
ok(await qty.count() === 1, "one line is offered");
ok((await qty.locator("option").allInnerTexts()).join("|") === "None|1|2", "…in quantities up to what was bought");
if (SHOTS) await shots(pub, "order-return-form");
else { await pub.setViewportSize({ width: 360, height: 800 }); await pub.waitForTimeout(300); ok(await overflow(pub) <= 0, "no horizontal overflow on the open form at 360"); await pub.setViewportSize({ width: 1280, height: 900 }); }

await qty.selectOption("1");
await section.locator("#return-reason").selectOption("damaged");
await section.locator("#return-details").fill("Made by the returns probe: a corner arrived dented.");
await section.locator('input[type="file"]').setInputFiles(photoPath);

const sent = pub.waitForResponse((r) => r.url().endsWith(`/order/${ORDER}/returns`) && r.request().method() === "POST", { timeout: T });
await section.getByRole("button", { name: /Send return request/ }).click();
const answer = await sent;
ok(answer.status() === 201, `the request with a photograph was accepted (${answer.status()})`);
const reference = (await answer.json().catch(() => null))?.data?.reference;
ok(/^[A-Z][A-Z0-9]{1,5}-\d{4}-\d{5}$/.test(reference ?? ""), `it was given a reference (${reference})`);

await pub.waitForSelector("[data-return]", { timeout: T });
const mine = pub.locator("[data-return]", { hasText: reference });
ok(await mine.count() === 1, "the return is listed on the order page");
ok((await mine.innerText()).includes("Requested") && (await mine.innerText()).includes("1 photograph sent"), "…as Requested, with its photograph counted");
ok(!(await pub.content()).includes(TOKEN), "the token is nowhere in the page");

/* ---- The console: the desk ---- */

const admin = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await admin.newPage();
listen(page, "console");
await signInAsStaff(page, { timeout: T });

await page.goto(`${BASE}/admin/store/returns?status=requested`, { waitUntil: "load", timeout: T });
await page.waitForSelector("table.admin-table", { timeout: T });
ok(await page.locator("h1").count() === 1, "one h1 on the returns desk");
ok(await page.getByRole("link", { name: reference, exact: true }).count() === 1, "the request is on the desk");
ok(await page.locator('nav a[href="/admin/store/returns"]').count() >= 1, "the sidebar links to Returns");
if (SHOTS) await shots(page, "admin-returns");

const detail = `${BASE}/admin/store/returns/${reference}`;
await page.goto(detail, { waitUntil: "load", timeout: T });
await page.waitForSelector("#approve_note", { timeout: T });
ok(await page.getByText("damaged-corner.png").count() === 1, "the photograph is named");

const photoHref = await page.getByRole("link", { name: "Download" }).first().getAttribute("href");
const photo = await admin.request.get(`${BASE}${photoHref}`);
ok(photo.status() === 200 && Buffer.compare(await photo.body(), PNG) === 0, "staff fetch the photograph's exact bytes");
ok((photo.headers()["content-disposition"] ?? "").includes("attachment"), "…as an attachment");
const stranger = await guest.request.get(`${BASE}${photoHref}`, { maxRedirects: 0 });
ok(stranger.status() !== 200, `a visitor cannot fetch it (${stranger.status()})`);

ok(await page.locator('[id^="received_"]').count() === 0, "receiving is not offered before approval");
if (SHOTS) await shots(page, "admin-return-requested");


await page.fill("#approve_note", "Probe: send it back in its box.");
await page.getByRole("button", { name: /Approve and email the customer/ }).click();
await page.waitForSelector('[id^="received_"]', { timeout: T });
ok(await page.locator("#approve_note").count() === 0, "approved: the decision panels are gone");
ok(await page.getByText("Return approved").count() >= 1, "…and a toast says so");

const received = page.locator('[id^="received_"]');
ok((await received.inputValue()) === "1", "the arrived figure starts on what was asked for");
await page.locator('input[type="checkbox"][name^="restock_"]').check();
await page.getByRole("button", { name: /Mark as received/ }).click();
await page.waitForSelector("#refund_reference", { timeout: T });
ok(await page.getByText(/1 arrived · 1 back in stock/).count() === 1, "received: one arrived and went back into stock");

const suggested = await page.inputValue("#refund_amount");
ok(Number(suggested) > 0, `the refund starts on the price of what arrived (₹${suggested})`);
if (SHOTS) await shots(page, "admin-return-received");
await page.fill("#refund_reference", `probe-rfnd-${Date.now().toString(36)}`);
await page.getByRole("button", { name: /Record refund and email the customer/ }).click();
await page.waitForFunction(() => !document.querySelector("#refund_reference"), null, { timeout: T });
await page.waitForLoadState("load");
ok(await page.getByText("Refunded", { exact: true }).count() >= 1, "refunded: the return says so");
ok(await page.locator("#close_note").count() === 0, "…and nothing further is offered");

await page.goto(`${BASE}/admin/store/orders/${ORDER}`, { waitUntil: "load", timeout: T });
await page.waitForSelector("h1", { timeout: T });
ok(await page.getByRole("link", { name: reference, exact: true }).count() === 1, "the order's own screen lists the return");

await page.goto(`${BASE}/admin/store/returns`, { waitUntil: "load", timeout: T });
await page.setViewportSize({ width: 360, height: 800 });
await page.waitForTimeout(300);
ok(await overflow(page) <= 0, "no horizontal overflow on the desk at 360");
await page.goto(detail, { waitUntil: "load", timeout: T });
await page.waitForTimeout(300);
ok(await overflow(page) <= 0, "no horizontal overflow on a return at 360");

/* ---- Back as the guest ---- */

await pub.goto(`${BASE}/order/${ORDER}`, { waitUntil: "load", timeout: T });
await pub.waitForSelector("[data-return]", { timeout: T });
const after = await pub.locator("[data-return]", { hasText: reference }).innerText();
ok(after.includes("Refunded") && after.includes(`₹`), "the customer reads Refunded, with the amount");
await pub.locator("#returns details summary").click();
ok((await pub.locator('#returns select[name^="qty_"] option').allInnerTexts()).join("|") === "None|1", "one unit is left to return, not two");
if (SHOTS) await shots(pub, "order-return-refunded");

/* ---- The portal: a return with no photograph, through the Server Action ---- */

if (PORTAL_EMAIL && PORTAL_PASSWORD && PORTAL_ORDER) {
  const customer = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const portal = await customer.newPage();
  listen(portal, "portal");

  await portal.goto(`${BASE}/portal/login`, { waitUntil: "load", timeout: T });
  await switchToPasswordForm(portal);
  await portal.fill("#email", PORTAL_EMAIL);
  await portal.fill("#password", PORTAL_PASSWORD);
  await Promise.all([
    portal.waitForURL((u) => !u.pathname.startsWith("/portal/login"), { timeout: T }),
    portal.click('button[type="submit"]'),
  ]);

  await portal.goto(`${BASE}/portal/orders/${PORTAL_ORDER}`, { waitUntil: "load", timeout: T });
  await portal.waitForSelector("#returns", { timeout: T });
  ok(await portal.locator("h1").count() === 1, "one h1 on the portal's order page");
  await portal.locator("#returns details summary").click();

  // Nothing chosen: the browser lets it through (None is a value) and the API names the mistake.
  await portal.locator("#return-reason").selectOption("no_longer_needed");
  await portal.getByRole("button", { name: /Send return request/ }).click();
  await portal.waitForSelector("#returns .text-err, #returns [role='alert']", { timeout: T });
  ok(await portal.locator("#returns [data-return]").count() === 0, "a request naming no item is refused");
  ok((await portal.locator("#return-reason").inputValue()) === "no_longer_needed", "…and the form keeps what was chosen");

  await portal.locator('#returns select[name^="qty_"]').selectOption("2");
  await portal.getByRole("button", { name: /Send return request/ }).click();
  await portal.waitForSelector("#returns [data-return]", { timeout: T });
  const theirs = await portal.locator("#returns [data-return]").first().innerText();
  ok(theirs.includes("Requested") && theirs.includes("2 ×"), "the customer's return of both units is listed");
  ok(await portal.locator("#returns details").count() === 0, "with everything asked back, the form is no longer offered");

  await portal.setViewportSize({ width: 360, height: 800 });
  await portal.waitForTimeout(300);
  ok(await overflow(portal) <= 0, "no horizontal overflow on the portal's order page at 360");
  if (SHOTS) await portal.screenshot({ path: join(SHOTS, "portal-order-return-360.png"), fullPage: true, caret: "initial" });
  await customer.close();
} else {
  console.log("skip the portal half: PORTAL_LOGIN_EMAIL / PORTAL_LOGIN_PASSWORD / PORTAL_ORDER are not set");
}

ok(problems.length === 0, `nothing logged an error or a warning (${problems.length})`);
problems.forEach((p) => console.log(`     ${p}`));

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
