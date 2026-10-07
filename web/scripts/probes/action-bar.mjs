import { chromium } from "playwright";

/**
 * Measures the three things 0.122.0 added to the public site, end to end
 * through the real Site settings form: the phone's action bar, the
 * coming-soon page and the 404's search and suggestions.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/action-bar.mjs
 *   HOLD=bar leaves the action bar switched on (for an audit run);
 *   RESTORE=1 only switches both off again.
 *
 * Checks: (1) with the bar on, a 390px page draws it against the bottom
 * edge with its buttons, pads the page's foot so the footer's last line is
 * above it, keeps the assistant's launcher clear of it and scrolls nowhere
 * sideways; at 1280 it is not drawn and nothing is padded; (2) with the
 * coming-soon switch on, an anonymous visitor sees the holding page at the
 * address they asked for (it can take a minute — the proxy refreshes its copy
 * of the switch every 60s), `robots.txt` disallows everything, the console's
 * sign-in still opens, and a signed-in browser still sees the real site and
 * the console's notice; (3) switched off, the site is back and
 * `/coming-soon` sends a visitor home; (4) a 404 inside and outside the
 * marketing layout answers 404, offers the site search and suggests pages
 * from the address. Carries no credential; saves two settings tabs — a
 * development database only — and always puts them back.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const NUMBER = "919800000000";
const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const { signInAsStaff } = await import("../shared.mjs");
const staff = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const admin = await staff.newPage();
await signInAsStaff(admin);

async function openTab(tab, field) {
  await admin.goto(`${BASE}/admin/site/settings?tab=${tab}`, { waitUntil: "load", timeout: 180000 });
  await admin.waitForSelector(field, { state: "visible", timeout: 60000 });
}
async function save() {
  await admin.getByRole("button", { name: /Save site settings/ }).click();
  await admin.waitForTimeout(5000);
}
async function bar(on) {
  await openTab("action_bar", "#setting__action_bar_enabled");
  await admin.locator("#setting__action_bar_enabled").setChecked(on);
  await admin.fill("#setting__action_bar_whatsapp_number", on ? NUMBER : "");
  await save();
}
async function curtain(on) {
  await openTab("coming_soon", "#setting__coming_soon_enabled");
  await admin.locator("#setting__coming_soon_enabled").setChecked(on);
  await save();
}

/** A fresh anonymous browser, so no cookie and no cached navigation carries over. */
async function visitor(width, path) {
  const context = await browser.newContext({ viewport: { width, height: 844 } });
  const page = await context.newPage();
  const response = await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 180000 });
  return { page, context, status: response?.status() ?? 0 };
}

/** Poll an anonymous page until `test` holds — the proxy's copy of the switch is up to a minute old. */
async function until(path, test, seconds = 100) {
  for (let waited = 0; waited < seconds; waited += 5) {
    const { page, context } = await visitor(1280, path);
    const held = await page.evaluate(test).catch(() => false);
    await context.close();
    if (held) return true;
    await new Promise((r) => setTimeout(r, 5000));
  }
  return false;
}

async function restore() {
  await curtain(false);
  await bar(false);
}

if (process.env.RESTORE === "1") {
  await restore();
  await browser.close();
  console.log("restored");
  process.exit(0);
}

try {
  // 1. The action bar.
  await bar(true);

  const phone = await visitor(390, "/");
  await phone.page.waitForTimeout(1500);
  // The assistant mounts once the page is idle; wait for it so the check below is not vacuous.
  await phone.page.waitForSelector(".assistant-launcher", { timeout: 15000 }).catch(() => {});
  await phone.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await phone.page.waitForTimeout(800);
  const m = await phone.page.evaluate(() => {
    const nav = document.querySelector("[data-action-bar]");
    if (!nav) return null;
    const r = nav.getBoundingClientRect();
    const footer = document.querySelector("footer");
    const launcher = document.querySelector(".assistant-launcher");
    const words = [...(footer?.querySelectorAll("a, p, span, li") ?? [])].map((el) => el.getBoundingClientRect()).filter((b) => b.height > 0);
    return {
      shown: getComputedStyle(nav).display !== "none",
      top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), viewport: window.innerHeight,
      buttons: [...nav.querySelectorAll("a")].map((a) => ({ text: a.textContent.trim(), href: a.getAttribute("href"), h: Math.round(a.getBoundingClientRect().height) })),
      footerLowest: Math.round(Math.max(0, ...words.map((b) => b.bottom))),
      launcherBottom: launcher ? Math.round(launcher.getBoundingClientRect().bottom) : null,
      over: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  ok(m?.shown === true, "at 390 the action bar is drawn");
  ok(m && m.bottom === m.viewport, `it sits on the bottom edge (${m?.bottom} of ${m?.viewport})`);
  ok(m && m.buttons.length >= 2 && m.buttons.every((b) => b.h >= 44), `its buttons are tap-sized: ${m?.buttons.map((b) => `${b.text} ${b.h}px`).join(", ")}`);
  ok(m?.buttons.some((b) => b.href === `https://wa.me/${NUMBER}`), "the WhatsApp button opens the saved number");
  ok(m && m.footerLowest <= m.top, `scrolled to the end, the footer's last line is above the bar (${m?.footerLowest} ≤ ${m?.top})`);
  ok(m && (m.launcherBottom === null || m.launcherBottom <= m.top), `the assistant's launcher is clear of it (${m?.launcherBottom} ≤ ${m?.top})`);
  ok(m?.over <= 0, `no sideways scroll at 390 (${m?.over})`);
  await phone.context.close();

  const wide = await visitor(1280, "/");
  const w = await wide.page.evaluate(() => ({
    display: getComputedStyle(document.querySelector("[data-action-bar]")).display,
    pad: getComputedStyle(document.querySelector(".public-site")).paddingBottom,
  }));
  ok(w.display === "none" && w.pad === "0px", `at 1280 it is not drawn and nothing is padded (${w.display}, ${w.pad})`);
  await wide.context.close();

  if (process.env.HOLD === "bar") {
    await browser.close();
    console.log(failed ? `\n${failed} failed (action bar left on)` : "\nall passed (action bar left on)");
    process.exit(failed ? 1 : 0);
  }

  // 2. The coming-soon page.
  await curtain(true);
  const heading = "We are getting ready";
  const up = await until("/about", `document.querySelector("h1")?.textContent.includes(${JSON.stringify(heading.slice(0, 12))})`);
  ok(up, "an anonymous visitor to /about sees the coming-soon page");

  const held = await visitor(390, "/about");
  const c = await held.page.evaluate(() => ({
    path: location.pathname,
    h1: document.querySelectorAll("h1").length,
    nav: document.querySelectorAll("nav").length,
    robots: document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "",
    over: document.documentElement.scrollWidth - window.innerWidth,
  }));
  ok(c.path === "/about", "the address stays the one that was asked for");
  ok(c.h1 === 1 && c.nav === 0, `one heading and no navigation (${c.h1} h1, ${c.nav} nav)`);
  ok(/noindex/.test(c.robots), `it is noindex (${c.robots})`);
  ok(c.over <= 0, `no sideways scroll at 390 (${c.over})`);
  await held.context.close();

  const robots = await (await fetch(`${BASE}/robots.txt`)).text();
  ok(/Disallow: \/\s*$/m.test(robots) && !/Allow:/.test(robots), "robots.txt disallows everything");

  const door = await visitor(1280, "/admin/login");
  ok(await door.page.locator("#email").count() === 1, "the console's sign-in still opens");
  await door.context.close();

  const seen = await staff.newPage();
  await seen.goto(`${BASE}/about`, { waitUntil: "load", timeout: 180000 });
  ok(await seen.locator("[data-theme]").count() === 1, "a signed-in browser still sees the real site");
  await seen.goto(`${BASE}/admin`, { waitUntil: "load", timeout: 180000 });
  ok(await seen.locator("[data-coming-soon-notice]").count() === 1, "and the console says visitors are seeing the holding page");
  await seen.close();

  // 3. Off again.
  await curtain(false);
  const down = await until("/about", `document.querySelector("[data-theme]") !== null`);
  ok(down, "switched off, /about is the real page again");
  const direct = await visitor(1280, "/coming-soon");
  ok(new URL(direct.page.url()).pathname === "/", "and /coming-soon sends a visitor home");
  await direct.context.close();

  // 4. The 404.
  for (const [path, where] of [["/networking", "inside the marketing layout"], ["/zz/networking", "outside it"]]) {
    const lost = await visitor(1280, path);
    ok(lost.status === 404, `${path} answers 404 (${lost.status}), ${where}`);
    // The not-found body can arrive in the stream after `load`, so wait for it.
    const form = await lost.page.waitForSelector('form[action="/search"] #not-found-q', { timeout: 60000 }).then(() => true, () => false);
    ok(form, "it offers the site search");
    const suggested = await lost.page.waitForSelector("[data-not-found-suggestions] a", { timeout: 30000 }).then(() => true, () => false);
    const count = await lost.page.locator("[data-not-found-suggestions] a").count();
    ok(suggested && count >= 1 && count <= 5, `and suggests pages from the address (${count})`);
    await lost.context.close();
  }
} finally {
  await restore().catch((e) => { console.log(`FAIL could not restore: ${e.message}`); failed++; });
}

await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
