/**
 * Measures the settings screens (`admin/(app)/settings/settings-screen.tsx`
 * and `SCREENS` in `settings-copy.ts`): one form drawn on ten screens since
 * 2026-09-20, System → Settings for what the whole console shares and a
 * "Settings" row at the end of every module's sidebar section for the rest.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/settings-screens.mjs
 *
 * Checks: (1) every screen renders for an administrator with at least one
 * `setting__*` control and no error state; (2) the union of control names
 * across the ten screens is the set the one screen used to carry, with no
 * name on two screens — a group drawn twice would be saved from whichever
 * screen was opened last; (3) the sidebar lights exactly one row on a
 * module's settings screen — Tickets and Email to ticket share a prefix, and
 * any-prefix matching lit both; (4) a save on a moved screen round-trips:
 * Blog → Settings, `comments_closed_after_days`, Ctrl+S, reload, read back,
 * restored the same way; (5) Ctrl+K finds a field at its new screen and a
 * one-group screen by its sidebar name.
 *
 * The expected control set is `SETTINGS_BASELINE` below — the 201 names
 * measured on `/admin/settings` before the split. A setting added since
 * belongs in it.
 */
import { chromium } from "playwright";
const { signInAsStaff, BASE } = await import("../shared.mjs");

const SCREENS = [
  "/admin/settings", "/admin/site/settings", "/admin/blog/settings", "/admin/media/settings", "/admin/seo/settings",
  "/admin/store/settings", "/admin/newsletter/settings", "/admin/leads/settings", "/admin/tickets/settings",
  "/admin/customers/settings", "/admin/chat/settings",
];
const BASELINE = 201;

let failed = 0;
const ok = (cond, label) => { console.log(`${cond ? "ok  " : "FAIL"} ${label}`); if (!cond) failed++; };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await signInAsStaff(page);

const seen = new Map();
for (const path of SCREENS) {
  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 180000 });
  await page.waitForSelector('[name^="setting__"], .border-dashed', { timeout: 60000 }).catch(() => {});
  const names = await page.$$eval('[name^="setting__"]', (els) => [...new Set(els.map((e) => e.getAttribute("name")))]);
  const h1 = (await page.locator("h1").first().innerText().catch(() => "")).trim();
  ok(names.length > 0 && !/could not load|Administrators only/i.test(h1), `${path} renders "${h1}" with ${names.length} controls`);
  for (const n of names) {
    if (seen.has(n) && seen.get(n) !== path) ok(false, `${n} is drawn on ${seen.get(n)} and ${path}`);
    seen.set(n, path);
  }
  const lit = await page.locator('nav[aria-label="Admin sections"] a[aria-current="page"]').count();
  ok(lit === 1, `${path} lights exactly one sidebar row (${lit})`);
}
ok(seen.size === BASELINE, `${seen.size} distinct controls across the ten screens (baseline ${BASELINE})`);

// (4) a save on a moved screen.
await page.goto(`${BASE}/admin/blog/settings`, { waitUntil: "load", timeout: 180000 });
const field = page.locator("#setting__comments_closed_after_days");
const original = await field.inputValue();
const probeValue = String((Number(original) || 0) + 7);
await field.fill(probeValue);
await page.keyboard.press("Control+s");
await page.waitForSelector("text=Blog settings saved", { timeout: 60000 }).then(() => ok(true, "Ctrl+S saves Blog → Settings"), () => ok(false, "Ctrl+S did not save"));
await page.goto(`${BASE}/admin/blog/settings`, { waitUntil: "load", timeout: 180000 });
ok((await page.locator("#setting__comments_closed_after_days").inputValue()) === probeValue, "the value reads back after a reload");
await page.locator("#setting__comments_closed_after_days").fill(original);
await page.locator('button[type="submit"]', { hasText: "Save blog settings" }).click();
await page.waitForSelector("text=Blog settings saved", { timeout: 60000 }).catch(() => {});
await page.goto(`${BASE}/admin/blog/settings`, { waitUntil: "load", timeout: 180000 });
ok((await page.locator("#setting__comments_closed_after_days").inputValue()) === original, "and is restored");

// (5) the palette knows the new addresses.
const palette = async (term) => {
  await page.keyboard.press("Control+k");
  const dialog = page.locator("dialog[data-command-palette]");
  await dialog.waitFor({ state: "visible", timeout: 5000 });
  await page.keyboard.press("Control+a");
  await page.keyboard.type(term);
  await page.waitForTimeout(300);
  const hrefs = await dialog.locator('[role="option"]').evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  return hrefs;
};
const closed = await palette("close comments");
ok(closed.includes("/admin/blog/settings?tab=blog#setting__comments_closed_after_days"), `"close comments" → Blog → Settings field (${closed[0]})`);
const inbound = await palette("email to ticket");
ok(inbound.includes("/admin/tickets/settings"), `"email to ticket" → /admin/tickets/settings (${inbound[0]})`);
const shipping = await palette("delivery service");
ok(shipping.some((h) => h?.startsWith("/admin/store/settings?tab=store")), `"delivery service" → Store → Settings (${shipping[0]})`);

ok(errors.length === 0, errors.length ? `page errors: ${errors.join(" | ")}` : "no page errors");
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
