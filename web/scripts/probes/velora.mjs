/**
 * The five Velora items, measured: border beam (every card, running), vanish
 * input (placeholder cycles, Enter performs the GET), dock (icons magnify under
 * the cursor), theme wipe (a View Transition runs and the scheme changes) and
 * shimmer button (the sweep moves; the header CTA still fits at 320px).
 *
 *   node scripts/probes/velora.mjs [base]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3000";
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail ?? ""}`);
};
const browser = await chromium.launch();
const open = async (path, viewport = { width: 1440, height: 900 }, reducedMotion = "no-preference") => {
  const ctx = await browser.newContext({ viewport, reducedMotion });
  await ctx.addInitScript(() => { try { sessionStorage.setItem("tw_splash", "1"); } catch {} });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await p.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 90_000 });
  // The beam and the placeholder are driven by `motion` from an effect, so
  // nothing moves until hydration is done: wait for the reveal script's own
  // "hydrated" mark before sampling.
  // (Under reduced motion the reveal script bails before setting the mark.)
  await p.waitForFunction(() => document.documentElement.hasAttribute("data-aos-ready") || matchMedia("(prefers-reduced-motion: reduce)").matches, null, { timeout: 30_000 });
  await p.waitForTimeout(600);
  await p.evaluate(() => document.querySelector("dialog[open]")?.close());
  return { ctx, p, errors };
};

// ---------------------------------------------------------- border beam
for (const [path, sel] of [["/store", "article"], ["/solutions", "main [class*=rounded-lg]"], ["/", "main [class*=rounded-lg]"]]) {
  const { ctx, p, errors } = await open(path);
  // Idle: no beam animates (nothing to see, nothing to spend). Hovered: it runs.
  const idle = await p.evaluate(async () => {
    const beams = [...document.querySelectorAll('[data-slot="border-beam"] > div')];
    const a = beams.map((b) => getComputedStyle(b).offsetDistance);
    await new Promise((r) => setTimeout(r, 300));
    const b = beams.map((b) => getComputedStyle(b).offsetDistance);
    return { n: beams.length, moving: a.filter((v, i) => v !== b[i]).length };
  });
  check(`${path}: at rest no beam is animating`, idle.n > 0 && idle.moving === 0, JSON.stringify(idle));
  const firstHost = p.locator(`${sel}:has(> [data-slot="border-beam"])`).first();
  await firstHost.scrollIntoViewIfNeeded();
  await firstHost.hover();
  await p.waitForTimeout(150);
  const r = await p.evaluate(async (sel) => {
    const beams = [...document.querySelectorAll('[data-slot="border-beam"] > div')];
    const hosts = [...document.querySelectorAll(sel)].filter((h) => h.querySelector(':scope > [data-slot="border-beam"]'));
    const first = beams[0]; const a = first ? getComputedStyle(first).offsetDistance : null;
    await new Promise((r) => setTimeout(r, 250));
    const b = first ? getComputedStyle(first).offsetDistance : null;
    return { beams: beams.length, hosts: hosts.length, a, b };
  }, sel);
  check(`${path}: every card carries a beam and the hovered one is moving`, r.beams > 0 && r.beams === r.hosts && r.a !== r.b, JSON.stringify(r));
  const overlay = p.locator('[data-slot="border-beam"]').first();
  const host = overlay.locator("xpath=..");
  await p.mouse.move(2, 2);
  await p.waitForTimeout(350);
  const rest = await overlay.evaluate((el) => getComputedStyle(el).opacity);
  await host.hover();
  await p.waitForTimeout(350);
  const hov = await overlay.evaluate((el) => getComputedStyle(el).opacity);
  check(`${path}: beam hidden at rest, shown on mouse-over`, rest === "0" && hov === "1", `${rest} -> ${hov}`);
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${path}: no horizontal scrollbar`, overflow === 0, `${overflow}px`);
  check(`${path}: no console errors`, errors.length === 0, errors[0]?.slice(0, 120));
  await ctx.close();
}

// --------------------------------------------------------- vanish input
{
  const { ctx, p } = await open("/");
  const form = p.locator('form[data-slot="vanish-input"]');
  check("header: vanish-input present with a GET action", (await form.getAttribute("action")) === "/search" && (await form.getAttribute("method")) === "get");
  const ph1 = await form.locator("span[aria-hidden] span").textContent();
  await p.waitForTimeout(3800);
  const ph2 = await form.locator("span[aria-hidden] span").textContent();
  check("header: placeholder cycles while empty", ph1 !== ph2, `${ph1} -> ${ph2}`);
  await p.fill("#header-q", "firewall");
  await p.keyboard.press("Enter");
  await p.waitForURL((u) => u.pathname === "/search", { timeout: 30_000 });
  check("header: Enter performs the search GET", new URL(p.url()).searchParams.get("q") === "firewall", p.url());
  await ctx.close();
}

// ------------------------------------------------- store search + strip
{
  const { ctx, p } = await open("/store");
  const ph = p.locator("#q ~ span[aria-hidden] span");
  const a = await ph.textContent();
  await p.waitForTimeout(3600);
  const b = await ph.textContent();
  check("store search: cycling placeholder over the combobox", a !== b, `${a} -> ${b}`);
  const geo = await p.evaluate(() => {
    const form = document.querySelector("#q").closest("form"); const fr = form.getBoundingClientRect();
    const search = document.querySelector("#q").closest("div").getBoundingClientRect();
    const kids = [...form.children].map((c) => c.getBoundingClientRect());
    return { strip: Math.round(fr.width), search: Math.round(search.width), lastRight: Math.round(kids.at(-1).right), stripRight: Math.round(fr.right) };
  });
  check("store strip: search is half the strip and the row fills to its edge", geo.search <= geo.strip * 0.5 + 2 && geo.stripRight - geo.lastRight <= 12, JSON.stringify(geo));
  await p.fill("#q", "fort");
  await p.waitForSelector('[role="listbox"]:not([hidden]) [role="option"]', { timeout: 15_000 });
  const row = await p.evaluate(() => {
    const opt = document.querySelector('[role="option"]'); const name = opt.querySelector("span.min-w-0");
    return { optRight: opt.getBoundingClientRect().right, nameRight: name.getBoundingClientRect().right, padRight: parseFloat(getComputedStyle(name).paddingRight) };
  });
  check("store suggestions: the name's box ends short of the row's edge", row.optRight - row.nameRight >= 8 && row.padRight >= 8, JSON.stringify(row));
  await ctx.close();
}

// ------------------------------------------------------- retro grid
{
  const { ctx, p } = await open("/");
  const grid = p.locator('[data-slot="retro-grid"]');
  check("homepage: retro grid mounted behind the certifications band, dots gone", (await grid.count()) === 1 && (await p.locator('[class*="dot-halftone"]').count()) === 0);
  const moving = await grid.locator(".animate-retro-grid").evaluate(async (el) => { const a = getComputedStyle(el).transform; await new Promise((r) => setTimeout(r, 200)); return a !== getComputedStyle(el).transform; });
  check("homepage: the grid plane scrolls", moving);
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("homepage: the 600vw plane does not widen the document", overflow === 0, `${overflow}px`);
  await ctx.close();
}

// --------------------------------------------------------- confetti
{
  // The audit's own route into a filled basket: a product page's Add to basket.
  const s2 = await open("/store");
  const href = await s2.p.locator('article a[href^="/store/products/"]').first().getAttribute("href");
  await s2.p.goto(`${BASE}${href}`, { waitUntil: "networkidle", timeout: 90_000 });
  const add = s2.p.locator('button:has-text("Add to basket")').first();
  await add.scrollIntoViewIfNeeded(); await add.click();
  await s2.p.waitForFunction(() => Number(document.querySelector("[data-basket-count]")?.getAttribute("data-basket-count")) > 0, null, { timeout: 30_000 });
  await s2.p.locator("[data-basket-count]").first().hover(); // the panel reveals on hover
  const checkout = s2.p.locator('a[href="/checkout"]:has-text("Checkout")').first();
  await checkout.waitFor({ state: "visible", timeout: 10_000 });
  await checkout.click({ noWaitAfter: true });
  const canvas = await s2.p.evaluate(() => Boolean(document.querySelector('body > canvas[style*="pointer-events:none"], body > canvas[style*="pointer-events: none"]')));
  check("basket Checkout: a confetti canvas appears on press", canvas);
  await s2.ctx.close();
}

// ----------------------------------------------------------------- dock
{
  const { ctx, p } = await open("/");
  const dock = p.locator('[data-slot="dock"]');
  await dock.scrollIntoViewIfNeeded();
  const icon = dock.locator('[data-slot="dock-icon"]').first();
  const rest = (await icon.boundingBox()).width;
  await icon.hover();
  await p.waitForTimeout(400);
  const big = (await icon.boundingBox()).width;
  check("footer dock: icon magnifies under the cursor", big > rest + 8, `${rest}px -> ${big}px`);
  const link = icon.locator("a");
  check("footer dock: the link inside keeps its name", ((await link.getAttribute("aria-label")) ?? "").startsWith("Technoware on"));
  await ctx.close();
}

// ----------------------------------------------------------- theme wipe
{
  const { ctx, p, errors } = await open("/");
  const supported = await p.evaluate(() => typeof document.startViewTransition === "function");
  const btn = p.locator('[role="radiogroup"][aria-label="Colour scheme"] [role="radio"]').nth(1); // Dark
  await btn.scrollIntoViewIfNeeded();
  const before = await p.evaluate(() => document.documentElement.dataset.scheme);
  await btn.click();
  const during = await p.evaluate(async () => {
    for (let i = 0; i < 10; i++) {
      await new Promise(requestAnimationFrame);
      const vt = document.getAnimations().find((a) => a.effect?.pseudoElement?.startsWith("::view-transition-new"));
      if (vt) return { pseudo: vt.effect.pseudoElement, state: vt.playState };
    }
    return null;
  });
  await p.waitForTimeout(700);
  const after = await p.evaluate(() => document.documentElement.dataset.scheme);
  check("scheme toggle: the palette changed", before !== after && after === "dark", `${before} -> ${after}`);
  check("scheme toggle: a circle wipe ran on ::view-transition-new(root)", !supported || Boolean(during), supported ? JSON.stringify(during) : "no View Transitions in this browser");
  check("scheme toggle: no console errors", errors.length === 0, errors[0]?.slice(0, 120));
  await ctx.close();
}

// ------------------------------------------------------- shimmer button
{
  const { ctx, p } = await open("/");
  const cta = p.locator('header [data-slot="shimmer-button"]').first();
  const sweep = cta.locator("span[aria-hidden]");
  const pos = await sweep.evaluate(async (el) => { const a = getComputedStyle(el).backgroundPosition; await new Promise((r) => setTimeout(r, 200)); return [a, getComputedStyle(el).backgroundPosition]; });
  check("header CTA: the shimmer sweep moves", pos[0] !== pos[1], pos.join(" -> "));
  check("header CTA: no .btn class, so the motion families do not apply", !(await cta.evaluate((el) => el.classList.contains("btn"))));
  await ctx.close();
}
{
  const { ctx, p } = await open("/", { width: 320, height: 640 });
  const w = (await p.locator('header [data-slot="shimmer-button"]').first().boundingBox()).width;
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("320px: header CTA within its 150px budget and no overflow", w <= 150 && overflow === 0, `${w}px, overflow ${overflow}px`);
  await ctx.close();
}
{
  const { ctx, p } = await open("/", { width: 1440, height: 900 }, "reduce");
  const r = await p.evaluate(() => {
    const beam = document.querySelector('[data-slot="border-beam"]');
    const sweep = document.querySelector('header [data-slot="shimmer-button"] span[aria-hidden]');
    return { beam: beam ? getComputedStyle(beam).display : null, sweepAnim: sweep ? getComputedStyle(sweep).animationName : null, sweepRunning: sweep ? sweep.getAnimations().length : null };
  });
  check("reduce: beam hidden, shimmer not animating", r.beam === "none" && (r.sweepRunning === 0), JSON.stringify(r));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
