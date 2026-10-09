import { chromium } from "playwright";

/**
 * Delivery charges and shipping zones (0.142.0, docs/store.md "Delivery
 * charges and shipping zones"), end to end through the real screens.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/shipping-zones.mjs
 *   PLACE=1 node …   also places one order, which stays in the shop (see below).
 *
 * What it does, in order:
 *   1. Reads the shipping screen and remembers the mode, the flat charge and
 *      the default weight to put back.
 *   2. Makes throwaway zones through the console's own dialog — a default
 *      "Probe rest of India" only when the install has none, and "Probe zone"
 *      holding Goa — then switches delivery to zones and saves.
 *   3. Fills the basket from the first shop product and opens the checkout at
 *      360 and 1280. In each it checks the Delivery row says "Worked out at
 *      checkout" before a state is chosen, then chooses Goa from the state
 *      list and checks the row becomes a figure for "Probe zone" and that
 *      Subtotal + Delivery equals Total (read off the page, so a total
 *      worked out in the browser instead of the API's would not pass).
 *      Also checks the page does not overflow sideways.
 *   4. Puts every setting back and deletes the zones it made — in a `finally`,
 *      so a failed check does not leave the shop charging by zone.
 *
 * It places no order unless PLACE=1: an order cannot be deleted from the
 * console, so that run leaves one behind and says so. With PLACE=1 it also
 * presses "Place order" at 1280 and checks the order page shows the same
 * Delivery and Total as the checkout did.
 *
 * Carries no credential: sign-in is `scripts/shared.mjs`, which reads
 * ADMIN_LOGIN_EMAIL and ADMIN_LOGIN_PASSWORD from the environment.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const T = 180000;
const PLACE = process.env.PLACE === "1";
const STATE = "Goa";

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

const settle = async (p) => { await p.waitForLoadState("load", { timeout: T }); await p.waitForTimeout(1200); };

/** "₹1,18,000" → 118000 (rupees), "₹49.50" → 49.5. */
const rupees = (text) => Number(String(text).replace(/[^\d.]/g, ""));

const created = [];
let original = null;

async function openScreen() {
  await page.goto(`${BASE}/admin/store/shipping`, { waitUntil: "load", timeout: T });
  await page.waitForSelector("h1", { timeout: T });
  await settle(page);
}

async function readSettings() {
  await openScreen();
  return {
    mode: await page.locator('input[name="mode"]:checked').inputValue(),
    flat: await page.locator("#flat").inputValue(),
    weight: await page.locator("#default_weight").inputValue(),
  };
}

async function saveSettings({ mode, flat, weight }) {
  await openScreen();
  if (mode) await page.locator(`input[name="mode"][value="${mode}"]`).check();
  if (flat !== undefined) await page.locator("#flat").fill(String(flat));
  if (weight !== undefined) await page.locator("#default_weight").fill(String(weight));
  await page.getByRole("button", { name: "Save delivery settings" }).click();
  await page.getByText("Delivery settings saved").first().waitFor({ timeout: T }).catch(() => {});
  await page.waitForTimeout(800);
}

async function addZone({ name, isDefault, states, slabs, extra }) {
  await openScreen();
  await page.getByRole("button", { name: "Add a zone" }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.waitFor({ timeout: T });
  await dialog.locator("#zone-name").fill(name);

  if (isDefault) await dialog.locator("#zone-default").click();
  for (const code of states ?? []) await dialog.locator(`input[name="states"][value="${code}"]`).check();

  for (const [i, [grams, charge]] of slabs.entries()) {
    if (i > 0) await dialog.getByRole("button", { name: "Add a slab" }).click();
    await dialog.getByLabel(`Slab ${i + 1}: up to (grams)`).fill(String(grams));
    await dialog.getByLabel(`Slab ${i + 1}: charge (₹)`).fill(String(charge));
  }
  await dialog.locator("#zone-extra").fill(String(extra));

  await dialog.getByRole("button", { name: "Add the zone" }).click();
  await dialog.waitFor({ state: "detached", timeout: T }).catch(() => {});
  await page.waitForTimeout(800);
  created.push(name);
}

async function removeZone(name) {
  await openScreen();
  const card = page.locator("li").filter({ has: page.getByRole("heading", { name }) }).first();
  if ((await card.count()) === 0) return;
  await card.getByRole("button", { name: "Delete" }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.waitFor({ timeout: T });
  await dialog.getByRole("button", { name: "Delete the zone" }).click();
  await dialog.waitFor({ state: "detached", timeout: T }).catch(() => {});
  await page.waitForTimeout(500);
}

/** The basket, filled through the real shop screens: first product, Add to basket. */
async function fillBasket(p) {
  await p.goto(`${BASE}/store`, { waitUntil: "load", timeout: T });
  const href = await p.locator('a[href^="/store/products/"]').first().getAttribute("href");
  if (!href) throw new Error("the shop has no product to put in a basket");
  await p.goto(`${BASE}${href}`, { waitUntil: "load", timeout: T });
  await settle(p);
  await p.getByRole("button", { name: /add to basket/i }).first().click();
  // The add is a Server Action, and on a busy machine it can take far longer
  // than any fixed pause; going to /checkout before it lands is a redirect to
  // an empty basket. Ask the basket itself until it holds something.
  // (Polled from here: `waitForFunction` treats an async predicate's promise
  // as truthy and returns at once.)
  for (let i = 0; i < 90; i++) {
    const status = await p.evaluate(async () => (await fetch("/api/store/basket", { cache: "no-store" })).status);
    if (status === 200) return;
    await p.waitForTimeout(2000);
  }
  throw new Error("Add to basket did not land within three minutes");
}

async function summaryOf(p) {
  // Exact: "Total" is a substring of "Subtotal", which comes first.
  const row = (name) => p.locator("dl div").filter({ has: p.locator("dt", { hasText: new RegExp(`^${name}$`) }) }).first();
  const text = async (name) => (await row(name).locator("dd").first().innerText().catch(() => "")).trim();
  return {
    subtotal: await text("Subtotal"),
    delivery: await p.locator("[data-delivery-row] dd").first().innerText().catch(() => ""),
    deliveryLabel: await p.locator("[data-delivery-row] dt").first().innerText().catch(() => ""),
    total: await text("Total"),
  };
}

async function checkCheckout(width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => problems.push(`${width}px pageerror: ${e.message.slice(0, 300)}`));

  await fillBasket(p);
  await p.goto(`${BASE}/checkout`, { waitUntil: "load", timeout: T });
  await settle(p);

  const before = await summaryOf(p);
  ok(/worked out at checkout/i.test(before.delivery), `@${width}: the Delivery row waits for a state ("${before.delivery.trim()}")`);

  // The state is a list of the API's own names in zones mode; free text is not offered.
  const select = p.locator("select#state");
  ok((await select.count()) === 1, `@${width}: the state is a list, not a text box`);
  ok((await p.locator("input#state").count()) === 0, `@${width}: …and no free-text state field`);

  await select.selectOption({ label: STATE });
  // The destination is sent after a short pause; wait for the row to turn into a figure.
  await p.waitForFunction(
    () => /₹|free/i.test(document.querySelector("[data-delivery-row] dd")?.textContent ?? ""),
    null, { timeout: 30000 },
  ).catch(() => {});

  const after = await summaryOf(p);
  ok(/Probe zone/.test(after.deliveryLabel), `@${width}: the row names the zone (${after.deliveryLabel.trim()})`);
  ok(/₹/.test(after.delivery), `@${width}: …and a figure (${after.delivery.trim()})`);
  ok(
    Math.abs(rupees(after.subtotal) + rupees(after.delivery) - rupees(after.total)) < 0.01,
    `@${width}: Subtotal ${after.subtotal} + Delivery ${after.delivery.trim()} = Total ${after.total}`,
  );

  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(over <= 0, `@${width}: no horizontal overflow (${over}px)`);

  if (PLACE && width === 1280) {
    note("PLACE=1: placing one order — it stays in the shop");
    await p.fill("#name", "Probe Buyer");
    await p.fill("#phone", "9876543210");
    await p.fill("#email", "probe-buyer@example.test");
    await p.fill("#pin", "403001");
    await p.fill("#city", "Panaji");
    await p.fill("#line1", "1 Probe Road");
    await select.selectOption({ label: STATE });
    await p.waitForTimeout(1500);
    await p.getByRole("button", { name: /place order/i }).click();
    await p.waitForURL(/\/order\//, { timeout: T });
    await settle(p);
    const order = await summaryOf(p);
    ok(order.delivery.trim() === after.delivery.trim(), `the order page shows the same Delivery (${order.delivery.trim()})`);
    ok(order.total === after.total, `…and the same Total (${order.total})`);
  }

  await ctx.close();
}

try {
  await signInAsStaff(page);

  original = await readSettings();
  note(`found: mode ${original.mode}, flat ₹${original.flat || 0}, default weight ${original.weight} g`);

  // A default zone only when the install has none; otherwise the probe zone sits beside it.
  const hasDefault = (await page.getByText("Default", { exact: true }).count()) > 0;
  if (!hasDefault) {
    await addZone({ name: "Probe rest of India", isDefault: true, slabs: [[500, 80], [1000, 120]], extra: 50 });
  }
  await addZone({ name: "Probe zone", states: ["GA"], slabs: [[500, 70], [1000, 100]], extra: 40 });
  await saveSettings({ mode: "zones", weight: original.weight });

  for (const width of [1280, 360]) await checkCheckout(width);
} catch (error) {
  failed++;
  console.log(`FAIL the probe stopped: ${error.message}`);
} finally {
  // Put it all back, whatever happened above.
  try {
    if (original) await saveSettings({ mode: original.mode, flat: original.flat || 0, weight: original.weight });
    for (const name of [...created].reverse()) await removeZone(name);
    ok(true, "settings put back and the probe's zones deleted");
  } catch (error) {
    failed++;
    console.log(`FAIL could not clean up (${error.message}) — check Store → Shipping by hand`);
  }

  ok(problems.length === 0, `nothing logged to the console${problems.length ? `:\n  ${problems.join("\n  ")}` : ""}`);
  await browser.close();
  console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
  process.exit(failed ? 1 : 0);
}
