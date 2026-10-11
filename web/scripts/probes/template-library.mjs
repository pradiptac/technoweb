import { chromium } from "playwright";

/**
 * The page-template library (0.162.0, docs/page-builder.md "The library"),
 * driven through the real buttons on a throwaway builder page.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/template-library.mjs
 *   BASE=http://localhost:3000 (default 127.0.0.1:3000)
 *
 * **It creates one draft page and deletes it again; it never presses Save on
 * the builder.** On the page with one section (a Divider) it: opens Apply a
 * template — the dialog lists templates by category with a section count and
 * a Preview; Add at the end grows the list by the template's count; one Undo
 * brings it back to one; Replace all sections asks first, naming the one
 * section that goes, and then leaves exactly the template's sections; one Undo
 * brings back the one; Preview on a starter shows its first heading inside the
 * dialog's frame. Finally a reload shows the page empty — nothing was saved.
 *
 * Needs at least one page template in the library (the starters, on a real
 * install; the mock has two). Carries no credential. Not run by the author of
 * the release: written against the markup, so a locator that has drifted
 * fails here first.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const T = 180000;
const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const problems = [];

// The helper signs in on its own default origin; both must use one.
process.env.BASE = BASE;
const { signInAsStaff } = await import("../shared.mjs");
const context = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
const page = await context.newPage();
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`));
await signInAsStaff(page);

const stamp = Date.now().toString(36);
await page.goto(`${BASE}/admin/pages/new`, { waitUntil: "load", timeout: T });
await page.locator("#title").fill(`Template probe ${stamp}`);
await page.locator("#slug").fill(`template-probe-${stamp}`);
await page.locator("#template").selectOption("builder");
await page.locator("#status").selectOption("draft");
await Promise.all([
  page.waitForURL(/\/admin\/pages\/\d+/, { timeout: T }),
  page.locator('button[type="submit"]').filter({ hasText: /^(Create|Save)/ }).first().click(),
]);
const pageId = page.url().match(/\/admin\/pages\/(\d+)/)?.[1];
ok(Boolean(pageId), `a throwaway page was created (${pageId})`);

const cards = page.locator("li[data-section-card]");
const dialog = page.locator("dialog[open]").last();
const toolbar = page.getByRole("toolbar", { name: "Builder history" });
const count = async (n, label) => {
  try {
    await page.waitForFunction((want) => document.querySelectorAll("li[data-section-card]").length === want, n, { timeout: 15000 });
    return ok(true, label);
  } catch {
    return ok(false, `${label} (found ${await cards.count()})`);
  }
};

try {
  await page.goto(`${BASE}/admin/pages/${pageId}?tab=builder`, { waitUntil: "load", timeout: T });
  await page.getByRole("button", { name: "Add a section" }).first().waitFor({ timeout: T });
  await page.waitForTimeout(1500);

  // One section to start with.
  await page.getByRole("button", { name: "Add a section" }).first().click();
  await page.locator("dialog[open] button", { hasText: "Divider" }).first().click();
  await count(1, "the page starts with one section");

  // Apply, then Add at the end.
  await toolbar.getByRole("button", { name: "Apply a template" }).click();
  const picker = dialog.locator("[data-template-picker]");
  await picker.waitFor({ timeout: 30000 });
  const rows = picker.locator("li[data-template-id]");
  ok(await rows.count() > 0, "the picker lists the page templates");
  const n = Number(((await rows.first().innerText()).match(/(\d+) sections?/) ?? [])[1]);
  ok(n > 0, `the first template says how many sections it holds (${n})`);
  await rows.first().getByRole("button", { name: /^Add at the end/ }).click();
  await count(1 + n, `Add at the end adds the template's ${n} sections after the page's own`);
  await toolbar.getByRole("button", { name: "Undo" }).click();
  await count(1, "one Undo takes them all out again");

  // Apply, then Replace all sections, confirmed.
  await toolbar.getByRole("button", { name: "Apply a template" }).click();
  await picker.waitFor({ timeout: 30000 });
  await rows.first().getByRole("button", { name: /^Replace all sections/ }).click();
  const confirm = dialog.getByRole("alertdialog", { name: "Replace all sections" });
  ok(await confirm.getByText(/Replace 1 section with/).count() === 1, "Replace names how many sections go before it does anything");
  await count(1, "nothing has changed before the confirmation");
  await confirm.getByRole("button", { name: /^Replace 1 section/ }).click();
  await count(n, `Replace leaves exactly the template's ${n} sections`);
  await toolbar.getByRole("button", { name: "Undo" }).click();
  await count(1, "one Undo brings back the page's own section");

  // Preview on a starter.
  await toolbar.getByRole("button", { name: "Apply a template" }).click();
  await picker.waitFor({ timeout: 30000 });
  const starter = picker.locator("li[data-template-id]", { hasText: "Starter: landing page" }).first();
  const target = (await starter.count()) ? starter : rows.first();
  await target.getByRole("button", { name: /^Preview/ }).click();
  const frame = page.frameLocator('dialog[open] iframe[title^="Preview of"]');
  const drawn = await frame.getByText("[Your headline]").first().waitFor({ timeout: T }).then(() => true, () => false);
  ok(drawn, "Preview draws the starter's first heading inside the dialog's frame");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await count(1, "previewing and closing changed nothing on the page");

  // Nothing was saved: a fresh load of the page is empty.
  await page.evaluate(() => { try { localStorage.clear(); } catch { /* none */ } });
  await page.goto(`${BASE}/admin/pages/${pageId}?tab=builder`, { waitUntil: "load", timeout: T });
  await page.getByRole("button", { name: "Add a section" }).first().waitFor({ timeout: T });
  await page.waitForTimeout(1500);
  await count(0, "nothing was saved: a fresh load of the page has no sections");
} finally {
  if (pageId) {
    try {
      await page.evaluate(() => { try { localStorage.clear(); } catch { /* none */ } });
      await page.goto(`${BASE}/admin/pages/${pageId}`, { waitUntil: "load", timeout: T });
      await page.waitForTimeout(2000);
      // The form's Delete asks through `window.confirm`, which Playwright cancels unless told otherwise.
      page.on("dialog", (d) => d.accept().catch(() => {}));
      await page.getByRole("button", { name: /^Delete/ }).first().click();
      const confirmDelete = page.locator("dialog[open] button", { hasText: /^Delete/ }).last();
      if (await confirmDelete.count()) await confirmDelete.click();
      await page.waitForURL((u) => u.pathname === "/admin/pages", { timeout: 30000 });
      console.log("ok   the throwaway page was deleted");
    } catch (e) {
      console.log(`FAIL could not delete page ${pageId}; remove it by hand: ${String(e).slice(0, 120)}`);
      failed++;
    }
  }
}

ok(problems.length === 0, `no console errors or warnings${problems.length ? ":\n  " + problems.join("\n  ") : ""}`);
await browser.close();
process.exit(failed ? 1 : 0);
