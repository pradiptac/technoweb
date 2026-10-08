import { chromium } from "playwright";
import { join } from "node:path";

/**
 * Zoho Books invoices in the console (0.134.0, docs/store.md "Zoho Books
 * invoices"), as far as they can be driven without a Zoho account.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/zoho-books.mjs
 *   ORDER_FAILED=<number> ORDER_CREATED=<number> ORDER_PLAIN=<number> add the
 *     order screen: throwaway orders whose `zoho_status` is `failed`,
 *     `created` and null.
 *   SHOTS=<dir> saves each screen at 360, 768, 1280 and 1920.
 *
 * **Run it on an install where Zoho Books is not connected** — it checks the
 * unconnected screen, and exits 2 when an account is connected rather than
 * press anything. It never reaches Zoho: Connect is pressed with no client
 * saved, which the API refuses before any consent address is built.
 *
 * What it checks:
 *   - Store → Settings has a Zoho Books tab with the switch, the data
 *     centre, the state, when to invoice, and the client's two fields;
 *   - the state starts on "Choose…", never on the first state in the list;
 *   - the rows the panel owns (organisation, the two taxes) and the rows
 *     nobody types (the token, the account, the last error) are not drawn
 *     as inputs, so a save from this tab cannot blank them;
 *   - unconnected, the panel names the redirect address, says what is still
 *     to do, and Connect answers with the API's sentence, not a redirect;
 *   - the callback page says something sensible for a visit with nothing,
 *     a cancelled consent, and a made-up code and state;
 *   - an order whose invoice Zoho refused shows Zoho's words (wrapped, so a
 *     long unbroken identifier cannot widen a phone screen), one whose
 *     invoice was made shows its number, and one nothing was asked of shows
 *     no Zoho panel at all while Zoho is not set up;
 *   - `?zoho=failed` narrows the orders list to the refused ones;
 *   - one `h1`, no horizontal overflow at 360, nothing logged.
 *
 * Signs in and reads; the one thing it presses is Connect, which changes
 * nothing. Carries no credential.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const SHOTS = process.env.SHOTS;
const FAILED = process.env.ORDER_FAILED;
const CREATED = process.env.ORDER_CREATED;
const PLAIN = process.env.ORDER_PLAIN;
const T = 180000;

const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const { signInAsStaff } = await import("../shared.mjs");

const problems = [];
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()} at ${page.url().replace(BASE, "")}: ${m.text().slice(0, 1200)}`); });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`));

const go = async (path, wait = "h1") => {
  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: T });
  await page.waitForSelector(wait, { timeout: T });
  // The console polls, so the network never goes idle: settle on hydration instead.
  await page.waitForTimeout(1500);
};
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const shots = async (name) => {
  for (const width of [360, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(300);
    if (width === 360) ok(await overflow() <= 0, `no horizontal overflow on ${name} at 360`);
    // `caret: "initial"`: a screenshot's default caret style on inputs is a hydration mismatch of the probe's own making.
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}-${width}.png`), fullPage: true, caret: "initial" });
  }
  await page.setViewportSize({ width: 1280, height: 1000 });
};

await signInAsStaff(page, { timeout: T });

/* ---- Store → Settings → Zoho Books ---- */

await go(`/admin/store/settings?tab=zoho_books`);
ok(await page.locator("h1").count() === 1, "one h1 on Store settings");

const tab = page.getByRole("tab", { name: "Zoho Books" });
ok(await tab.count() === 1, "Store settings has a Zoho Books tab");
ok(await tab.getAttribute("aria-selected") === "true", "…which ?tab=zoho_books opens");

if (await page.getByText(/^Connected to /).count() > 0) {
  console.error("A Zoho account is connected here. This probe checks the unconnected screen and presses Connect; run it where Zoho Books is not set up.");
  await browser.close();
  process.exit(2);
}

for (const key of ["zoho_books_enabled", "zoho_books_invoice_when", "zoho_books_dc", "zoho_books_home_state", "zoho_books_oauth_client_id", "zoho_books_oauth_client_secret"]) {
  ok(await page.locator(`[name="setting__${key}"]`).count() >= 1, `the form carries ${key}`);
}
for (const key of ["zoho_books_oauth_refresh_token", "zoho_books_oauth_account", "zoho_books_oauth_connected_at", "zoho_books_error", "zoho_books_organization_id", "zoho_books_tax_intra", "zoho_books_tax_inter"]) {
  ok(await page.locator(`[name="setting__${key}"]`).count() === 0, `${key} is not posted from an unconnected screen`);
}

const state = page.locator('[name="setting__zoho_books_home_state"]');
const states = await state.locator("option").count();
ok(states >= 37, `the state is a list of India's states and territories (${states - 1} of them)`);
// The generic select starts on its first option, and a save from any tab then stored it.
ok(await state.inputValue() === "", "…and with none chosen it shows none, so a save stores none");
ok(await page.locator('[name="setting__zoho_books_dc"]').inputValue() === "in", "the data centre starts on India");

const panel = page.locator("section", { has: page.getByText("No Zoho account connected") }).last();
ok(await panel.count() === 1, "the panel says no Zoho account is connected");
ok((await panel.innerText()).includes("/admin/store/settings/zoho/callback"), "…and names the redirect address to register");
ok(await panel.getByText(/Still to do:|Switched off/).count() >= 1, "…and what is still to do");
ok(await panel.getByRole("button", { name: "Test the connection" }).isDisabled(), "Test is disabled until an account is connected");

await shots("zoho-settings");

const connect = panel.getByRole("button", { name: "Connect Zoho Books" });
await connect.click();
await page.getByText("That did not work").waitFor({ timeout: T });
ok(new URL(page.url()).pathname === "/admin/store/settings", "Connect with no client saved stays on the screen");
ok(await page.getByText(/client ID and secret/i).count() >= 1, "…and says to save the client ID and secret first");

/* ---- The callback page ---- */

await go(`/admin/store/settings/zoho/callback`);
ok(await page.locator("h1").count() === 1, "one h1 on the callback page");
ok(await page.getByText("Nothing to do").count() === 1, "a visit with nothing says there is nothing to do");

await go(`/admin/store/settings/zoho/callback?error=access_denied`);
ok(await page.getByText("Nothing was connected").count() === 1, "a cancelled consent says nothing was connected");

await go(`/admin/store/settings/zoho/callback?code=made-up&state=made-up`);
ok(await page.getByText("That did not complete").count() === 1, "a made-up code and state are refused");
ok(await page.getByText("Zoho Books connected").count() === 0, "…and nothing is reported as connected");
await shots("zoho-callback");

/* ---- The order screen ---- */

if (FAILED && CREATED && PLAIN) {
  await go(`/admin/store/orders/${FAILED}`);
  const refused = page.locator("form", { has: page.getByRole("heading", { name: "Zoho Books invoice" }) });
  ok(await refused.count() === 1, "a refused order has a Zoho Books panel");
  const words = await refused.innerText();
  ok(words.includes("Zoho Books refused this invoice") && words.includes("2 attempts"), "…saying it was refused, and after how many attempts");
  ok(words.includes("valid GSTIN"), "…with Zoho's own words");
  ok(words.includes("tried again by itself around"), "…and when it will be tried again");
  ok(await refused.getByRole("button").count() === 0, "no retry button while Zoho Books is not set up");
  await shots("zoho-order-failed");

  await go(`/admin/store/orders/${CREATED}`);
  const made = page.locator("form", { has: page.getByRole("heading", { name: "Zoho Books invoice" }) });
  ok((await made.innerText()).includes("INV-000134"), "a made invoice shows its number");
  ok(await made.getByRole("button").count() === 0, "…and offers nothing to press");
  await shots("zoho-order-created");

  await go(`/admin/store/orders/${PLAIN}`);
  ok(await page.getByRole("heading", { name: "GST invoice" }).count() === 1, "an untouched order still has the upload panel");
  ok(await page.getByRole("heading", { name: "Zoho Books invoice" }).count() === 0, "…and no Zoho panel while Zoho Books is not set up");

  await go(`/admin/store/orders?zoho=failed`);
  ok(await page.getByRole("link", { name: FAILED, exact: true }).count() === 1, "?zoho=failed lists the refused order");
  ok(await page.getByRole("link", { name: CREATED, exact: true }).count() === 0, "…and not the one that was made");
  ok(await page.getByRole("link", { name: PLAIN, exact: true }).count() === 0, "…nor the one nothing was asked of");
  await shots("zoho-orders-failed");

  await go(`/admin/store`);
  const tile = page.locator('a[href="/admin/store/orders?zoho=failed"]');
  ok(await tile.count() >= 1, "the store overview has a tile for refused invoices");
} else {
  console.log("skip the order screen: set ORDER_FAILED, ORDER_CREATED and ORDER_PLAIN");
}

ok(problems.length === 0, `nothing logged (${problems.length})`);
for (const p of problems) console.log(`     ${p}`);

await browser.close();
console.log(failed === 0 ? "\nzoho-books: all passed" : `\nzoho-books: ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
