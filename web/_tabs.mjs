import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const ok = (l, c, e = "") => console.log(`${c ? "PASS" : "FAIL"}  ${l}${e ? "  — " + e : ""}`);

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultNavigationTimeout(240_000);
page.setDefaultTimeout(60_000);

await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
await page.fill("#email", "admin@technoware.in");
await page.fill("#password", process.env.ADMIN_PASSWORD);
await Promise.all([page.waitForURL(/\/admin(?!\/login)/), page.click('button[type="submit"]')]);

await page.goto(`${BASE}/admin/settings`, { waitUntil: "networkidle" });

const tabs = page.locator('[role="tab"]');
ok("settings is tabbed", (await tabs.count()) >= 8, `${await tabs.count()} tabs`);

const doc = await page.evaluate(() => Math.round(document.documentElement.scrollHeight));
ok("page is no longer 5266px", doc < 2000, `${doc}px`);

// THE test: fields on an inactive tab must still be in the form.
const inactiveInputs = await page.evaluate(() => {
  const form = document.querySelector("main form");
  const hiddenPanels = [...document.querySelectorAll('[role="tabpanel"][hidden]')];
  const inputsInHidden = hiddenPanels.reduce(
    (n, p) => n + p.querySelectorAll("input,select,textarea").length, 0);
  // Would a submit actually carry them?
  const fd = new FormData(form);
  const keys = [...fd.keys()];
  return {
    hiddenPanels: hiddenPanels.length,
    inputsInHidden,
    formDataKeys: keys.length,
    // A field that only exists on a non-visible tab.
    carriesHiddenTabField: keys.includes("setting__smtp_host"),
  };
});
ok("inactive panels are hidden, not unmounted", inactiveInputs.inputsInHidden > 0,
   `${inactiveInputs.inputsInHidden} inputs across ${inactiveInputs.hiddenPanels} hidden panels`);
ok("a submit would still carry fields from other tabs",
   inactiveInputs.carriesHiddenTabField, `${inactiveInputs.formDataKeys} keys in FormData`);

// Prove it end to end: edit a field on tab 1, switch tabs, save, confirm both survive.
await page.locator('[role="tab"]').first().click();
const tagline = page.locator("#setting__tagline");
const original = await tagline.inputValue();
await tagline.fill("Tab persistence probe");

await page.getByRole("tab", { name: /outgoing mail/i }).click();
await page.waitForTimeout(150);
ok("switching tab keeps the edited value in the DOM",
   (await tagline.inputValue()) === "Tab persistence probe");

await page.locator('#setting__smtp_port').fill("2525");
await page.getByRole("button", { name: /save settings/i }).click();
await page.locator("text=Settings saved").waitFor({ state: "visible", timeout: 60_000 }).catch(() => {});
ok("save succeeds from a non-first tab", await page.locator("text=Settings saved").isVisible());

await page.reload({ waitUntil: "networkidle" });
const persisted = await page.evaluate(() => ({
  tagline: document.querySelector("#setting__tagline")?.value,
  port: document.querySelector("#setting__smtp_port")?.value,
}));
ok("field edited on tab 1 was saved", persisted.tagline === "Tab persistence probe", persisted.tagline);
ok("field edited on tab 8 was saved", persisted.port === "2525", persisted.port);

// Put it back.
await page.locator('[role="tab"]').first().click();
await page.locator("#setting__tagline").fill(original);
await page.getByRole("tab", { name: /outgoing mail/i }).click();
await page.locator("#setting__smtp_port").fill("587");
await page.getByRole("button", { name: /save settings/i }).click();
await page.locator("text=Settings saved").waitFor({ state: "visible", timeout: 60_000 }).catch(() => {});
console.log("\n  (restored tagline and smtp_port)");

// Keyboard reachability of tabs.
const tabRoles = await page.evaluate(() =>
  [...document.querySelectorAll('[role="tab"]')].every((t) => t.tagName === "BUTTON"));
ok("tabs are real buttons, so keyboard reaches them", tabRoles);

await b.close();
