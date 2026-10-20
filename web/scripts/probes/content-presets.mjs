import { chromium } from "playwright";
import { signInAsStaff } from "../shared.mjs";

/**
 * Content-type presets (0.186.0, docs/content-presets.md), through the real
 * screens.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/content-presets.mjs
 *
 * In the console it checks Content → Content types draws the four preset
 * tiles. On the public site, for every preset installed at its default
 * address (a 404 is reported and skipped — installing is the console's
 * decision, never this probe's), it checks exactly one `h1`, the preset's
 * `data-preset` layout, no horizontal overflow at 360 or 1280, and nothing
 * logged. The newsroom's `/newsroom/feed.xml` must be RSS, and a feed asked
 * for under any other type must be a 404.
 *
 * It changes nothing. Carries no credential; the account is a throwaway one
 * the caller made.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const ARCHIVES = [
  ["/newsroom", "newsroom_releases"],
  ["/in-the-news", "newsroom_coverage"],
  ["/investors", "investors"],
  ["/testimonials", "testimonials"],
  ["/awards", "awards"],
];

const failures = [];
const fail = (msg) => { failures.push(msg); console.log(`FAIL  ${msg}`); };
const ok = (msg) => console.log(`ok    ${msg}`);
function check(passed, good, bad) {
  if (passed) ok(good);
  else fail(bad);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const logged = [];
page.on("console", (m) => { if (m.type() === "error") logged.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => logged.push(String(e).slice(0, 160)));

// The console's strip.
await signInAsStaff(page);
await page.goto(`${BASE}/admin/content-types`, { waitUntil: "load", timeout: 180000 });
const tiles = await page.locator('section[aria-labelledby="presets-heading"] li').count();
check(tiles === 4, `presets strip: 4 tiles`, `presets strip: ${tiles} tiles, expected 4`);

// The archives.
for (const [path, preset] of ARCHIVES) {
  const res = await fetch(BASE + path, { redirect: "manual" });
  if (res.status === 404) { console.log(`skip  ${path} — preset not installed`); continue; }

  for (const width of [1280, 360]) {
    logged.length = 0;
    await page.setViewportSize({ width, height: 900 });
    await page.goto(BASE + path, { waitUntil: "load", timeout: 180000 });
    await page.waitForTimeout(1500);
    const found = await page.evaluate((p) => ({
      h1: document.querySelectorAll("h1").length,
      layout: Boolean(document.querySelector(`[data-preset="${p}"]`)),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    }), preset);
    const where = `${path} @${width}`;
    check(found.h1 === 1, `${where}: one h1`, `${where}: ${found.h1} h1 elements`);
    check(found.layout, `${where}: ${preset} layout`, `${where}: no [data-preset="${preset}"]`);
    check(found.overflow <= 0, `${where}: no overflow`, `${where}: scrolls sideways by ${found.overflow}px`);
    check(logged.length === 0, `${where}: nothing logged`, `${where}: logged ${logged.join(" | ")}`);
  }
}

// The feed.
const feed = await fetch(`${BASE}/newsroom/feed.xml`);
if (feed.status === 404) {
  console.log("skip  /newsroom/feed.xml — newsroom not installed");
} else {
  const xml = await feed.text();
  check(xml.startsWith("<?xml") && xml.includes("<rss"), "/newsroom/feed.xml is RSS", "/newsroom/feed.xml is not RSS");
}
const other = await fetch(`${BASE}/testimonials/feed.xml`);
check(other.status === 404, "a feed under another type is a 404", `/testimonials/feed.xml answered ${other.status}`);

await browser.close();
console.log(failures.length ? `\n${failures.length} failure(s).` : "\nAll clean.");
process.exit(failures.length ? 1 : 0);
