/**
 * How a price is typed and how it is shown, through the real screens
 * (0.178.0, `docs/store.md` "A stored price includes GST").
 *
 * The arithmetic and the paisa guard are `PriceEntryTest`. What only a
 * browser can answer is whether the screens agree with it:
 *
 *   1. With prices typed before GST, the product form says so and shows what
 *      the customer will pay as ₹1,000 is typed — and the product is saved at
 *      ₹1,180.
 *   2. With prices shown before GST, the product page shows ₹1,000 and says
 *      "Plus 18% GST", and the basket prints a GST row.
 *   3. The basket's total is the same whichever way prices are shown.
 *
 *   cd web
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/price-entry.mjs
 *
 * It makes one draft-then-published product and one basket, deletes the
 * product and puts both settings back. No credential is in this file. One
 * probe at a time, and never beside an audit: each sign-in revokes the
 * other's token. `domcontentloaded` throughout — `networkidle` never settles
 * against `next dev`.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
process.env.BASE = BASE;

let failures = 0;
const check = (ok, what, detail = "") => {
  console.log(`${ok ? "ok   " : "FAIL "} ${what}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(90000);
page.setDefaultNavigationTimeout(180000);
page.on("dialog", (d) => d.accept().catch(() => {}));
const open = (path) => page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });

const { signInAsStaff } = await import("../shared.mjs");
await signInAsStaff(page);

const saveSettings = async (values) => {
  await open("/admin/store/invoicing");
  await page.locator("#setting__store_price_entry").waitFor();
  for (const [key, value] of Object.entries(values)) await page.selectOption(`#setting__${key}`, value);
  await page.getByRole("button", { name: /save tax and invoicing/i }).click();
  await page.getByText(/Tax and invoicing saved/i).first().waitFor({ timeout: 30000 });
};

const slug = `probe-price-${Date.now()}`;
let productId = null;
let before = null;

try {
  await open("/admin/store/invoicing");
  await page.locator("#setting__store_price_entry").waitFor();
  before = {
    store_price_entry: await page.locator("#setting__store_price_entry").inputValue(),
    store_price_basis: await page.locator("#setting__store_price_basis").inputValue(),
  };
  const rate = await page.locator("#setting__store_gst_percent").inputValue();
  check(rate === "18", "the shop's rate is 18%", `it is ${rate}% — the figures below assume 18`);

  /* ------------------------------------------- 1. typing before GST */

  await saveSettings({ store_price_entry: "exclusive", store_price_basis: "inclusive" });

  await open("/admin/store/products/new");
  await page.locator("#name").waitFor();
  await page.waitForTimeout(3000); // hydration on a slow dev server
  await page.fill("#name", "Probe price switch");
  await page.fill("#slug", slug);
  await page.selectOption("#status", "published");
  await page.getByRole("tab", { name: "Selling" }).click();
  check(await page.getByText("Price (before GST)").first().isVisible(), "the price field says it is before GST");
  await page.fill("#price", "1000");
  check(
    await page.getByText(/The customer pays ₹1,180/).first().isVisible(),
    "the form shows what the customer pays as it is typed",
  );
  await page.fill("#stock", "5").catch(() => {});
  await page.getByRole("button", { name: /create product/i }).click();
  await page.waitForURL(/\/admin\/store\/products\/\d+/, { timeout: 120000 });
  productId = page.url().match(/products\/(\d+)/)[1];

  await page.getByRole("tab", { name: "Selling" }).click();
  check((await page.locator("#price").inputValue()) === "1000.00" || (await page.locator("#price").inputValue()) === "1000",
    "the form gives back the figure typed", await page.locator("#price").inputValue());

  /* ------------------------------------ 2 and 3. how it is shown */

  const shopFigures = async () => {
    await open(`/store/products/${slug}`);
    await page.locator("h1").waitFor();
    const text = await page.locator("main").innerText();
    return text;
  };

  const withGst = await shopFigures();
  check(/₹1,180/.test(withGst) && /Includes 18% GST/.test(withGst), "with GST, the page shows ₹1,180 and says it includes 18%");

  await page.getByRole("button", { name: /add to basket/i }).first().click();
  await page.waitForTimeout(2500);
  await open("/cart");
  await page.getByText("Summary").waitFor();
  const totalWith = await page.locator("aside dl > div", { hasText: /^Total/ }).last().innerText();

  await saveSettings({ store_price_basis: "exclusive" });

  const beforeGst = await shopFigures();
  check(/₹1,000/.test(beforeGst) && /Plus 18% GST/.test(beforeGst), "before GST, the page shows ₹1,000 and says plus 18%");

  await open("/cart");
  await page.getByText("Summary").waitFor();
  const aside = await page.locator("aside").first().innerText();
  const totalBefore = await page.locator("aside dl > div", { hasText: /^Total/ }).last().innerText();
  check(/GST at 18%/.test(aside), "the basket prints GST as a row");
  check(totalWith === totalBefore, "the total is the same either way", `${totalWith} / ${totalBefore}`);
} catch (error) {
  check(false, "the run finished", String(error).slice(0, 300));
} finally {
  // Each step on its own: a failure in one must not leave the others undone.
  const attempt = async (what, fn) => fn().catch((e) => check(false, what, String(e).slice(0, 200)));
  if (before) await attempt("the settings were put back", () => saveSettings(before));
  if (productId) {
    await attempt("the product was deleted", async () => {
      await open(`/admin/store/products/${productId}`);
      await page.getByRole("button", { name: /^delete/i }).first().click();
      await page.waitForURL((u) => !/\/products\/\d+/.test(u.pathname), { timeout: 60000 });
    });
  }
  await attempt("the basket was emptied", async () => {
    await open("/cart");
    // Deleting the product usually empties the basket already.
    const empty = page.getByRole("button", { name: /empty the basket/i });
    if (await empty.count()) await empty.click();
  });
  await browser.close();
}

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
