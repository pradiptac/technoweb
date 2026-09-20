import { chromium } from "playwright";

/**
 * Measures `FormDraft` (`components/admin/form-draft.tsx`) on the new-post
 * form, which nothing here submits.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/form-draft.mjs
 *
 * Checks: (1) a title typed and a paragraph typed into the editor reach
 * `localStorage` under the route's key within the ten-second cadence (the
 * tab being hidden forces a save, so the probe does not wait ten seconds);
 * (2) after a reload the form is blank and offers the draft; (3) Restore
 * puts the title back into the input and the paragraph back into the
 * editor, and the hidden body input carries it; (4) Discard on a fresh
 * offer removes the key. The draft is cleared at the end.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const KEY = "tw_draft:/admin/blog/new";

const { signInAsStaff } = await import("../shared.mjs");
await signInAsStaff(page);
await page.goto(`${BASE}/admin/blog/new`, { waitUntil: "load", timeout: 120000 });
await page.evaluate((k) => localStorage.removeItem(k), KEY);

await page.locator("#title").fill("Draft probe title");
const editor = page.locator(".note-editable").first();
await editor.waitFor({ timeout: 30000 });
await editor.click();
await page.keyboard.type("Draft probe paragraph");
// Summernote reports the change on keyup and React commits it a tick later;
// the hidden input is what the draft reads, so give it that tick.
await page.waitForTimeout(500);
// Hiding the tab writes the draft at once.
await page.evaluate(() => {
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
});
const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null"), KEY);
ok(stored?.values?.title?.[0] === "Draft probe title", "title reached the draft");
ok((stored?.values?.body?.[0] ?? "").includes("Draft probe paragraph"), "editor text reached the draft");

await page.reload({ waitUntil: "load" });
ok((await page.locator("#title").inputValue()) === "", "after reload the form is blank");
const offer = page.locator("[data-form-draft]").getByRole("button", { name: "Restore" });
await offer.waitFor({ timeout: 10000 }).catch(() => {});
ok((await offer.count()) === 1, "the draft is offered");
await offer.click();
ok((await page.locator("#title").inputValue()) === "Draft probe title", "Restore puts the title back");
await page.locator(".note-editable").first().waitFor({ timeout: 30000 });
await page.waitForFunction(() => document.querySelector(".note-editable")?.textContent?.includes("Draft probe paragraph"), null, { timeout: 10000 })
  .then(() => ok(true, "Restore puts the paragraph back into the editor"), () => ok(false, "editor did not take the paragraph"));
ok((await page.locator('input[type="hidden"][name="body"]').inputValue()).includes("Draft probe paragraph"), "the hidden body input carries it");

await page.reload({ waitUntil: "load" });
const discard = page.locator("[data-form-draft]").getByRole("button", { name: "Discard" });
await discard.waitFor({ timeout: 10000 }).catch(() => {});
await discard.click();
ok((await page.evaluate((k) => localStorage.getItem(k), KEY)) === null, "Discard removes the draft");

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
