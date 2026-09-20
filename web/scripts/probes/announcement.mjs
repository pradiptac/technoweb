import { chromium } from "playwright";
import { announcementFor } from "../../src/lib/announcement.ts";
import { contrast } from "../../src/lib/palette.ts";

/**
 * Measures the announcement bar (`components/layout/announcement-bar.tsx`,
 * `lib/announcement.ts`, the `announcement` settings group).
 *
 *   node --experimental-strip-types scripts/probes/announcement.mjs
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node --experimental-strip-types scripts/probes/announcement.mjs   # + the console preview
 *
 * Needs a live announcement on the site it points at (the mock always has
 * one; on the real API switch it on at Site → Info bar). Checks:
 * (1) the bar sits above the header; (2) the message's computed colour
 * clears 4.5:1 against every stop of the computed background — the audit's
 * own grading, run here so the probe fails before the audit would; (3) a
 * ticker's track moves between samples, pauses under the pointer and via the
 * toggle, and only one copy is not `inert`; (4) no horizontal scroll at 1280
 * and 360; (5) × removes it, sessionStorage holds the fingerprint, and after
 * a reload `html[data-announcement-closed]` is set before hydration; (6) a
 * reduced-motion context shows a static, readable, unmasked strip; (7) the
 * pure model: not live → null, blank message → null, a bad hex falls back;
 * (8) with credentials, the Info bar screen's preview re-renders on Mode and Style.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
// The site popup opens after its own delay, over the bar, and would
// intercept the hover and the ×; close any dialog the moment it opens rather
// than guessing when. The component listens for the dialog's own `close`.
const quiet = (page) => page.addInitScript(() => {
  new MutationObserver(() => {
    document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  }).observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ["open"] });
});
const rgb = (s) => s.match(/\d+/g).slice(0, 3).map(Number);
const hex = (s) => "#" + rgb(s).map((n) => n.toString(16).padStart(2, "0")).join("");

// (7) the pure model first: no server needed.
const fixture = { announcement_live: "1", announcement_message: "<p>Hi</p>", announcement_style: "gradient", announcement_colour: "#e11d48", announcement_colour_2: "#3b82f6", announcement_mode: "ticker", announcement_closable: "1" };
ok(announcementFor({ ...fixture, announcement_live: "0" }) === null, "model: not live is null");
ok(announcementFor({ ...fixture, announcement_message: "  " }) === null, "model: a blank message is null");
ok(announcementFor({ ...fixture, announcement_colour: "red" })?.typed[0] === "#12140d", "model: a bad hex falls back to the seeded colour");
ok(announcementFor(fixture)?.id !== announcementFor({ ...fixture, announcement_message: "<p>Changed</p>" })?.id, "model: a changed message has a new fingerprint");

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await quiet(page);
await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 120000 });
const bar = page.locator("[data-announcement]").first();
if ((await bar.count()) === 0) {
  console.log("FAIL no announcement on the page — switch one on at Site → Info bar, or run against the mock");
  await browser.close();
  process.exit(1);
}
const mode = await bar.getAttribute("data-mode");
ok(await page.evaluate(() => document.querySelector("[data-announcement]").getBoundingClientRect().bottom <= document.querySelector("header").getBoundingClientRect().top + 1), "the bar sits above the header");

// (2) contrast against every stop, the audit's way.
const paint = await bar.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, img: getComputedStyle(el).backgroundImage, color: getComputedStyle(el.querySelector("p") ?? el).color }));
const stops = paint.img === "none" ? [paint.bg] : paint.img.match(/rgb\([^)]+\)/g);
const ratios = stops.map((s) => contrast(hex(paint.color), hex(s)));
ok(ratios.every((r) => r >= 4.5), `ink ${hex(paint.color)} clears AA on every stop (${ratios.map((r) => r.toFixed(2)).join(", ")})`);

// (3) the ticker.
if (mode === "ticker") {
  const track = bar.locator(".brand-marquee-track");
  const samples = [];
  for (let i = 0; i < 6; i++) { samples.push(await track.evaluate((el) => getComputedStyle(el).transform)); await page.waitForTimeout(120); }
  ok(new Set(samples).size > 1, "ticker: the track moves between samples");
  // Not `hover()`: Playwright waits for the target to be stable, and a
  // marquee never is. Move the pointer onto the bar's centre instead.
  const box = await bar.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => getComputedStyle(document.querySelector("[data-announcement] .brand-marquee-track")).animationPlayState === "paused", null, { timeout: 3000 }).catch(() => {});
  ok((await track.evaluate((el) => getComputedStyle(el).animationPlayState)) === "paused", "ticker: pauses under the pointer");
  await page.mouse.move(5, 700);
  await bar.getByRole("button", { name: /Pause the announcement/ }).click();
  ok((await bar.evaluate((el) => el.querySelector("[data-marquee]").dataset.paused === "true")) && (await track.evaluate((el) => getComputedStyle(el).animationPlayState)) === "paused", "ticker: the toggle pauses it and sets data-paused");
  await bar.getByRole("button", { name: /Resume the announcement/ }).click();
  const copies = await track.evaluate((el) => ({ all: el.children.length, inert: el.querySelectorAll(":scope > [inert]").length }));
  ok(copies.all - copies.inert === 1, `ticker: one real copy of ${copies.all}, the rest inert`);
}

// (4) overflow.
ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no horizontal scroll at 1280");
await page.setViewportSize({ width: 360, height: 700 });
await page.waitForTimeout(300);
ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no horizontal scroll at 360");
await page.setViewportSize({ width: 1280, height: 800 });

// (5) closing.
const id = await bar.getAttribute("data-announcement");
const close = bar.getByRole("button", { name: "Close this announcement" });
if ((await close.count()) === 1) {
  await close.click();
  await page.waitForFunction(() => !document.querySelector("[data-announcement]"), null, { timeout: 5000 }).catch(() => {});
  ok((await page.locator("[data-announcement]").count()) === 0, "× removes the bar");
  ok((await page.evaluate(() => sessionStorage.getItem("tw_announcement_closed"))) === id, "sessionStorage holds the fingerprint");
  await page.addInitScript(() => { document.addEventListener("DOMContentLoaded", () => { window.__closedAtLoad = document.documentElement.dataset.announcementClosed; }); });
  await page.reload({ waitUntil: "load" });
  ok((await page.evaluate(() => window.__closedAtLoad)) === "1", "after a reload it is hidden before hydration");
  // Hydration on a dev server can take a few seconds; the CSS hides it meanwhile.
  await page.waitForFunction(() => !document.querySelector("[data-announcement]"), null, { timeout: 15000 }).catch(() => {});
  ok((await page.locator("[data-announcement]").count()) === 0, "and gone from the tree after it");
  await page.evaluate(() => sessionStorage.removeItem("tw_announcement_closed"));
} else {
  console.log("note closing is switched off for this announcement; skipping (5)");
}

// (6) reduced motion.
const reduced = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 800 } });
const rp = await reduced.newPage();
await quiet(rp);
await rp.goto(`${BASE}/`, { waitUntil: "load", timeout: 120000 });
const r = await rp.evaluate(() => {
  const b = document.querySelector("[data-announcement]"); if (!b) return null;
  const track = b.querySelector(".brand-marquee-track");
  const first = b.querySelector("p");
  return { anim: track ? getComputedStyle(track).animationName : "none", visible: first && first.getBoundingClientRect().width > 0 && first.getBoundingClientRect().right <= innerWidth, mask: track ? getComputedStyle(track.parentElement).maskImage : "none" };
});
ok(r && r.anim === "none" && r.visible && r.mask === "none", `reduced motion: static, readable, unmasked (${JSON.stringify(r)})`);
await reduced.close();

// (8) the console preview.
if (process.env.ADMIN_LOGIN_EMAIL && process.env.ADMIN_LOGIN_PASSWORD) {
  const { signInAsStaff } = await import("../shared.mjs");
  await signInAsStaff(page);
  await page.goto(`${BASE}/admin/info-bar`, { waitUntil: "load", timeout: 120000 });
  await page.locator("#announcement-enabled").waitFor({ timeout: 30000 });
  await page.locator('input[name="setting__announcement_mode"][value="fixed"]').check({ force: true });
  await page.waitForTimeout(200);
  ok((await page.locator("[data-announcement][data-mode='fixed']").count()) === 1 && (await page.locator("[data-announcement] .brand-marquee-track").count()) === 0, "console: the preview re-renders as fixed");
  await page.locator('input[name="setting__announcement_style"][value="solid"]').check({ force: true });
  await page.waitForTimeout(200);
  ok((await page.locator("[data-announcement]").evaluate((el) => getComputedStyle(el).backgroundImage)) === "none", "console: the preview re-renders as solid");
}

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
