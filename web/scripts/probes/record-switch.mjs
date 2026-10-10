import { chromium } from "playwright";

/**
 * Booleans on record forms as sliding switches (0.152.0, docs/admin-console.md
 * "Switches on record forms").
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/record-switch.mjs
 *
 * Sign in as a **throwaway administrator**. It creates one redirect
 * (/probe-switch-<stamp>), switches it off and on, and deletes it; if it
 * stops half way, that redirect is the row to remove.
 *
 * What it checks:
 *   - on a handful of record forms (a brand, a solution, a store product, a
 *     redirect, a webhook, a client, a coupon): every boolean the form
 *     declares is a `role="switch"` checkbox carrying `value="1"` with a
 *     hidden `0` of the same name after it, and no `<select>` whose choices
 *     are exactly Yes/No (0/1) is left;
 *   - the posted answer: a new redirect saved with Active switched off and
 *     one saved with it on come back off and on after the save and after a
 *     reload;
 *   - a refused save (a destination that is not a path or an http(s) URL)
 *     puts the switch back as it was typed, not as it started;
 *   - the switch shows a focus ring from the keyboard and Space toggles it;
 *   - nothing logged.
 */
process.env.BASE = process.env.BASE ?? "http://localhost:3000";
const { BASE, signInAsStaff } = await import("../shared.mjs");

const T = 180000;
const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const problems = [];
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()} at ${page.url().replace(BASE, "")}: ${m.text().slice(0, 400)}`); });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`));
page.on("dialog", (d) => d.accept());

const go = async (path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: T });
  await page.waitForSelector("h1", { timeout: T });
  await page.waitForTimeout(1200);
};

await signInAsStaff(page);

// ---- the scan ------------------------------------------------------------
const FORMS = {
  "/admin/brands/new": ["is_featured"],
  "/admin/solutions/new": ["show_in_menu"],
  "/admin/store/products/new": ["is_featured", "track_stock", "returnable", "feed_include"],
  "/admin/redirects/new": ["is_active"],
  "/admin/webhooks/new": ["is_active"],
  "/admin/clients/new": ["is_featured"],
  "/admin/store/coupons/new": ["is_active"],
};
for (const [path, names] of Object.entries(FORMS)) {
  await go(path);
  for (const name of names) {
    const box = page.locator(`form input[type=checkbox][role=switch][name="${name}"]`);
    ok(await box.count() === 1, `${path}: ${name} is a switch`);
    ok(await box.getAttribute("value") === "1", `${path}: ${name} posts 1 when on`);
    const off = page.locator(`form input[type=hidden][name="${name}"][value="0"]`);
    ok(await off.count() === 1, `${path}: ${name} has its hidden 0`);
  }
  const yesNo = await page.evaluate(() => [...document.querySelectorAll("form select")]
    .filter((s) => { const v = [...s.options].map((o) => o.value).sort().join(","); return v === "0,1"; })
    .map((s) => s.name || s.id));
  ok(yesNo.length === 0, `${path}: no Yes/No select left${yesNo.length ? ` (${yesNo.join(", ")})` : ""}`);
}

// ---- a refused save keeps what was typed -----------------------------------
const from = `/probe-switch-${Date.now()}`;
await go("/admin/redirects/new");
const active = page.locator('input[type=checkbox][role=switch][name="is_active"]');
ok(await active.isChecked(), "a new redirect starts Active");
await page.fill("#from_path", from);
await page.fill("#to_path", "javascript:alert(1)");
await active.uncheck();
await page.locator('form:has(#to_path) button[type="submit"]').first().click(); // the form's own button, never the header's Sign out
await page.waitForSelector("text=/to_path|destination|path|URL/i", { timeout: T }).catch(() => {});
await page.waitForTimeout(1500);
ok(page.url().includes("/admin/redirects/new"), "the bad destination is refused");
ok(!(await active.isChecked()), "the refused save keeps Active switched off");

// ---- keyboard ---------------------------------------------------------------
await active.focus();
await page.keyboard.press("Space");
ok(await active.isChecked(), "Space switches it on");
const ring = await page.evaluate(() => {
  const t = document.querySelector('input[role=switch][name="is_active"]')?.nextElementSibling;
  return t ? getComputedStyle(t).outlineStyle : "none";
});
ok(ring !== "none", "the track shows a focus ring from the keyboard");
await page.keyboard.press("Space");
ok(!(await active.isChecked()), "Space switches it off again");

// ---- the round trip -----------------------------------------------------------
await page.fill("#to_path", "/probe-switch-target");
await page.locator('form:has(#to_path) button[type="submit"]').first().click(); // the form's own button, never the header's Sign out
await page.waitForURL(/\/admin\/redirects\/\d+/, { timeout: T });
await page.waitForTimeout(1200);
const edit = page.url().replace(BASE, "").replace(/\?.*$/, "");
const box = () => page.locator('input[type=checkbox][role=switch][name="is_active"]');
ok(!(await box().isChecked()), "saved off: still off after the save");
await go(edit);
ok(!(await box().isChecked()), "saved off: still off after a reload");

await box().check();
await page.locator('form:has(#to_path) button[type="submit"]').first().click(); // the form's own button, never the header's Sign out
await page.waitForTimeout(2500);
ok(await box().isChecked(), "saved on: still on after React's form reset");
await go(edit);
ok(await box().isChecked(), "saved on: still on after a reload");

// ---- clean up ------------------------------------------------------------------
await page.getByRole("button", { name: "Delete redirect" }).click();
await page.waitForURL(/\/admin\/redirects(\?|$)/, { timeout: T });
ok(true, "the throwaway redirect is deleted");

ok(problems.length === 0, `nothing logged${problems.length ? `: ${problems.join(" | ")}` : ""}`);
await browser.close();
process.exit(failed ? 1 : 0);
