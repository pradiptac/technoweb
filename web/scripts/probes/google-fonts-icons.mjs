/**
 * Google fonts and Google icons, through the real screens (0.179.0,
 * docs/theming.md "Google fonts", docs/icons.md, docs/editor.md).
 *
 *   1. Settings → Colour palette: Browse Google Fonts for headlines, search
 *      "Poppins", Install and use, Save. The theme preview's h1 is then set in
 *      `tw-g-poppins`, its files come from `/font/g/poppins/…` on this origin,
 *      and **no request leaves for any Google host** while the page loads.
 *   2. A solution's icon picker → Google icons → "router", Save: the record
 *      stores `ms:router` and its public page draws `<use href=…router.svg#i>`.
 *   3. `[icon name="ms:call"]` typed into a draft page's body renders an
 *      inline `svg.prose-icon` in the saved preview.
 *
 * It puts everything back: the headline font, the solution's icon, the draft
 * page deleted, the Google font removed. It downloads one real font from
 * Google once (step 1). No credential is in this file — `ADMIN_LOGIN_EMAIL`
 * and `ADMIN_LOGIN_PASSWORD` only. One probe at a time, never beside an audit.
 *
 *   cd web && ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/google-fonts-icons.mjs
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
const admin = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
admin.setDefaultTimeout(90000);
admin.on("dialog", (d) => d.accept().catch(() => {}));

const { signInAsStaff } = await import("../shared.mjs");
await signInAsStaff(admin);

const openAppearance = async () => {
  await admin.goto(`${BASE}/admin/site/settings?tab=appearance`, { waitUntil: "load", timeout: 180000 });
  await admin.locator("#setting__theme_font_display").waitFor();
  await admin.waitForTimeout(2500); // hydration
};
/**
 * Open the icon picker. The field arrives through next/dynamic and hydrates
 * late on a busy dev server: a click on the server-rendered button before
 * then does nothing, so the click is retried until the dialog is open.
 */
const openPicker = async () => {
  const picker = admin.locator("dialog[open]").filter({ hasText: "Choose an icon" });
  for (let i = 0; i < 10 && !(await picker.count()); i++) {
    await admin.getByRole("button", { name: /Choose icon/i }).first().click();
    await admin.waitForTimeout(1500);
  }
  return picker;
};
/** Save, and wait for the save's own `ok` toast (`tw:saved`): a busy dev server can take longer than any fixed wait. */
const saveSettings = async () => {
  const outcome = admin.evaluate(() => new Promise((resolve) => {
    addEventListener("tw:saved", () => resolve("saved"), { once: true });
    addEventListener("tw:refused", () => resolve("refused"), { once: true });
    setTimeout(() => resolve("no answer in 120s"), 120000);
  }));
  await admin.getByRole("button", { name: /Save site settings/ }).click();
  const result = await outcome;
  if (result !== "saved") throw new Error(`saving the settings: ${result}`);
  await admin.waitForTimeout(1000);
};

let originalFont = null;
let solution = null;
let pageId = null;

try {
  /* ---------------------------------------------------- 1. a Google font */

  await openAppearance();
  originalFont = await admin.locator("#setting__theme_font_display").inputValue();

  await admin.getByRole("button", { name: /Browse Google Fonts for headlines/ }).click();
  const dialog = admin.locator("dialog[open]").filter({ hasText: "Google Fonts" });
  await dialog.getByRole("searchbox", { name: "Search Google Fonts" }).fill("Poppins");
  const card = dialog.locator("li").filter({ hasText: /^Poppins/ }).first();
  await card.waitFor({ timeout: 60000 });
  await card.getByRole("button", { name: /Install and use|^Use$/ }).click();
  await dialog.waitFor({ state: "detached", timeout: 120000 }).catch(() => {});
  check((await admin.locator("#setting__theme_font_display").inputValue()) === "g-poppins", "installing selects the font in the headline list");
  await saveSettings();

  const preview = await admin.context().newPage();
  const hosts = new Set();
  const fontFiles = [];
  preview.on("request", (r) => hosts.add(new URL(r.url()).hostname));
  preview.on("response", (r) => { if (new URL(r.url()).pathname.startsWith("/font/g/")) fontFiles.push(r.status()); });
  await preview.goto(`${BASE}/theme-preview/classic`, { waitUntil: "load", timeout: 180000 });
  await preview.evaluate(() => document.fonts.ready);
  await preview.waitForTimeout(2000);
  const family = await preview.evaluate(() => getComputedStyle(document.querySelector(".public-site h1")).fontFamily);
  await preview.close();

  // The computed value may or may not quote the family name.
  check(family.replace(/"/g, "").startsWith("tw-g-poppins"), "the heading is set in the copied font", family);
  check(fontFiles.length > 0 && fontFiles.every((s) => s === 200), "its files come from this site's /font/g/ route", `${fontFiles.length} file(s)`);
  const google = [...hosts].filter((h) => /google|gstatic/.test(h));
  check(google.length === 0, "no request went to a Google host", google.join(", "));

  /* ------------------------------------------------- 2. a Google icon */

  await admin.goto(`${BASE}/admin/solutions`, { waitUntil: "load", timeout: 180000 });
  const editHref = await admin.locator('a[href^="/admin/solutions/"]').filter({ hasNotText: /new/i }).first().getAttribute("href");
  await admin.goto(`${BASE}${editHref}`, { waitUntil: "load", timeout: 180000 });
  await admin.waitForTimeout(3000);
  solution = { href: editHref, icon: await admin.locator('input[type="hidden"][name="icon"]').inputValue() };

  // The icon field is on the Media tab.
  await admin.getByRole("tab", { name: "Media" }).click();
  const picker = await openPicker();
  await picker.getByRole("tab", { name: "Google icons" }).click();
  await picker.getByRole("searchbox", { name: "Search Google icons" }).fill("router");
  await picker.getByRole("button", { name: "router", exact: true }).click();
  check((await admin.locator('input[type="hidden"][name="icon"]').inputValue()) === "ms:router", "the picker stores ms:router");
  await admin.getByRole("button", { name: /^Save changes$/ }).first().click();
  await admin.waitForTimeout(6000);

  // The solutions list draws each card's icon (a solution's own page does not).
  const page = await admin.context().newPage();
  await page.goto(`${BASE}/solutions`, { waitUntil: "load", timeout: 180000 });
  const drawn = await page.locator('use[href="/icons/material/router.svg#i"]').count();
  await page.close();
  check(drawn > 0, "the public solutions list draws the Google icon");

  /* -------------------------------------------- 3. an icon in the text */

  await admin.goto(`${BASE}/admin/pages/new`, { waitUntil: "load", timeout: 180000 });
  await admin.waitForTimeout(3000);
  await admin.fill("#title", `Probe icon page ${Date.now()}`);
  // Published so its own address renders the body (the saved preview is for builder pages); deleted below.
  await admin.selectOption("#status", "published");
  const body = admin.locator(".note-editable").first();
  await body.click();
  await body.pressSequentially('Call us [icon name="ms:call"] today', { delay: 5 });
  await admin.waitForTimeout(1500);
  await admin.getByRole("button", { name: /^Create page$|^Save$/ }).first().click();
  await admin.waitForURL(/\/admin\/pages\/\d+/, { timeout: 120000 });
  pageId = admin.url().match(/pages\/(\d+)/)[1];

  const pageSlug = await admin.locator("#slug").inputValue();
  const saved = await admin.context().newPage();
  await saved.goto(`${BASE}/${pageSlug}`, { waitUntil: "load", timeout: 180000 });
  const inline = await saved.locator('p svg.prose-icon use[href="/icons/material/call.svg#i"]').count();
  await saved.close();
  check(inline === 1, "the page draws the icon inside the sentence", `/${pageSlug}`);
} catch (error) {
  check(false, "the run finished", String(error).slice(0, 300));
} finally {
  const attempt = async (what, fn) => fn().catch((e) => check(false, what, String(e).slice(0, 200)));

  if (pageId) {
    await attempt("the draft page was deleted", async () => {
      await admin.goto(`${BASE}/admin/pages/${pageId}`, { waitUntil: "load", timeout: 180000 });
      await admin.waitForTimeout(4000); // hydration: before it the button submits nothing
      await admin.getByRole("button", { name: /^Delete page$/ }).click();
      // The action redirects to the list once the API has deleted it.
      await admin.waitForURL(/\/admin\/pages(\?|$)/, { timeout: 120000 });
    });
  }
  if (solution) {
    await attempt("the solution's icon was put back", async () => {
      await admin.goto(`${BASE}${solution.href}`, { waitUntil: "load", timeout: 180000 });
      await admin.waitForTimeout(3000);
      await admin.getByRole("tab", { name: "Media" }).click();
      // The field's own controls: clear, or reopen and pick the old site icon.
      if (!solution.icon) {
        await admin.getByRole("button", { name: /Clear the icon/i }).click();
      } else {
        const picker = await openPicker();
        await picker.getByRole("searchbox", { name: "Search icons" }).fill(solution.icon);
        await picker.getByRole("button", { name: new RegExp(`^${solution.icon}$`) }).first().click();
      }
      await admin.getByRole("button", { name: /^Save changes$/ }).first().click();
      await admin.waitForTimeout(6000);
    });
  }
  if (originalFont) {
    await attempt("the headline font was put back", async () => {
      await openAppearance();
      await admin.selectOption("#setting__theme_font_display", originalFont);
      await saveSettings();
    });
    await attempt("the Google font was removed", async () => {
      await openAppearance();
      await admin.waitForTimeout(2000);
      const row = admin.locator("li").filter({ hasText: /^Poppins/ });
      if (await row.count()) await row.getByRole("button", { name: "Remove" }).click();
      await admin.waitForTimeout(3000);
    });
  }
  await browser.close();
}

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
