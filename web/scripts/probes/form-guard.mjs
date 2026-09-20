import { chromium } from "playwright";

/**
 * Measures `FormActions`' two keyboard-and-navigation rules
 * (`components/admin/form-actions.tsx`).
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/form-guard.mjs
 *
 * On the new-redirect form: (1) with nothing typed, a sidebar link navigates
 * with no question; (2) after typing into a field, the same link asks, and
 * answering no keeps the page and the typed value; (3) Ctrl+S submits the
 * form — measured by the request the browser sends; the form is blank but
 * for one path, so the API refuses it and nothing is created; (4) answering
 * yes navigates, discarding the typed value.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const { signInAsStaff } = await import("../shared.mjs");
await signInAsStaff(page);
await page.goto(`${BASE}/admin/redirects/new`, { waitUntil: "load", timeout: 120000 });

let dialogs = 0;
let answer = false;
page.on("dialog", async (d) => { dialogs++; if (answer) await d.accept(); else await d.dismiss(); });

const link = page.locator('nav a[href="/admin"]').first();
await link.click();
await page.waitForURL((u) => u.pathname === "/admin", { timeout: 30000 }).then(() => ok(dialogs === 0, "clean form: sidebar link navigates, no question"), () => ok(false, "clean form: link did not navigate"));

await page.goto(`${BASE}/admin/redirects/new`, { waitUntil: "load", timeout: 120000 });
const field = page.locator("form input#from_path");
const original = await field.inputValue();
await field.fill(original + "/probe-x");
await page.locator('nav a[href="/admin"]').first().click();
await page.waitForTimeout(800);
ok(dialogs === 1, "dirty form: the link asks");
ok(page.url().includes("/admin/redirects/new"), "no: the page stays");
ok((await field.inputValue()) === original + "/probe-x", "no: the typed value stays");

// Ctrl+S submits: count the POST the form sends.
let posted = 0;
page.on("request", (r) => { if (r.method() === "POST" && r.url().includes("/admin/redirects/new")) posted++; });
await page.keyboard.press("Control+s");
await page.waitForTimeout(2500);
ok(posted >= 1, "Ctrl+S submits the form (refused by the API: nothing created)");
ok(page.url().includes("/admin/redirects/new"), "and the refused form is still here");

await field.fill(original + "/probe-x");
answer = true;
await page.locator('nav a[href="/admin"]').first().click();
await page.waitForURL((u) => u.pathname === "/admin", { timeout: 30000 }).then(() => ok(dialogs === 2, "yes: the link navigates"), () => ok(false, "yes: did not navigate"));

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
