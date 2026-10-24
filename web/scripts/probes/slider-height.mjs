import { chromium } from "playwright";
import { readFileSync } from "node:fs";

/**
 * A slider is never taller than the visible screen, in any theme.
 *
 * Opens `/theme-preview/<id>` for every theme in `src/themes/manifests.ts` at
 * 360x640, 390x844, 1280x720, 1366x650 and 1920x1080 and fails when the first
 * carousel on the page (the homepage hero) is taller than the viewport, or when
 * `documentElement.scrollWidth` is wider than `innerWidth`. Atelier's
 * `aspect-[4/5]` hero (~830px on a 1440x800 screen) and Launch's phone hero were
 * the cases this was written for. It reads whatever `homepage-hero` currently is
 * — so run it again after setting that slider's Height to Screen and to Fixed.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/slider-height.mjs
 *   BASE=http://localhost:3000   (default)
 *
 * The preview needs a staff session, so sign in with a throwaway content
 * manager and delete it afterwards. No credential is carried in this file.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const { ADMIN_LOGIN_EMAIL: email, ADMIN_LOGIN_PASSWORD: password } = process.env;
if (!email || !password) { console.error("Set ADMIN_LOGIN_EMAIL and ADMIN_LOGIN_PASSWORD."); process.exit(2); }

const manifests = readFileSync(new URL("../../src/themes/manifests.ts", import.meta.url), "utf8");
const THEMES = [...manifests.matchAll(/from "\.\/([a-z-]+)\/theme\.ts"/g)].map((m) => m[1]);
const SIZES = [[360, 640], [390, 844], [1280, 720], [1366, 650], [1920, 1080]];

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

await page.goto(`${BASE}/admin/login`, { waitUntil: "load", timeout: 120000 });
const toPassword = page.locator('button:has-text("Use your password instead")');
if (await toPassword.count()) {
  await toPassword.first().click();
  await page.waitForSelector("#password", { timeout: 15000 });
}
await page.fill("#email", email);
await page.fill("#password", password);
await Promise.all([
  page.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 120000 }),
  page.click('button[type="submit"]'),
]);

let failures = 0;
let seen = 0;
for (const theme of THEMES) {
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${BASE}/theme-preview/${theme}`, { waitUntil: "load", timeout: 120000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    const r = await page.evaluate(() => {
      const el = document.querySelector('[aria-roledescription="carousel"]');
      const box = el?.getBoundingClientRect();
      return {
        found: Boolean(el),
        height: box ? Math.round(box.height) : 0,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
      };
    });
    const problems = [];
    if (!r.found) { console.log(`-    ${theme} ${w}x${h}: no slider on the page`); }
    else {
      seen++;
      if (r.height > r.innerHeight) problems.push(`slider ${r.height}px > screen ${r.innerHeight}px`);
    }
    if (r.scrollWidth > r.innerWidth) problems.push(`page scrolls sideways (${r.scrollWidth} > ${r.innerWidth})`);
    if (problems.length) { failures++; console.log(`FAIL ${theme} ${w}x${h}: ${problems.join("; ")}`); }
    else if (r.found) console.log(`ok   ${theme} ${w}x${h}: ${r.height}px`);
  }
}

await browser.close();
if (!seen) { console.error("No slider was found on any theme — is `homepage-hero` published?"); process.exit(1); }
console.log(failures ? `\n${failures} failure(s).` : "\nEvery slider fits its screen.");
process.exit(failures ? 1 : 0);
