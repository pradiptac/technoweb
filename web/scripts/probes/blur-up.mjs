import { chromium } from "playwright";

/**
 * Measures the blurred loading preview (0.123.0, docs/media.md) on the
 * public site.
 *
 *   node scripts/probes/blur-up.mjs            (BASE defaults to localhost:3000)
 *   SHOTS=dir also writes a mid-load screenshot of each route into `dir`.
 *
 * Per route it prints how many previews the first HTML carries and what
 * they weigh — `next/image` writes each as an inline SVG background, and
 * that weight is the cost this feature has — then checks: (1) with the real
 * pictures held back, a picture that has not arrived shows its preview, at
 * the picture's own box; (2) once every picture has arrived no preview is
 * left behind — a transparent logo must not keep a blur under it; (3)
 * nothing scrolls sideways. Reads only; carries no credential and changes
 * nothing.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const ROUTES = (process.env.ROUTES ?? "/ /blog /store /case-studies").split(" ");
const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

for (const path of ROUTES) {
  const html = await (await fetch(`${BASE}${path}`)).text();
  const previews = html.match(/background-image:url\(&quot;data:image\/svg\+xml[^"]*?&quot;\)/g) ?? [];
  const bytes = previews.reduce((n, p) => n + p.length, 0);
  // Reported, not checked: a dev server streams most of a page after the first chunk.
  console.log(`     ${path}: the first HTML carries ${previews.length} preview(s), ${(bytes / 1024).toFixed(1)}KB of ${(html.length / 1024).toFixed(0)}KB`);

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  // Hold every optimised picture back, so the previews are what is on screen.
  let release;
  const held = new Promise((r) => { release = r; });
  await page.route("**/_next/image*", async (route) => { await held; await route.continue(); });

  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(2500);
  const waiting = await page.evaluate(() => [...document.querySelectorAll(".public-site img")]
    .filter((img) => !img.complete || img.naturalWidth === 0)
    .filter((img) => getComputedStyle(img).backgroundImage.includes("data:image/svg+xml"))
    .map((img) => { const r = img.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })
    .filter((b) => b.w > 0 && b.h > 0));
  ok(waiting.length >= 1, `${path}: ${waiting.length} picture(s) still loading show a preview at their own size`);
  const weight = await page.evaluate(() => [...document.querySelectorAll(".public-site img")]
    .map((img) => img.getAttribute("style") ?? "").filter((st) => st.includes("data:image/svg+xml"))
    .reduce((n, st) => n + st.length, 0));
  console.log(`     ${path}: the previews in the page weigh ${(weight / 1024).toFixed(1)}KB before compression`);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/blur${path.replace(/\//g, "_") || "_home"}.png` });

  release();
  // Lazy pictures load as they come into view: walk the page, then wait.
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle", { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const left = await page.evaluate(() => [...document.querySelectorAll(".public-site img")]
    .filter((img) => img.complete && img.naturalWidth > 0)
    .filter((img) => getComputedStyle(img).backgroundImage.includes("data:image/svg+xml")).length);
  ok(left === 0, `${path}: no preview is left behind a picture that has arrived (${left})`);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(over <= 0, `${path}: no sideways scroll (${over})`);
  await context.close();
}

await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
