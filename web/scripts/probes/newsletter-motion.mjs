/**
 * Newsletter signup motion probe.
 *
 * Samples the footer form's motion *mid-flight* rather than reading class
 * names: the arrow's computed `translate` at ~80ms into a hover and into a
 * keyboard focus, the heart's animation after an Enter-key submission, and
 * the same two under reduced motion. A value read on the same tick is the
 * start state and one read after the duration is the end state; neither says
 * whether anything animated, which is how the nav underline was twice
 * recorded as "not applying".
 *
 *   node scripts/probes/newsletter-motion.mjs [base]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3000";
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail ?? ""}`);
};

const browser = await chromium.launch();

async function open(reducedMotion) {
  const ctx = await browser.newContext({ reducedMotion, viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => {
    try { sessionStorage.setItem("tw_splash", "1"); } catch {}
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  // Dismiss a sitewide popup if one is live; it is a modal and would swallow clicks.
  await page.evaluate(() => document.querySelector("dialog[open]")?.close());
  const form = page.locator("footer form:has(#newsletter-email)");
  await form.scrollIntoViewIfNeeded();
  return { ctx, page, form };
}

const tr = (page, sel) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).translate, sel);
const ICON = "footer form:has(#newsletter-email) button[type=submit] svg";

// ---------------------------------------------------------------- motion on
{
  const { ctx, page, form } = await open("no-preference");
  const button = form.locator("button[type=submit]");

  check("arrow present in button", (await button.locator("svg").count()) === 1);
  check("arrow rests at translate none", (await tr(page, ICON)) === "none", await tr(page, ICON));

  await button.hover();
  // Sample every frame for 300ms rather than once at a fixed offset: the
  // transition starts on the style recalc *after* the pointer lands, and one
  // read at 80ms landed on 0px while the settled value was 2px.
  const samples = await page.evaluate(async (s) => {
    const el = document.querySelector(s); const out = [];
    for (let i = 0; i < 20; i++) { await new Promise(requestAnimationFrame); out.push(getComputedStyle(el).translate); }
    return out;
  }, ICON);
  const between = samples.map(parseFloat).filter((x) => x > 0 && x < 2);
  check("hover: translate sampled strictly between 0 and 2px mid-flight", between.length > 0, samples.join(" "));
  await page.waitForTimeout(300);
  check("hover: settles at 2px", (await tr(page, ICON)).startsWith("2px"), await tr(page, ICON));

  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await page.locator("#newsletter-email").focus();
  await page.keyboard.press("Tab");
  await page.waitForTimeout(80);
  const midF = parseFloat(await tr(page, ICON));
  check("focus-visible: translate mid-flight is strictly between 0 and 2px", midF > 0 && midF < 2, String(midF));

  // Enter in the field submits: no click anywhere.
  await page.locator("#newsletter-email").fill(`probe-${Date.now()}@example.invalid`);
  await page.locator("#newsletter-email").press("Enter");
  const status = form.locator("xpath=..").locator("[role=status]");
  await page.locator("footer [role=status]").waitFor({ timeout: 10_000 });
  check("Enter submits and the status appears", true);

  const heart = page.locator("footer [role=status] svg");
  check("heart rendered, aria-hidden", (await heart.getAttribute("aria-hidden")) === "true");
  const fill = await heart.evaluate((el) => getComputedStyle(el).fill);
  check("heart is filled (not fill:none)", fill !== "none", fill);
  const anim = await heart.evaluate((el) => {
    const a = el.getAnimations()[0];
    return a ? { iterations: a.effect.getTiming().iterations, duration: a.effect.getTiming().duration, state: a.playState } : null;
  });
  check("heart has one finite animation", !!anim && Number.isFinite(anim.iterations) && anim.iterations === 1, JSON.stringify(anim));
  await page.waitForTimeout(1200);
  const after = await heart.evaluate((el) => ({ n: el.getAnimations().length, opacity: getComputedStyle(el).opacity, transform: getComputedStyle(el).transform }));
  check("heart is still by 1.2s: opacity 1, identity transform", after.opacity === "1" && /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/.test(after.transform), JSON.stringify(after));
  void status;
  await ctx.close();
}

// --------------------------------------------------------------- motion off
{
  const { ctx, page, form } = await open("reduce");
  const button = form.locator("button[type=submit]");
  await button.hover();
  await page.waitForTimeout(80);
  const mid = await tr(page, ICON);
  check("reduce: hover jumps straight to 2px (no transition)", mid.startsWith("2px"), mid);

  await page.locator("#newsletter-email").fill(`probe-rm-${Date.now()}@example.invalid`);
  await page.locator("#newsletter-email").press("Enter");
  await page.locator("footer [role=status]").waitFor({ timeout: 10_000 });
  const heart = page.locator("footer [role=status] svg");
  const st = await heart.evaluate((el) => ({ n: el.getAnimations().length, opacity: getComputedStyle(el).opacity, transform: getComputedStyle(el).transform }));
  check("reduce: heart simply there — no animation, opacity 1", st.n === 0 && st.opacity === "1" && st.transform === "none", JSON.stringify(st));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
