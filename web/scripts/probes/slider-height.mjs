import { chromium } from "playwright";
import { readFileSync } from "node:fs";

/**
 * A slider is never taller than the screen below the header, in any theme.
 *
 * Opens `/theme-preview/<id>` for every theme in `src/themes/manifests.ts` at
 * 360x640, 390x844, 1280x720, 1366x650 and 1920x1080 and, for the hero slider
 * (the first `.slider-frame` carousel in the page — every theme's home opens on
 * it), fails when
 *
 *  1. its rendered height is more than `innerHeight` minus the site header's
 *     measured height minus the announcement bar's measured height (0 when it is
 *     absent or hidden), with 1px of tolerance — the cap every slider carries; or
 *  2. `documentElement.scrollWidth` is wider than `innerWidth`; or
 *  3. no slider is found at all (at any size).
 *
 * What it does *not* ask is that the slider end inside the first screen. A hero
 * sits under a header, a heading and the section's padding — and, stacked on a
 * phone, under its copy — so its bottom may be below the fold by design. The
 * guarantee is that the slider itself is never taller than the screen; nothing
 * about where it starts. Each row prints top, bottom, height and the cap. Atelier's
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

await page.goto(`${BASE}/admin/login`, { waitUntil: "load", timeout: 300000 });
const toPassword = page.locator('button:has-text("Use your password instead")');
if (await toPassword.count()) {
  await toPassword.first().click();
  await page.waitForSelector("#password", { timeout: 15000 });
}
await page.fill("#email", email);
await page.fill("#password", password);
await Promise.all([
  page.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 300000 }),
  page.click('button[type="submit"]'),
]);

let failures = 0;
let seen = 0;
for (const theme of THEMES) {
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    // A dev server compiling a theme's first render can stall one navigation; one retry, not a pass for a slider that is not there.
    for (let attempt = 0; ; attempt++) {
      try { await page.goto(`${BASE}/theme-preview/${theme}`, { waitUntil: "load", timeout: 90000 }); break; }
      catch (e) { if (attempt) throw e; }
    }
    await page.waitForLoadState("networkidle").catch(() => {});
    const r = await page.evaluate(() => {
      window.scrollTo(0, 0);
      const shown = (e) => (e && getComputedStyle(e).display !== "none" ? e.getBoundingClientRect().height : 0);
      const el = document.querySelector('.slider-frame[aria-roledescription="carousel"]');
      const box = el?.getBoundingClientRect();
      return {
        found: Boolean(el),
        top: box ? Math.round(box.top) : 0,
        bottom: box ? Math.round(box.bottom) : 0,
        height: box ? Math.round(box.height) : 0,
        header: Math.round(shown(document.querySelector("header"))),
        infoBar: Math.round(shown(document.querySelector(".announcement-bar"))),
        label: el?.getAttribute("aria-label") ?? "",
        attrs: el ? [...el.attributes].filter((a) => a.name.startsWith("data-h")).map((a) => `${a.name}=${a.value}`).join(" ") : "",
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
      };
    });
    const problems = [];
    let cap = 0;
    if (!r.found) problems.push("no hero slider found (is `homepage-hero` published?)");
    else {
      seen++;
      cap = r.innerHeight - r.header - r.infoBar;
      if (r.height > cap + 1) problems.push(`slider is ${r.height}px tall, over the cap of ${cap}px (${r.innerHeight} - header ${r.header} - info bar ${r.infoBar})`);
    }
    if (r.scrollWidth > r.innerWidth) problems.push(`page scrolls sideways (${r.scrollWidth} > ${r.innerWidth})`);
    if (problems.length) { failures++; console.log(`FAIL ${theme} ${w}x${h}: ${problems.join("; ")}`); }
    else console.log(`ok   ${theme} ${w}x${h}: top ${r.top} bottom ${r.bottom} (${r.height}px, cap ${cap}px) "${r.label}" ${r.attrs}`);
  }
}

await browser.close();
if (!seen) { console.error("No slider was found on any theme — is `homepage-hero` published?"); process.exit(1); }
console.log(failures ? `\n${failures} failure(s).` : "\nEvery slider fits its screen.");
process.exit(failures ? 1 : 0);
