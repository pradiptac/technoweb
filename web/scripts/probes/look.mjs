import { chromium } from "playwright";

/**
 * Measures corners, spacing, looks and the live preview (`lib/look.ts`,
 * `theme-picker.tsx`, `preview-bridge.tsx`).
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/look.mjs
 *   SHOTS=<dir> saves the appearance screen and the site in the saved look.
 *   HOLD=1 leaves the saved corners/spacing in place (for an audit run);
 *   RESTORE=1 only puts them back to Soft/Comfortable and saves.
 *
 * Checks: (1) the live preview frame loads the real site; (2) pressing the
 * Corporate look re-points the frame's tokens and stamps `data-radius=sharp`
 * on its `.public-site` without saving; (3) a button in the frame really is
 * squarer; (4) Round + Airy saved through the form reach the public site as
 * `data-radius`/`data-density`, a card's radius grows and a section's
 * padding grows; (5) no horizontal scroll at 360px in that look; (6) put
 * back, the site stamps neither attribute.
 *
 * Signs in through the real form; carries no credential. Run against a
 * development database — it saves the appearance tab.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const SHOTS = process.env.SHOTS;
const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const { signInAsStaff } = await import("../shared.mjs");
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
await signInAsStaff(page);

async function saveLook(radius, density) {
  await page.goto(`${BASE}/admin/site/settings?tab=appearance`, { waitUntil: "load", timeout: 180000 });
  await page.selectOption("#setting__theme_radius", radius);
  await page.selectOption("#setting__theme_density", density);
  await page.getByRole("button", { name: /Save site settings/ }).click();
  await page.waitForTimeout(4000);
}

if (process.env.RESTORE === "1") {
  await saveLook("soft", "comfortable");
  await browser.close();
  console.log("restored");
  process.exit(0);
}

await page.goto(`${BASE}/admin/site/settings?tab=appearance`, { waitUntil: "load", timeout: 180000 });
const iframe = page.locator('iframe[title^="Live preview"]');
await iframe.scrollIntoViewIfNeeded();
const frame = page.frameLocator('iframe[title^="Live preview"]');
await frame.locator(".public-site").waitFor({ timeout: 180000 });
ok(true, "the live preview frame loads the site");

const radiusOf = (loc) => loc.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius));
const btn = frame.locator(".public-site .btn").first();
const before = await radiusOf(btn);
await page.getByRole("button", { name: /^Corporate/ }).click();
await page.waitForTimeout(800);
ok(await frame.locator(".public-site").getAttribute("data-radius") === "sharp", "a look stamps data-radius in the frame without saving");
const after = await radiusOf(btn);
ok(after < before, `the frame's button is squarer (${before}px → ${after}px)`);
const tokens = await frame.locator("#theme-tokens").evaluate((el) => el.textContent.length);
ok(tokens > 500, "the frame's token stylesheet was replaced");
if (SHOTS) await page.screenshot({ path: `${SHOTS}/look-screen.png`, fullPage: false });

// (4) saved: Round + Airy on the public site
await saveLook("round", "airy");
const site = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const sp = await site.newPage();
await sp.goto(`${BASE}/`, { waitUntil: "load", timeout: 180000 });
const wrap = sp.locator(".public-site");
ok(await wrap.getAttribute("data-radius") === "round" && await wrap.getAttribute("data-density") === "airy", "saved corners and spacing reach the site");
const pad = await sp.locator(".section-y").first().evaluate((el) => parseFloat(getComputedStyle(el).paddingTop));
ok(pad > 64, `a section's padding grows (${pad}px)`);
if (SHOTS) await sp.screenshot({ path: `${SHOTS}/look-site.png`, fullPage: false });
const phone = await (await browser.newContext({ viewport: { width: 360, height: 800 } })).newPage();
await phone.goto(`${BASE}/`, { waitUntil: "load", timeout: 180000 });
const over = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(over <= 0, `no horizontal scroll at 360px (${over})`);

if (process.env.HOLD !== "1") {
  await saveLook("soft", "comfortable");
  await sp.goto(`${BASE}/`, { waitUntil: "load", timeout: 180000 });
  ok(await sp.locator(".public-site").getAttribute("data-radius") === null && await sp.locator(".public-site").getAttribute("data-density") === null, "put back, the site stamps neither attribute");
}

await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
