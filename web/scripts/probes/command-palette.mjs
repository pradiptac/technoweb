import { chromium } from "playwright";

/**
 * Measures the console's command palette (`admin/(app)/command-palette.tsx`).
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/command-palette.mjs
 *
 * Checks: (1) Ctrl+K opens the dialog with focus in its input; (2) "tick"
 * lists the Tickets screen from the pages before any fetch; (3) a customer's
 * name lists a record under a group heading, from `/api/admin/search`; (4)
 * ArrowDown moves `aria-activedescendant` and Enter navigates there;
 * (5) Escape closes it and the dialog can be opened again — the native
 * dialog bug `Modal` documents.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const { signInAsStaff } = await import("../shared.mjs");
await signInAsStaff(page);
await page.goto(`${BASE}/admin`, { waitUntil: "load", timeout: 120000 });

await page.keyboard.press("Control+k");
const dialog = page.locator("dialog[data-command-palette]");
await dialog.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
ok(await dialog.evaluate((d) => d.open), "Ctrl+K opens the palette");
ok(await page.evaluate(() => document.activeElement?.getAttribute("role") === "combobox"), "focus lands in the input");

await page.keyboard.type("tick");
const tickets = dialog.locator('[role="option"]', { hasText: "Tickets" }).first();
await tickets.waitFor({ timeout: 5000 }).catch(() => {});
ok((await tickets.count()) === 1, '"tick" lists the Tickets screen');

await page.keyboard.press("Control+a");
await page.keyboard.type("neil");
const heading = dialog.locator("p", { hasText: "Customers" });
await heading.waitFor({ timeout: 10000 }).catch(() => {});
ok((await heading.count()) >= 1, '"neil" lists a record under Customers');

const before = await page.locator('[role="combobox"]').getAttribute("aria-activedescendant");
await page.keyboard.press("ArrowDown");
const after = await page.locator('[role="combobox"]').getAttribute("aria-activedescendant");
ok(before !== after && after, "ArrowDown moves the active descendant");
const target = await page.evaluate((id) => document.getElementById(id)?.getAttribute("href"), after);
await page.keyboard.press("Enter");
await page.waitForURL((u) => u.pathname + u.search === target, { timeout: 30000 })
  .then(() => ok(true, `Enter navigates to ${target}`), () => ok(false, `Enter did not navigate to ${target}`));
// Let the navigation settle before the shortcut is pressed again.
await page.waitForTimeout(800);

await page.keyboard.press("Control+k");
await page.waitForFunction(() => document.querySelector("dialog[data-command-palette]")?.open, null, { timeout: 5000 }).catch(() => {});
await page.keyboard.press("Escape");
await page.waitForFunction(() => !document.querySelector("dialog[data-command-palette]")?.open, null, { timeout: 5000 }).catch(() => {});
ok(!(await dialog.evaluate((d) => d.open)), "Escape closes it");
await page.keyboard.press("Control+k");
await page.waitForFunction(() => document.querySelector("dialog[data-command-palette]")?.open, null, { timeout: 5000 }).catch(() => {});
ok(await dialog.evaluate((d) => d.open), "and it opens again afterwards");

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
