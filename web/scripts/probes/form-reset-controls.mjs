import { chromium } from "playwright";

/**
 * Measures that controlled, **unnamed** selects and tick boxes inside a
 * `<Form>` still show their value after the form's action settles
 * (`components/ui/form.tsx`).
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/form-reset-controls.mjs
 *
 * React resets a form's controls when its action completes, a refused one
 * included. A controlled text input survives, because React keeps its `value`
 * attribute in step with its state; a `<select>` does not — `selected` is set
 * as a property, so the DOM's reset lands on the first option while the
 * state, and what is posted, still hold the real value. Whether anybody sees
 * it depends on whether something happens to re-render the editor after the
 * reset, which is why it hid: on the form builder it showed only on a form
 * created in the console and then refused once on its edit page, where every
 * "Type" fell back to "Short text" and every "Width" to "Full width"
 * (0.117.0). The control run that pins this: with `<Form>`'s `reset`
 * listener removed, the last check fails on every select.
 *
 * It creates a form through the builder, lands on its edit page, provokes a
 * refused save (a blank label) and compares every unnamed select and box with
 * what it showed before. **It writes one draft form and deletes it** through
 * the screen's own Delete button, so run it against a development install.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
page.on("dialog", (d) => d.accept());

const { signInAsStaff } = await import("../shared.mjs");
await signInAsStaff(page);
await page.goto(`${BASE}/admin/forms/new`, { waitUntil: "load", timeout: 180000 });
await page.waitForTimeout(4000);

await page.fill("#name", `Reset probe ${Date.now()}`);
await page.selectOption("#status", "draft");
await page.getByRole("tab", { name: /Fields/ }).click();
const rows = page.locator('input[name="fields"] ~ ol > li');
const add = async (label, kind, width) => {
  await page.getByRole("button", { name: "Add a field" }).click();
  await rows.last().getByLabel("Label", { exact: true }).fill(label);
  await rows.last().getByLabel("Type", { exact: true }).selectOption(kind);
  if (width) await rows.last().getByLabel("Width", { exact: true }).selectOption(width);
};
await add("Agree", "checkbox", "half");
await rows.last().getByLabel("Required").check();
await add("Quantity", "number", "half");
await page.getByRole("button", { name: "Add a step break" }).click();
await add("Work email", "email");
await add("More", "textarea");

const read = () => page.evaluate(() =>
  [...document.querySelector("#name").form.elements]
    .filter((el) => !el.name && (el instanceof HTMLSelectElement || el.type === "checkbox"))
    .map((el) => (el instanceof HTMLSelectElement ? el.value : el.checked)));
const unfoldAll = () => page.evaluate(() =>
  document.querySelectorAll('input[name="fields"] ~ ol > li > div > button[aria-expanded="false"]').forEach((b) => b.click()));

await page.locator('form button[type="submit"]').filter({ hasText: /Create|Save/ }).first().click();
await page.waitForURL((u) => /\/admin\/forms\/\d+$/.test(u.pathname), { timeout: 60000 });
const path = new URL(page.url()).pathname;
await page.waitForTimeout(3000);
await page.getByRole("tab", { name: /Fields/ }).click();
await unfoldAll();
await page.waitForTimeout(500);

const before = await read();
ok(before.filter((v) => typeof v === "string" && !["text", "full"].includes(v)).length >= 4, `selects are off their first option (${JSON.stringify(before)})`);

// A refused save: the first field loses its label, and its row is folded so the error has to open it.
await rows.first().getByLabel("Label", { exact: true }).fill("");
await rows.first().locator("> div > button[aria-expanded]").click();
await page.locator('form button[type="submit"]').filter({ hasText: /Save/ }).first().click();
await page.waitForFunction(() => document.querySelector('input[name="fields"] ~ ol .text-err') !== null, null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(3000);
await unfoldAll();

const after = await read();
ok(JSON.stringify(after) === JSON.stringify(before), "every select and box shows what it showed before the refused save");
if (JSON.stringify(after) !== JSON.stringify(before)) console.log(`      before ${JSON.stringify(before)}\n      after  ${JSON.stringify(after)}`);

// Leave nothing behind.
await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 180000 });
await page.waitForTimeout(2500);
await page.getByRole("button", { name: "Delete form" }).click();
await page.waitForURL((u) => u.pathname === "/admin/forms", { timeout: 60000 }).then(
  () => ok(true, "the probe's form is deleted"), () => ok(false, `could not delete ${path} — remove it by hand`));

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
