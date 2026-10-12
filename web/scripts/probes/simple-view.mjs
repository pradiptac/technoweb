import { chromium } from "playwright";

/**
 * Measures Simple view on an entity form (docs/help-and-tours.md).
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/simple-view.mjs
 *
 * On /admin/blog/new: (1) SEO shows by default and the switch is on the
 * form. (2) Simple view hides SEO and AEO and survives a reload — stamped on
 * <html> before paint. (3) The SEO panel stays mounted, so its fields are
 * still in the form. (4) Saving with no title shows the error and keeps the
 * form usable. (5) ?tab=seo still shows SEO. (6) Off restores the tabs.
 * Puts the preference back.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
process.env.BASE = BASE; // shared.mjs signs in on 127.0.0.1 unless told
const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)); });
const { signInAsStaff } = await import("../shared.mjs");
await signInAsStaff(page);
const go = async (p) => { await page.goto(`${BASE}${p}`, { waitUntil: "load", timeout: 180000 }); await page.waitForTimeout(2500); };
const tab = (name) => page.getByRole("tab", { name: new RegExp(`^${name}`) });

await page.evaluate(() => localStorage.removeItem("tw_console_simple")).catch(() => {});
await go("/admin/blog/new");
ok(await tab("SEO").isVisible(), "SEO is shown by default");
const sw = page.getByRole("switch", { name: "Simple view" });
ok(await sw.count() === 1, "the Simple view switch is on the form");
if (await sw.count() === 1) {
  await sw.check({ force: true });
  await page.waitForTimeout(300);
  ok(!(await tab("SEO").isVisible()) && !(await tab("AEO").isVisible()), "Simple view hides SEO and AEO");
  ok(await tab("Content").isVisible(), "the Content tab stays");
  await go("/admin/blog/new");
  ok(await page.evaluate(() => document.documentElement.dataset.consoleSimple === "1"), "the choice is stamped on <html>");
  ok(!(await tab("SEO").isVisible()), "it survives a reload");
  ok(await page.locator('form [name^="seo"]').count() > 0, "the SEO panel's fields are still in the form");

  await page.locator('input[name="title"]').fill("");
  await page.locator("[data-form-actions] button[type=submit]").first().click();
  await page.locator("[aria-invalid='true'], [role=alert]").first().waitFor({ timeout: 20000 }).catch(() => {});
  ok(await page.locator("[aria-invalid='true'], [role=alert]").count() >= 1, "a save with no title shows its error");
  ok(await page.locator('input[name="title"]').isEditable(), "the form is still usable");

  // An error on the hidden SEO tab: the tab comes back and opens.
  await go("/admin/blog/new");
  await page.locator('input[name="title"]').fill("Simple view probe — never saved");
  await page.evaluate(() => { const i = document.querySelector('input[name="seo_canonical_url"]'); if (i) i.value = "not a web address"; });
  await page.locator("[data-form-actions] button[type=submit]").first().click();
  await tab("SEO").waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  ok(await tab("SEO").isVisible(), "an error on the hidden SEO tab brings it back");
  ok(await tab("SEO").getAttribute("aria-selected") === "true", "and opens it");

  await go("/admin/blog/new?tab=seo");
  ok(await tab("SEO").isVisible(), "?tab=seo still shows SEO");

  await go("/admin/blog/new");
  await page.getByRole("switch", { name: "Simple view" }).uncheck({ force: true });
  await page.waitForTimeout(300);
  ok(await tab("SEO").isVisible(), "switching off restores the tabs");
}
await page.evaluate(() => localStorage.removeItem("tw_console_simple"));
ok(errors.length === 0, `nothing logged${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await browser.close();
process.exit(failed ? 1 : 0);
