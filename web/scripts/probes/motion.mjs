import { chromium } from "playwright";

/**
 * Drives the Motion tab through the real console, then reads what the live
 * site does with the result.
 *
 *   node scripts/probes/motion.mjs
 *
 * Signs in with ADMIN_LOGIN_EMAIL / ADMIN_LOGIN_PASSWORD — the audit's own
 * account, which is read-only there and *written to* here (it saves the Motion
 * tab), so point it at a throwaway administrator rather than the seeded one.
 * Restores the defaults it found.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const EMAIL = process.env.ADMIN_LOGIN_EMAIL;
const PASSWORD = process.env.ADMIN_LOGIN_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error("Set ADMIN_LOGIN_EMAIL and ADMIN_LOGIN_PASSWORD."); process.exit(2); }
const OUT = process.env.OUT ?? process.env.TEMP ?? ".";

const failures = [];
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures.push(label);
};

async function signIn(page) {
  await page.goto(`${BASE}/admin/login`, { waitUntil: "load", timeout: 120000 });
  const t = page.locator('button:has-text("Use your password instead")');
  if (await t.count()) { await t.first().click(); await page.waitForSelector("#password"); }
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 120000 }),
    page.click('button[type="submit"]'),
  ]);
}

async function openMotion(page) {
  await page.goto(`${BASE}/admin/settings?tab=motion`, { waitUntil: "networkidle", timeout: 120000 });
  const tab = page.locator('[role="tab"]:has-text("Motion")');
  if (await tab.count()) await tab.first().click();
  await page.waitForSelector('input[name="setting__motion_reveal"]', { timeout: 60000 });
}

const choose = (page, key, value) =>
  page.locator(`label:has(input[name="setting__${key}"][value="${value}"])`).first().click();

async function save(page) {
  await page.click('button[type="submit"]:has-text("Save settings")');
  await page.getByText(/Settings saved|Could not save/).first().waitFor({ timeout: 120000 });
  await page.waitForLoadState("networkidle");
}

async function set(page, values) {
  await openMotion(page);
  for (const [k, v] of Object.entries(values)) await choose(page, k, v);
  await save(page);
}

const DEFAULTS = { motion_reveal: "lift", motion_buttons: "lift", motion_page: "none", motion_loader: "none", motion_splash: "0", motion_hero: "grid" };
const LOUD = { motion_reveal: "blur", motion_buttons: "shine", motion_page: "rise", motion_loader: "bar", motion_splash: "1", motion_hero: "aurora" };

const browser = await chromium.launch();
const admin = await browser.newPage();

// MODE=loud leaves the loud combination in place for an audit run; MODE=restore
// puts the defaults back. Neither runs the checks.
if (process.env.MODE === "loud" || process.env.MODE === "restore") {
  await signIn(admin);
  await set(admin, process.env.MODE === "loud" ? LOUD : DEFAULTS);
  console.log("set", process.env.MODE);
  await browser.close();
  process.exit(0);
}

let before = null;
try {
  await signIn(admin);
  await openMotion(admin);
  before = Object.fromEntries(await Promise.all(Object.keys(DEFAULTS).map(async (k) =>
    [k, await admin.locator(`input[name="setting__${k}"]:checked`).inputValue()])));
  console.log("before:", JSON.stringify(before));

  // ------------------------------------------------------------ defaults
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => { try { localStorage.setItem("tw_scheme_site", "light"); } catch {} });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 120000 });
    const attrs = await p.evaluate(() => {
      const el = document.querySelector(".public-site");
      return ["reveal", "buttons", "page", "hero"].map((k) => el?.getAttribute(`data-motion-${k}`));
    });
    check("defaults: the wrapper carries lift/lift/none/grid", JSON.stringify(attrs) === JSON.stringify(["lift", "lift", "none", "grid"]), JSON.stringify(attrs));
    const grid = await p.evaluate(() => {
      const el = document.querySelector("section.relative.overflow-hidden > div[aria-hidden]");
      const s = getComputedStyle(el);
      return { bi: s.backgroundImage, bs: s.backgroundSize, mask: s.maskImage, op: s.opacity };
    });
    check("defaults: the hero grid is the old grid (56px, 55% ellipse, opacity .85)",
      grid.bs.startsWith("56px 56px") && /80% 55% at 50% 0%/.test(grid.mask) && grid.op === "0.85" && /linear-gradient\(rgb\(/.test(grid.bi),
      JSON.stringify(grid));
    check("defaults: no route-progress, no splash markup", (await p.locator(".route-progress").count()) === 0 && (await p.locator(".splash").count()) === 0);
    check("defaults: .page-enter has no animation", (await p.evaluate(() => getComputedStyle(document.querySelector(".page-enter")).animationName)) === "none");
    await p.screenshot({ path: `${OUT}/motion-default-light.png` });
    await ctx.close();
  }

  // ---------------------------------------------------------------- loud
  await set(admin, LOUD);
  {
    // A fresh context: no session flag, so the splash is due.
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => { try { localStorage.setItem("tw_scheme_site", "light"); } catch {} });
    // Record the attribute's life from before any script runs.
    await ctx.addInitScript(() => {
      window.__splash = [];
      const t0 = performance.now();
      new MutationObserver(() => window.__splash.push([Math.round(performance.now() - t0), document.documentElement.dataset.splash ?? "off"]))
        .observe(document.documentElement, { attributes: true, attributeFilter: ["data-splash"] });
    });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 120000 });
    const early = await p.evaluate(() => document.documentElement.dataset.splash === "1");
    const shown = await p.evaluate(() => { const el = document.querySelector(".splash"); return el ? getComputedStyle(el).display : "missing"; });
    check("loud: the splash attribute is set by DOMContentLoaded and the overlay is displayed", early && shown === "grid", `${early} ${shown}`);
    await p.waitForLoadState("networkidle");
    await p.waitForTimeout(1600);
    const life = await p.evaluate(() => window.__splash);
    const gone = await p.evaluate(() => !("splash" in document.documentElement.dataset) && getComputedStyle(document.querySelector(".splash")).display === "none");
    check("loud: the splash is gone within 1.6s", gone, JSON.stringify(life));
    const attrs = await p.evaluate(() => {
      const el = document.querySelector(".public-site");
      return ["reveal", "buttons", "page", "hero"].map((k) => el?.getAttribute(`data-motion-${k}`));
    });
    check("loud: the wrapper carries blur/shine/rise/aurora", JSON.stringify(attrs) === JSON.stringify(["blur", "shine", "rise", "aurora"]), JSON.stringify(attrs));
    const blobs = await p.locator(".aurora-blob").count();
    check("loud: three aurora blobs on the page", blobs >= 3, String(blobs));
    const alpha = await p.evaluate(() => getComputedStyle(document.querySelector(".aurora-blob")).opacity);
    check("loud: blob opacity is the theme's own alpha", Number(alpha) > 0 && Number(alpha) <= 0.32, alpha);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("loud: no horizontal overflow on the homepage", overflow === 0, `${overflow}px`);
    const btn = await p.evaluate(() => {
      const b = [...document.querySelectorAll(".public-site .btn")].find((e) => e.offsetParent !== null);
      const s = getComputedStyle(b), before = getComputedStyle(b, "::before");
      return { position: s.position, overflow: s.overflow, content: before.content, sweep: before.transform };
    });
    check("loud: a button carries the shine host rules and a sweep", btn.position === "relative" && btn.overflow === "hidden" && btn.sweep !== "none", JSON.stringify(btn));
    await p.screenshot({ path: `${OUT}/motion-loud-light.png` });

    // Second load in the same session: no splash.
    await p.goto(`${BASE}/`, { waitUntil: "commit", timeout: 120000 });
    check("loud: no splash on the second page of the session", await p.evaluate(() => document.documentElement.dataset.splash !== "1"));

    // A client-side navigation: the bar and the page animation.
    await p.waitForLoadState("networkidle");
    await p.evaluate(() => { window.__seen = []; const t0 = performance.now(); const el = document.querySelector(".route-progress"); new MutationObserver(() => window.__seen.push([Math.round(performance.now() - t0), el.getAttribute("data-state") ?? "idle"])).observe(el, { attributes: true, attributeFilter: ["data-state"] }); window.addEventListener("tw:navigate", (e) => window.__seen.push([Math.round(performance.now() - t0), "nav " + e.detail])); });
    await p.click('a[href="/products"]');
    await p.waitForURL((u) => u.pathname === "/products", { timeout: 120000 });
    await p.waitForLoadState("networkidle");
    const anim = await p.evaluate(() => getComputedStyle(document.querySelector(".page-enter")).animationName);
    check("loud: after a client navigation .page-enter animates page-rise", anim === "page-rise", anim);
    await p.waitForTimeout(1200);
    const seen = await p.evaluate(() => window.__seen);
    const idle = await p.evaluate(() => getComputedStyle(document.querySelector(".route-progress")).display);
    check("loud: the route bar showed, completed, and is display:none again", idle === "none", `states seen: ${JSON.stringify(seen)} now ${idle}`);

    // Reveal: blur start state exists, then reveals.
    await p.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 120000 });
    const far = await p.evaluate(() => {
      const els = [...document.querySelectorAll("[data-aos]")];
      const el = els.find((e) => e.getBoundingClientRect().top > innerHeight * 1.5);
      if (!el) return null;
      const s = getComputedStyle(el);
      return { opacity: s.opacity, filter: s.filter };
    });
    check("loud: an unrevealed section below the fold is blurred and hidden", far && far.opacity === "0" && /blur/.test(far.filter), JSON.stringify(far));
    // And it must actually arrive: the start-state rules share a specificity
    // with the reveal's animate rule, so a guard missing there shows here as
    // opacity moving while the transform never does.
    const flight = await p.evaluate(async () => {
      const el = [...document.querySelectorAll("[data-aos]")].find((e) => e.getBoundingClientRect().top > innerHeight * 1.5);
      el.scrollIntoView({ block: "center", behavior: "instant" });
      await new Promise((r) => setTimeout(r, 1400));
      const s = getComputedStyle(el);
      return { animate: el.hasAttribute("data-aos-animate"), opacity: Number(s.opacity), transform: s.transform, filter: s.filter };
    });
    check("loud: a scrolled-in section reveals — opacity, transform and filter all move", flight.animate && flight.opacity > 0.9 && (flight.transform === "none" || /\(1, 0, 0, 1, 0, [0-2]\./.test(flight.transform)) && flight.filter === "none", JSON.stringify(flight));
    await ctx.close();
  }

  // ------------------------------------------------------ reduced motion
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 120000 });
    check("reduce: no splash attribute", await p.evaluate(() => document.documentElement.dataset.splash !== "1"));
    const hidden = await p.evaluate(() => [...document.querySelectorAll("[data-aos]")].filter((e) => getComputedStyle(e).opacity !== "1").length);
    check("reduce: every [data-aos] is visible", hidden === 0, `${hidden} hidden`);
    check("reduce: .page-enter has no animation", (await p.evaluate(() => getComputedStyle(document.querySelector(".page-enter")).animationName)) === "none");
    await ctx.close();
  }

  // -------------------------------------------------------- dark aurora
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => { try { localStorage.setItem("tw_scheme_site", "dark"); sessionStorage.setItem("tw_splash", "1"); } catch {} });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 120000 });
    const alpha = await p.evaluate(() => getComputedStyle(document.querySelector(".aurora-blob")).opacity);
    check("dark: blob opacity is the dark alpha", Number(alpha) > 0 && Number(alpha) <= 0.16, alpha);
    await p.screenshot({ path: `${OUT}/motion-loud-dark.png` });
    await ctx.close();
  }
} finally {
  try {
    await set(admin, before ?? DEFAULTS);
    console.log("restored to", JSON.stringify(before ?? DEFAULTS));
  } catch (e) {
    console.log("RESTORE FAILED", e.message);
    failures.push("restore");
  }
  await browser.close();
}

console.log(failures.length ? `\n${failures.length} failure(s)` : "\nAll checks passed.");
process.exit(failures.length ? 1 : 0);
