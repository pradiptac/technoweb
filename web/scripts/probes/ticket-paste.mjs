/**
 * The ticket forms' clipboard paste, file rows and the sensitive switch,
 * through the real screens against a real API (2026-09-21).
 *
 * Measures, on the portal:
 *   1. Ctrl+V of a PNG into the new-ticket description adds a row with a
 *      thumbnail, the size and a remove button; a second paste appends
 *      rather than replaces; remove takes one row out and the input's
 *      FileList with it; the pasted file is renamed `pasted-<stamp>.png`.
 *   2. A text paste still pastes text and adds no row.
 *   3. The ticket is created with the pasted screenshot attached and its own
 *      "sensitive" switch ticked: the thread lists the file and the original
 *      request carries the lock.
 *   4. A reply with a pasted screenshot and "sensitive" ticked lands with
 *      the lock badge, the body in clear on screen and the attachment listed;
 *      the reply form's rows are gone after the send (the form reset).
 *
 * Run from web/ with a dev server on :3000 against the real API:
 *   PORTAL_LOGIN_EMAIL=… PORTAL_LOGIN_PASSWORD=… node scripts/probes/ticket-paste.mjs
 * Optional: BASE (default http://localhost:3000). No credential lives here.
 *
 * The paste is a synthetic `ClipboardEvent` carrying a `DataTransfer` with a
 * `File` — Playwright cannot put an image on the system clipboard — which is
 * exactly the event a real Ctrl+V dispatches to the focused element.
 */
import { chromium } from "playwright";
import { switchToPasswordForm } from "../shared.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const env = (k) => { const v = process.env[k]; if (!v) throw new Error(`${k} is not set`); return v; };
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); };

// A 64x48 PNG, drawn on a canvas in the page so the bytes are a real image.
const PASTE_PNG = async ({ selector, kind }) => {
    const canvas = document.createElement("canvas");
    canvas.width = 64; canvas.height = 48;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#4a5a2a"; ctx.fillRect(0, 0, 64, 48);
    ctx.fillStyle = "#fff"; ctx.fillRect(8, 8, 48, 32);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    const dt = new DataTransfer();
    if (kind === "image") dt.items.add(new File([blob], "image.png", { type: "image/png" }));
    else dt.setData("text/plain", "pasted words");
    const el = document.querySelector(selector);
    el.focus();
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    return blob.size;
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !/MaxListeners/.test(m.text())) errors.push(m.text().slice(0, 160)); });

await page.goto(`${BASE}/portal/login`, { waitUntil: "load", timeout: 180_000 });
await switchToPasswordForm(page);
await page.fill("#email", env("PORTAL_LOGIN_EMAIL"));
await page.fill("#password", env("PORTAL_LOGIN_PASSWORD"));
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/portal/login"), { timeout: 180_000 }), page.click('button[type="submit"]')]);

// 1. The new-ticket form.
await page.goto(`${BASE}/portal/tickets/new`, { waitUntil: "load", timeout: 180_000 });
// The listener is registered by an effect after hydration; a paste before
// that is a paste into a page that is not listening yet.
const hydrated = () => page.waitForFunction(() => document.querySelector('input[name="attachments"]')?.form && Boolean(document.querySelector("[data-hydrated], form")) , null, { timeout: 60_000 }).then(() => page.waitForTimeout(1200));
await hydrated();
const rows = page.locator('ul[aria-label="Files to send"] > li');
const fileCount = () => page.evaluate(() => document.querySelector('input[name="attachments"]').files.length);

const size = await page.evaluate(PASTE_PNG, { selector: "#description", kind: "image" });
await rows.first().waitFor({ timeout: 10_000 });
const first = (await rows.first().innerText()).replace(/\s+/g, " ");
check("a pasted PNG adds a row named by the moment it was pasted", /pasted-\d{8}-\d{6}\.png/.test(first), first);
check("the row shows the size", new RegExp(`${(size / 1024).toFixed(1).replace(/\\.0$/, "")}|${size} B|KB`).test(first), first);
check("the row carries a thumbnail", (await rows.first().locator("img").count()) === 1);
check("the hidden input holds the file", (await fileCount()) === 1, String(await fileCount()));

await page.evaluate(PASTE_PNG, { selector: "#description", kind: "image" });
await page.waitForFunction(() => document.querySelectorAll('ul[aria-label="Files to send"] > li').length === 2, null, { timeout: 10_000 });
check("a second paste appends", (await fileCount()) === 2, String(await fileCount()));

await page.evaluate(PASTE_PNG, { selector: "#description", kind: "text" });
await page.waitForTimeout(300);
check("a text paste adds no row", (await rows.count()) === 2, String(await rows.count()));

await rows.first().getByRole("button", { name: /^Remove/ }).click();
await page.waitForFunction(() => document.querySelectorAll('ul[aria-label="Files to send"] > li').length === 1, null, { timeout: 10_000 });
check("remove takes the row and the file out", (await fileCount()) === 1, String(await fileCount()));

await page.fill("#subject", "Paste probe: screenshot attached");
await page.check('input[name="is_sensitive"]');
await page.selectOption("#ticket_category_id", { index: 1 });
await page.fill("#description", "The console shows the error in the attached screenshot. This ticket was raised by an automated probe and can be deleted.");
await Promise.all([
  // The reference's shape, whatever the install's prefix (References::PATTERN).
  page.waitForURL(/\/portal\/tickets\/[A-Z][A-Z0-9]{1,5}-\d{4}-\d{5}$/, { timeout: 180_000 }),
  // The form's own button: the portal chrome has a sign-out submit too.
  page.click('form:has(#description) button[type="submit"]'),
]);
const reference = page.url().match(/[A-Z][A-Z0-9]{1,5}-\d{4}-\d{5}/)?.[0] ?? "";
await page.waitForLoadState("load");
// A picture attachment is drawn as a thumbnail with the name as its alt and
// as a link, so the thread's words and its images are both read.
const thread = async () => (await page.locator("main").innerText()) + " " + (await page.locator("main img").evaluateAll((els) => els.map((e) => e.getAttribute("alt")).join(" ")));
check("the ticket was created with the pasted screenshot attached", reference !== "" && /pasted-\d{8}-\d{6}\.png/.test(await thread()), reference);
check("the original request carries the Encrypted badge", (await page.locator("li", { hasText: "Original request" }).locator("text=Encrypted").count()) === 1);

// 4. A sensitive reply with a pasted screenshot.
await hydrated();
await page.evaluate(PASTE_PNG, { selector: "#body", kind: "image" });
await page.locator('ul[aria-label="Files to send"] > li').first().waitFor({ timeout: 10_000 });
await page.fill("#body", "The admin password for the console is in this screenshot; rotate it after use.");
await page.check('input[name="is_sensitive"]');
await page.click('form:has(#body) button[type="submit"]');
await page.waitForFunction(() => /Reply sent/.test(document.body.innerText), null, { timeout: 180_000 });
// The thread refreshes itself after the send; wait for the reply to be in it.
await page.waitForFunction(() => /rotate it after use/.test(document.querySelector("#thread")?.textContent ?? ""), null, { timeout: 60_000 });
const after = await thread();
check("the sensitive reply is on screen in clear", /rotate it after use/.test(after));
check("the reply carries the Encrypted badge", (await page.locator("li", { hasText: "rotate it after use" }).locator("text=Encrypted").count()) >= 1);
check("the reply's pasted screenshot is listed", (after.match(/pasted-\d{8}-\d{6}\.png/g) ?? []).length >= 2, String((after.match(/pasted-\d{8}-\d{6}\.png/g) ?? []).length));
check("the reply form's rows are gone after the send", (await page.locator('form ul[aria-label="Files to send"] > li').count()) === 0);

check("no console errors", errors.length === 0, errors.join(" | ").slice(0, 300));
console.log(`ticket ${reference}`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
