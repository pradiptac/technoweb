import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { MANIFESTS } from "../src/themes/manifests.ts";
import { BASE, signInAsStaff } from "./shared.mjs";

/**
 * Writes each theme's gallery screenshot — `npm run theme-shots`.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… npm run theme-shots
 *
 * Signs in as staff (the preview route is admin-only), opens
 * `/theme-preview/<id>` for every manifest at 1280×800 and writes the
 * viewport to `public/themes/<id>.png`, which the Themes screen draws at
 * 640×400. Generated rather than uploaded, the way `warm-images` and the
 * audits drive the site: a screenshot somebody took by hand goes stale the
 * first time the homepage's content changes, and nothing would say so.
 * Run it after a theme changes, and commit the files — they are the
 * gallery's pictures on a fresh clone.
 */
mkdirSync("public/themes", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
// The splash and any popup would sit over the shot.
await page.addInitScript(() => { try { sessionStorage.setItem("tw_splash", "1"); } catch {} });
await page.addInitScript(() => {
  new MutationObserver(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()))
    .observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ["open"] });
});
await signInAsStaff(page);

for (const m of MANIFESTS) {
  await page.goto(`${BASE}/theme-preview/${m.id}`, { waitUntil: "networkidle", timeout: 120000 });
  // Hide the preview strip so the shot is the theme alone.
  await page.evaluate(() => document.querySelector(".public-site > div:first-child")?.remove());
  await page.waitForTimeout(500);
  const file = `public${m.screenshot}`;
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1280, height: 800 } });
  console.log(`ok   ${m.id} → ${file}`);
}
await browser.close();
