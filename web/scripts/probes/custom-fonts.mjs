import { chromium } from "playwright";
import path from "node:path";

/**
 * Measures a company's own font end to end (0.125.0, docs/theming.md),
 * through the real appearance tab.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/custom-fonts.mjs
 *   RESTORE=1 only empties slot 1 and puts the headline font back.
 *
 * The font uploaded is one of the repository's own vendored WOFF2 files, as
 * a variable font named "Probe Sans". Checks: (1) the upload reports its
 * outcome in a notice that stays, and the font joins the Headline list; (2)
 * chosen and saved, the public homepage declares the face, its heading's
 * computed family begins with it (read under the classic theme, through
 * the theme preview), the browser reports the face as loaded,
 * and the file answers from this site's own origin as `font/woff2`, cached
 * for a year, with a preload hint; (3) the page logs no error or warning;
 * (4) removed, the declaration is gone and the heading is back in the font
 * it had. Carries no credential; changes the appearance tab on a development
 * database and puts it back.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const FILE = path.resolve("src/fonts/sora-latin-wght-normal.woff2");
const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const { signInAsStaff } = await import("../shared.mjs");
const admin = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
await signInAsStaff(admin);

const SLOT = '[data-custom-font-slot="1"]';
async function open() {
  await admin.goto(`${BASE}/admin/site/settings?tab=appearance`, { waitUntil: "load", timeout: 180000 });
  await admin.waitForSelector("[data-custom-fonts]", { state: "visible", timeout: 60000 });
  // Let the tab hydrate: a tick made before it is put back by React.
  await admin.waitForTimeout(2500);
  // The panel is folded until a font exists.
  if (!(await admin.locator(SLOT).isVisible())) await admin.locator("[data-custom-fonts] > summary").click();
  await admin.waitForSelector(SLOT, { state: "visible", timeout: 30000 });
}
async function save() {
  await admin.getByRole("button", { name: /Save site settings/ }).click();
  await admin.waitForTimeout(5000);
}
async function remove(original) {
  await open();
  const button = admin.locator(SLOT).getByRole("button", { name: "Remove" });
  if (await button.count()) {
    await button.click();
    await admin.locator(SLOT).getByText("The font was removed.").waitFor({ timeout: 60000 }).catch(() => {});
  }
  if (original) {
    await open();
    await admin.selectOption("#setting__theme_font_display", original);
    await save();
  }
}

async function visitor() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const log = [];
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) log.push(m.text().slice(0, 160)); });
  const files = [];
  page.on("response", (r) => { if (new URL(r.url()).pathname.startsWith("/font/")) files.push({ status: r.status(), type: r.headers()["content-type"], cache: r.headers()["cache-control"], origin: new URL(r.url()).origin }); });
  await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 180000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2000);
  const read = await page.evaluate(() => ({
    declared: document.querySelector("style#custom-fonts")?.textContent ?? "",
    preload: document.querySelectorAll('link[rel="preload"][as="font"][href^="/font/"]').length,
  }));
  await context.close();
  return { ...read, files, log, origin: new URL(BASE).origin };
}

/**
 * A heading's font under the classic theme, through the staff-only theme
 * preview. Not read off the live homepage: several themes set their
 * headings in a face of their own, and which theme a development site is on
 * is whatever somebody last chose.
 */
async function heading() {
  const page = await admin.context().newPage();
  await page.goto(`${BASE}/theme-preview/classic`, { waitUntil: "load", timeout: 180000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2000);
  const read = await page.evaluate(() => {
    const h = document.querySelector(".public-site h1");
    return {
      family: h ? getComputedStyle(h).fontFamily : "",
      loaded: [...document.fonts].some((f) => f.family.replace(/"/g, "") === "tw-custom-1" && f.status === "loaded"),
    };
  });
  await page.close();
  return read;
}

if (process.env.RESTORE === "1") {
  await remove("instrument");
  await browser.close();
  console.log("restored");
  process.exit(0);
}

let original = "instrument";

try {
  const before = await heading();
  await open();
  original = await admin.locator("#setting__theme_font_display").inputValue();

  // 1. Upload.
  const slot = admin.locator(SLOT);
  await slot.locator("#custom-font-1-name").fill("Probe Sans");
  await slot.locator('input[type="checkbox"]').setChecked(true);
  await slot.locator("#custom-font-1-regular").setInputFiles(FILE);
  await slot.getByRole("button", { name: /Upload font|Update font/ }).click();
  const told = await slot.getByText(/is ready/).waitFor({ timeout: 90000 }).then(() => true, () => false);
  await admin.waitForTimeout(11000);
  ok(told && await slot.getByText(/is ready/).count() === 1, "the upload says the font is ready, and the notice is still there eleven seconds later");
  const offered = await admin.locator('#setting__theme_font_display option[value="custom-1"]').textContent().catch(() => null);
  ok(/Probe Sans/.test(offered ?? ""), `the font joins the Headline list (${offered})`);

  // 2. Choose it and save.
  await admin.selectOption("#setting__theme_font_display", "custom-1");
  await save();

  const seen = await visitor();
  ok(seen.declared.includes('font-family:"tw-custom-1"') && seen.declared.includes("font-weight:100 900"), "the homepage declares the face, as a variable font");
  ok(!seen.declared.includes("Probe Sans"), "under a name of the site's own — the typed name is not in the stylesheet");
  const set = await heading();
  ok(/^"?tw-custom-1/.test(set.family), `under the classic theme a heading's computed font begins with it (${set.family.slice(0, 60)})`);
  ok(set.loaded, "and the browser reports the face as loaded");
  const file = seen.files[0];
  ok(seen.files.length >= 1 && file.status === 200 && file.type === "font/woff2" && file.origin === seen.origin, `the file answers from this site's own origin as font/woff2 (${file?.status} ${file?.type})`);
  ok(/max-age=31536000/.test(file?.cache ?? "") && /immutable/.test(file?.cache ?? ""), `cached for a year (${file?.cache})`);
  ok(seen.preload === 1, `with one preload hint (${seen.preload})`);
  ok(seen.log.length === 0, `the page logs no error or warning (${seen.log.length}${seen.log[0] ? `: ${seen.log[0]}` : ""})`);

  // 4. Remove.
  await remove(original);
  const after = await visitor();
  ok(after.declared === "" && after.files.length === 0, "removed, nothing is declared and no font file is asked for");
  const back = await heading();
  ok(back.family === before.family, `and the heading is back in the font it had (${back.family.slice(0, 40)})`);
} catch (error) {
  console.log(`FAIL ${error.message.split("\n")[0]}`);
  failed++;
  await remove(original).catch(() => {});
}

await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
