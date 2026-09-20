import { chromium } from "playwright";

/**
 * Measures `AutoApplyForm` (`components/ui/auto-apply-form.tsx`): a filter
 * that applies itself when a select changes or a search box goes quiet,
 * without the Apply button being pressed.
 *
 *   node scripts/probes/auto-apply.mjs                       # public forms
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/auto-apply.mjs   # + one console list
 *
 * Checks, each measured on the URL the browser ends up at rather than on the
 * form's state: (1) picking a sort on /products/switches navigates to
 * `?sort=name` with no click on Apply; (2) typing in the catalogue search
 * navigates after the debounce and not before; (3) picking a sort on /store
 * navigates, and typing in the shop's search box does *not* (its listbox
 * owns that); (4) a console list's status select navigates.
 */
// 127.0.0.1, not localhost: `signInAsStaff` in shared.mjs signs in on that
// host, and localhost is a different cookie jar.
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const dismiss = async () => { await page.locator("dialog[open]").first().waitFor({ state: "visible", timeout: 3000 }).catch(() => {}); await page.keyboard.press("Escape").catch(() => {}); };

await page.goto(`${BASE}/products/switches`, { waitUntil: "load", timeout: 120000 }); await dismiss();
await page.selectOption("#cat-sort", "name");
await page.waitForURL((u) => u.searchParams.get("sort") === "name", { timeout: 30000 }).then(() => ok(true, "catalogue: sort applied on change, no Apply"), () => ok(false, "catalogue: sort did not apply"));

await page.fill("#cat-q", "CBS350");
await page.waitForTimeout(120);
ok(!page.url().includes("q=CBS350"), "catalogue: text is not applied before the debounce");
await page.waitForURL((u) => u.searchParams.get("q") === "CBS350", { timeout: 30000 }).then(() => ok(true, "catalogue: text applied after the debounce"), () => ok(false, "catalogue: text never applied"));
ok(!page.url().includes("page="), "catalogue: page is dropped");

await page.goto(`${BASE}/store`, { waitUntil: "load", timeout: 120000 }); await dismiss();
await page.selectOption("#sort", "name");
await page.waitForURL((u) => u.searchParams.get("sort") === "name", { timeout: 30000 }).then(() => ok(true, "shop: sort applied on change"), () => ok(false, "shop: sort did not apply"));
await page.fill("#q", "laptop");
await page.waitForTimeout(900);
ok(!page.url().includes("q=laptop"), "shop: typing does not navigate (the listbox owns the box)");

if (process.env.ADMIN_LOGIN_EMAIL) {
  const { signInAsStaff } = await import("../shared.mjs");
  await signInAsStaff(page);
  await page.goto(`${BASE}/admin/tickets`, { waitUntil: "load", timeout: 120000 });
  const status = page.locator(".admin-filters select").first();
  const value = await status.locator("option").nth(1).getAttribute("value");
  await status.selectOption(value);
  await page.waitForURL((u) => u.searchParams.get("status") === value, { timeout: 30000 }).then(() => ok(true, `console: status=${value} applied on change`), () => ok(false, "console: status did not apply"));
}

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
