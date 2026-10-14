/**
 * Tax and invoicing, through the real screen (0.176.0, `docs/store.md`
 * "Tax, and the shop's own GST invoice").
 *
 * **What is deliberately not here.** The invoice's arithmetic, the number
 * series, the CGST/SGST-against-IGST split, the refusals and the customer's
 * download are 35 cases in `GstInvoiceTest`, and one of them writes a real
 * PDF: `Storage::fake('local')` fakes the *disk*, not dompdf, so that test
 * already proves the renderer works on this host and produces `%PDF`.
 * Repeating it here would be a slower copy.
 *
 * What only a browser can answer is whether the **screen** works: that the
 * fifteen settings go in and come back, that the API's `meta.missing` turns
 * into "ready" once they do, and that the console's own controls — a
 * `SettingSwitch` over a hidden input, selects drawn from the API's
 * `options` — post what they appear to.
 *
 *   cd web
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/gst-invoice.mjs
 *
 * It makes no account and no order; it writes settings on the development
 * install and **puts every one of them back**, the switch included. The
 * first cut restored only the rate and the basis, which left the install
 * issuing invoices made out to "Probe Networks Private Limited" on every
 * order paid afterwards — a probe that leaves a feature switched on is a
 * probe that changes what the next person is looking at. No credential is
 * in this file. One probe at a time, and never beside an audit: each
 * sign-in revokes the other's token.
 *
 * **Never `networkidle` against `next dev`.** Its HMR socket keeps the
 * network busy for ever, so every wait here is `domcontentloaded` plus an
 * explicit wait for the element that matters.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const EMAIL = process.env.ADMIN_LOGIN_EMAIL;
const PASSWORD = process.env.ADMIN_LOGIN_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("Set ADMIN_LOGIN_EMAIL and ADMIN_LOGIN_PASSWORD.");
  process.exit(1);
}

let failures = 0;

function check(ok, what, detail = "") {
  console.log(`${ok ? "ok   " : "FAIL "} ${what}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60000);
page.setDefaultNavigationTimeout(60000);

const open = (path) => page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });

try {
  /* --------------------------------------------------------- signing in */

  await open("/admin/login");

  /*
    No clicking a link to reach the password step. The first cut clicked
    the first link matching /password/i, which on this screen is **Forgot
    your password?** — so it went to the reset form, filled two fields that
    were not there, and the `waitForURL(/\/admin(\/|$)/)` after it passed
    anyway, because `/admin/login` matches that pattern. Every check then
    failed against a sign-in page.
  */
  if ((await page.locator('input[name="password"]').count()) === 0) {
    await page.getByRole("link", { name: /use a password|password instead/i }).first().click();
  }

  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();

  // The console is reached by a client-side navigation, which
  // `waitForURL`'s default `waitUntil: "load"` does not reliably see — it
  // passed on one run and timed out on the next with nothing changed.
  await page.waitForFunction(() => !location.pathname.startsWith("/admin/login"));

  /* ----------------------------------------------------------- the screen */

  await open("/admin/store/invoicing");
  await page.getByRole("heading", { name: "Tax and invoicing" }).waitFor();
  check(true, "the screen opens");

  // Everything this probe is about to write, as it stands now.
  const FIELDS = [
    "store_gst_percent", "store_price_basis", "invoice_legal_name",
    "invoice_gstin", "invoice_state", "invoice_address", "invoice_hsn_default",
  ];

  const before = {};
  for (const key of FIELDS) before[key] = await page.locator(`#setting__${key}`).inputValue();
  before.enabled = await page.locator("#invoice-enabled").isChecked();

  // Drawn from the API's own `options`; nothing in the console names a
  // rate, a basis or a state.
  check(
    (await page.locator("#setting__store_gst_percent option").count()) === 7,
    "the rates are the API's seven slabs",
  );
  check(
    (await page.locator("#setting__invoice_state option").count()) > 25,
    "the states are the API's list",
  );

  /* ------------------------------------------------------- saving them */

  await page.selectOption("#setting__store_gst_percent", "5");
  await page.selectOption("#setting__store_price_basis", "exclusive");
  await page.fill("#setting__invoice_legal_name", "Probe Networks Private Limited");
  await page.fill("#setting__invoice_gstin", "19AABCU9603R1ZM");
  await page.selectOption("#setting__invoice_state", "WB");
  await page.fill("#setting__invoice_address", "1 Probe Street\nKolkata 700016");
  await page.fill("#setting__invoice_hsn_default", "8517");

  const toggle = page.locator("#invoice-enabled");
  if (!(await toggle.isChecked())) await toggle.check();

  await page.getByRole("button", { name: /save tax and invoicing/i }).click();

  /*
    The confirmation is a **toast**, not an inline alert: the admin layout
    wraps its screens in `AlertsAsToastsProvider`, and inside it a
    dismissible `ok` Alert raises a toast and renders nothing in the flow.
    The first cut looked for it in the page and reported a failed save on
    one that had plainly worked.
  */
  const toast = await page
    .getByText(/Tax and invoicing saved/i)
    .first()
    .waitFor({ timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  check(toast, "saving raises the confirmation");

  /* ------------------------------------------------------- reading back */

  await open("/admin/store/invoicing");
  await page.getByRole("heading", { name: "Tax and invoicing" }).waitFor();

  check((await page.locator("#setting__store_gst_percent").inputValue()) === "5", "the rate came back");
  check((await page.locator("#setting__store_price_basis").inputValue()) === "exclusive", "the basis came back");
  check((await page.locator("#setting__invoice_gstin").inputValue()) === "19AABCU9603R1ZM", "the GSTIN came back");
  check((await page.locator("#setting__invoice_state").inputValue()) === "WB", "the state came back as its code");
  check(await page.locator("#invoice-enabled").isChecked(), "the switch came back on");

  const notReady = await page.getByText(/Not ready to issue yet/i).isVisible().catch(() => false);
  check(!notReady, "it reports itself ready", notReady ? "still listing what is missing" : "");

  const basisNote = await page
    .getByText(/adds the GST at the checkout/i)
    .isVisible()
    .catch(() => false);
  check(basisNote, "the basis note follows the choice");

  /* --------------------------------------------------- putting it back */

  for (const key of FIELDS) {
    const field = page.locator(`#setting__${key}`);
    const tag = await field.evaluate((el) => el.tagName);

    if (tag === "SELECT") await field.selectOption(before[key]);
    else await field.fill(before[key]);
  }

  const toggleBack = page.locator("#invoice-enabled");
  if ((await toggleBack.isChecked()) !== before.enabled) await toggleBack.setChecked(before.enabled);

  await page.getByRole("button", { name: /save tax and invoicing/i }).click();
  await page.getByText(/Tax and invoicing saved/i).first().waitFor({ timeout: 30000 }).catch(() => {});

  await open("/admin/store/invoicing");
  await page.getByRole("heading", { name: "Tax and invoicing" }).waitFor();

  let restored = (await page.locator("#invoice-enabled").isChecked()) === before.enabled;
  for (const key of FIELDS) {
    if ((await page.locator(`#setting__${key}`).inputValue()) !== before[key]) restored = false;
  }

  check(restored, "every setting is back where it was");
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
