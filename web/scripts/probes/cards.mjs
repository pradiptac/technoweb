import { chromium } from "playwright";

/**
 * Measures card surfaces (`theme_surface`) and card motion (`motion_cards`)
 * end to end, through the real Site settings form.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/cards.mjs
 *   HOLD=1 leaves Elevated + Tilt saved (for an audit run); RESTORE=1 only
 *   puts Flat + Lift back. SHOTS=<dir> saves a hovered card.
 *
 * Checks: (1) Elevated reaches the site as `data-surface` and gives a card a
 * shadow; (2) with Tilt, a card under a mouse gets `data-tilting` and a
 * non-identity transform, and loses both when the pointer leaves; (3) under
 * reduced motion nothing tilts; (4) on a touch-sized screen there is no
 * horizontal scroll; (5) put back, neither attribute nor transform remains.
 * Carries no credential; saves the appearance and motion tabs — a
 * development database only.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const SHOTS = process.env.SHOTS;
const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const { signInAsStaff } = await import("../shared.mjs");
const admin = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
await signInAsStaff(admin);

async function save(surface, cards) {
  await admin.goto(`${BASE}/admin/site/settings?tab=appearance`, { waitUntil: "load", timeout: 180000 });
  await admin.selectOption("#setting__theme_surface", surface);
  // The Motion tab's tiles are labels around sr-only radios, all in the one
  // form; the tab has to be open for a press to land.
  await admin.getByRole("tab", { name: "Motion" }).click();
  const label = { lift: "Lift", tilt: "Tilt", float: "Float", still: "Still" }[cards];
  await admin.locator(`fieldset:has(legend:text-is("Cards")) label:has(input[value="${cards}"])`).click();
  void label;
  await admin.getByRole("button", { name: /Save site settings/ }).click();
  await admin.waitForTimeout(4000);
}

if (process.env.RESTORE === "1") {
  await save("flat", "lift");
  await browser.close();
  console.log("restored");
  process.exit(0);
}

await save("elevated", "tilt");

const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 180000 });
ok(await page.locator(".public-site").getAttribute("data-surface") === "elevated", "Elevated reaches the site");
ok(await page.locator(".public-site").getAttribute("data-motion-cards") === "tilt", "Tilt reaches the site");
const tile = page.locator(".public-site [data-tile]").first();
await tile.scrollIntoViewIfNeeded();
// Hydrated before the pointer moves: the tilt listener is attached on mount.
await page.waitForTimeout(3000);
ok((await tile.evaluate((el) => getComputedStyle(el).boxShadow)) !== "none", "a card has a shadow");
const box = await tile.boundingBox();
await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.2);
await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.15, { steps: 4 });
await page.waitForTimeout(300);
ok(await tile.getAttribute("data-tilting") !== null, "a card under the mouse tilts");
const t = await tile.evaluate((el) => getComputedStyle(el).transform);
ok(t !== "none" && t !== "matrix(1, 0, 0, 1, 0, 0)", `its transform is not the identity (${t.slice(0, 30)}…)`);
if (SHOTS) await page.screenshot({ path: `${SHOTS}/cards-tilt.png`, clip: { x: Math.max(0, box.x - 40), y: Math.max(0, box.y - 40), width: Math.min(900, box.width * 3), height: box.height + 80 } });
await page.mouse.move(5, 5);
await page.waitForTimeout(400);
ok(await tile.getAttribute("data-tilting") === null, "it settles when the pointer leaves");

const calm = await (await browser.newContext({ viewport: { width: 1400, height: 1000 }, reducedMotion: "reduce" })).newPage();
await calm.goto(`${BASE}/`, { waitUntil: "load", timeout: 180000 });
const ct = calm.locator(".public-site [data-tile]").first();
await ct.scrollIntoViewIfNeeded();
const cb = await ct.boundingBox();
await calm.mouse.move(cb.x + cb.width * 0.8, cb.y + 10, { steps: 4 });
await calm.waitForTimeout(300);
ok(await ct.getAttribute("data-tilting") === null, "nothing tilts under reduced motion");

const phone = await (await browser.newContext({ viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true })).newPage();
await phone.goto(`${BASE}/`, { waitUntil: "load", timeout: 180000 });
const over = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(over <= 0, `no horizontal scroll on a phone (${over})`);

if (process.env.HOLD !== "1") {
  await save("flat", "lift");
  await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 180000 });
  ok(await page.locator(".public-site").getAttribute("data-surface") === null, "put back, no surface attribute");
  ok(await page.locator(".public-site").getAttribute("data-motion-cards") === "lift", "put back, cards lift");
}

await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
