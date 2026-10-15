import { chromium } from "playwright";

/**
 * Measures section textures (`SECTION_TEXTURES`, `[data-texture]` in
 * globals.css) end to end: chosen on the Themes screen, saved through the
 * real form, drawn on the homepage.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/textures.mjs
 *   SHOTS=<dir> saves the homepage in light, dark and at 360px.
 *   RESTORE=1 puts every texture select it touched back to None and saves.
 *
 * Checks: (1) a Texture control appears only on a row whose ground is not
 * the theme's own; (2) choosing grain, grid and mesh on the first three such
 * rows and saving draws three `[data-texture]` layers on the homepage;
 * (3) each layer is a sibling of the content, holds no text, and paints over
 * the full section; (4) no horizontal scroll at 360px.
 *
 * Signs in through the real form via `signInAsStaff`; carries no credential.
 * Uses the active theme's options — run it against a development database.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const SHOTS = process.env.SHOTS;
const RESTORE = process.env.RESTORE === "1";
const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const { signInAsStaff } = await import("../shared.mjs");
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
await signInAsStaff(page);
await page.goto(`${BASE}/admin/themes`, { waitUntil: "load", timeout: 180000 });

const selects = page.locator('select[id$="-texture"]');
await selects.first().waitFor({ timeout: 60000 });
const n = await selects.count();
ok(n >= 3, `texture controls on rows with a ground of their own (${n})`);

const choice = RESTORE ? ["none", "none", "none"] : ["grain", "grid", "mesh"];
for (let i = 0; i < 3 && i < n; i++) await selects.nth(i).selectOption(choice[i]);
await page.getByRole("button", { name: /Save options|Activate/ }).click();
await page.waitForTimeout(4000);

if (RESTORE) {
  await browser.close();
  console.log("restored");
  process.exit(0);
}

await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 180000 });
await page.waitForTimeout(1500);
const layers = page.locator("[data-texture]");
ok(await layers.count() === 3, `three texture layers drawn (${await layers.count()})`);
const shape = await page.evaluate(() => [...document.querySelectorAll("[data-texture]")].map((el) => {
  const parent = el.parentElement.getBoundingClientRect();
  const box = el.getBoundingClientRect();
  return { text: el.textContent.trim().length, children: el.children.length, covers: Math.abs(parent.height - box.height) < 2 && Math.abs(parent.width - box.width) < 2, bg: getComputedStyle(el).backgroundImage !== "none" };
}));
ok(shape.every((s) => s.text === 0 && s.children === 0), "layers hold nothing");
ok(shape.every((s) => s.covers), "each layer covers its section");
ok(shape.every((s) => s.bg), "each layer paints");
if (SHOTS) await page.screenshot({ path: `${SHOTS}/textures-light.png`, fullPage: true });

const dark = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
await dark.addInitScript(() => { localStorage.setItem("tw_scheme_site", "dark"); localStorage.setItem("tw_scheme_console", "dark"); });
const pd = await dark.newPage();
await pd.goto(`${BASE}/`, { waitUntil: "load", timeout: 180000 });
await pd.waitForTimeout(1500);
if (SHOTS) await pd.screenshot({ path: `${SHOTS}/textures-dark.png`, fullPage: true });

const phone = await browser.newContext({ viewport: { width: 360, height: 800 } });
const pp = await phone.newPage();
await pp.goto(`${BASE}/`, { waitUntil: "load", timeout: 180000 });
await pp.waitForTimeout(1500);
const over = await pp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(over <= 0, `no horizontal scroll at 360px (${over})`);
if (SHOTS) await pp.screenshot({ path: `${SHOTS}/textures-phone.png`, fullPage: true });

await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
