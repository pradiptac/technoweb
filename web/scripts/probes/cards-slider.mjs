/**
 * Stacked-cards slider probe.
 *
 * Switches the homepage hero slider to the `cards` layout **through the
 * console's own form** — which is what proves the dropdown picked the new
 * enum case up from `meta.layouts` and that the save's `updateTag` reaches
 * the public page — then measures the carousel on `/`: the cards are real
 * buttons with the right labels and Tab reaches every non-peek one; pressing
 * a card swaps the slide and announces it; the promoted picture runs one
 * finite transform animation that is sampled mid-flight and gone by 800ms; a
 * re-slotted card's computed `translate` moves; a second press mid-flight
 * leaves exactly one running animation; and under reduced motion the swap is
 * instant with nothing animating. The hero is put back to its previous
 * layout at the end whatever happened.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/cards-slider.mjs [base]
 */
import { chromium } from "playwright";
import { switchToPasswordForm } from "../shared.mjs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const EMAIL = process.env.ADMIN_LOGIN_EMAIL;
const PASSWORD = process.env.ADMIN_LOGIN_PASSWORD;
const SLIDER_ID = process.env.SLIDER_ID ?? "1";
if (!EMAIL || !PASSWORD) { console.error("Set ADMIN_LOGIN_EMAIL and ADMIN_LOGIN_PASSWORD."); process.exit(2); }

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail ?? ""}`);
};

const browser = await chromium.launch();
const admin = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await admin.newPage();

async function setLayout(value) {
  await page.goto(`${BASE}/admin/sliders/${SLIDER_ID}`, { waitUntil: "networkidle" });
  const select = page.locator("#layout");
  const before = await select.inputValue();
  await select.selectOption(value);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/admin/sliders/") && r.request().method() === "POST", { timeout: 30_000 }).catch(() => null),
    page.click('button[type="submit"]:has-text("Save slider")'),
  ]);
  await page.waitForTimeout(800);
  return before;
}

let previous = null;
try {
  await page.goto(`${BASE}/admin/login`, { waitUntil: "load" });
  await switchToPasswordForm(page);
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 60_000 }),
    page.click('button[type="submit"]'),
  ]);

  await page.goto(`${BASE}/admin/sliders/${SLIDER_ID}`, { waitUntil: "networkidle" });
  const options = await page.locator("#layout option").evaluateAll((os) => os.map((o) => o.value));
  check("console offers the cards layout from meta.layouts", options.includes("cards"), options.join(","));

  previous = await setLayout("cards");
  await page.goto(`${BASE}/admin/sliders/${SLIDER_ID}`, { waitUntil: "networkidle" });
  check("layout saved as cards", (await page.locator("#layout").inputValue()) === "cards");

  // ------------------------------------------------------------ motion on
  const open = async (reducedMotion) => {
    const ctx = await browser.newContext({ reducedMotion, viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(() => { try { sessionStorage.setItem("tw_splash", "1"); } catch {} });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await p.evaluate(() => document.querySelector("dialog[open]")?.close());
    const well = p.locator('section[aria-roledescription="carousel"]').first();
    await well.scrollIntoViewIfNeeded();
    return { ctx, p, well };
  };

  {
    const { ctx, p, well } = await open("no-preference");
    const cards = well.locator('button[aria-label^="Show slide"]');
    const n = await cards.count();
    check("cards rendered as buttons (3 real + peek)", n >= 3, String(n));
    const labels = await cards.evaluateAll((bs) => bs.map((b) => [b.getAttribute("aria-label"), b.tabIndex, b.getAttribute("aria-hidden")]));
    check("first three cards are focusable, the peek is not", labels.slice(0, 3).every((l) => l[1] === 0) && (n < 4 || labels[3][1] === -1), JSON.stringify(labels));
    check("labels name the slide", labels[0][0].startsWith("Show slide 2"), labels[0][0]);

    const noText = await cards.evaluateAll((bs) => bs.every((b) => b.textContent.trim() === ""));
    check("cards carry no text (nothing for the contrast check to grade)", noText);

    // Tab order from the first card: the two other real cards, then the
    // arrows — the peek is skipped. (The cards precede the arrows in the DOM,
    // so that is where reading order puts them.)
    await cards.nth(0).focus();
    const reached = [await p.evaluate(() => document.activeElement?.getAttribute("aria-label"))];
    for (let i = 0; i < 3; i++) {
      await p.keyboard.press("Tab");
      reached.push(await p.evaluate(() => document.activeElement?.getAttribute("aria-label")));
    }
    check("Tab walks card 1, 2, 3 then Previous — the peek is skipped",
      reached.slice(0, 3).every((l) => l?.startsWith("Show slide")) && reached[3] === "Previous slide", reached.join(" | "));

    // Card 1's translate before, then press card 2 and watch card 1 re-slot.
    const second = cards.nth(1);
    const secondLabel = await second.getAttribute("aria-label");
    const targetIdx = Number(secondLabel.match(/slide (\d+)/)[1]);
    const thirdBefore = await cards.nth(2).evaluate((el) => getComputedStyle(el).translate);
    const thirdLabel = await cards.nth(2).getAttribute("aria-label");

    await second.click();
    // Sample the promoted media's transform and the third card's translate per frame.
    const samples = await p.evaluate(async (label) => {
      const out = [];
      for (let i = 0; i < 24; i++) {
        await new Promise(requestAnimationFrame);
        const media = document.querySelector('section[aria-roledescription="carousel"] [aria-roledescription="slide"]');
        const card = document.querySelector(`button[aria-label="${label}"]`);
        out.push({
          t: media ? getComputedStyle(media).transform : null,
          anims: media ? media.getAnimations().length : -1,
          card: card ? getComputedStyle(card).translate : null,
        });
      }
      return out;
    }, thirdLabel);
    const midFlight = samples.filter((s) => s.t && s.t !== "none" && s.t !== "matrix(1, 0, 0, 1, 0, 0)");
    check("promoted picture's transform sampled mid-flight (FLIP running)", midFlight.length > 0, `${midFlight.length}/24 frames`);
    check("exactly one animation on the promoted picture while it runs", samples.some((s) => s.anims === 1) && !samples.some((s) => s.anims > 1), samples.map((s) => s.anims).join(""));
    const moved = samples.map((s) => s.card).filter((v) => v && v !== thirdBefore);
    check("the card behind it re-slots by translate (transition sampled)", moved.length > 0, `${thirdBefore} -> ${samples.at(-1).card}`);

    await p.waitForTimeout(800);
    const after = await p.evaluate(() => {
      const media = document.querySelector('section[aria-roledescription="carousel"] [aria-roledescription="slide"]');
      return { anims: media.getAnimations().length, t: getComputedStyle(media).transform, label: media.getAttribute("aria-label") };
    });
    check("settled: no animation left, identity transform, slide label moved", after.anims === 0 && (after.t === "none" || after.t === "matrix(1, 0, 0, 1, 0, 0)") && after.label.startsWith(`${targetIdx} of`), JSON.stringify(after));
    const live = await well.locator("p.sr-only[aria-live]").textContent();
    check("live region announces the new slide", live.trim() === `Slide ${targetIdx} of ${await p.evaluate(() => document.querySelectorAll('section[aria-roledescription="carousel"] button[aria-label^="Show slide"]').length) + 1}`, live.trim());

    // Interrupt: press two cards in quick succession; one animation must remain.
    await cards.nth(0).click();
    await p.waitForTimeout(120);
    await cards.nth(0).click();
    await p.waitForTimeout(50);
    const running = await p.evaluate(() => document.querySelector('section[aria-roledescription="carousel"] [aria-roledescription="slide"]').getAnimations().length);
    check("a second press mid-flight leaves exactly one running animation", running === 1, String(running));

    // No overflow from the peek card: the page must not scroll horizontally.
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("no horizontal overflow from the peek card", overflow === 0, `${overflow}px`);
    await ctx.close();
  }

  // ----------------------------------------------------------- motion off
  {
    const { ctx, p, well } = await open("reduce");
    const cards = well.locator('button[aria-label^="Show slide"]');
    await cards.nth(1).click();
    const st = await p.evaluate(async () => {
      await new Promise(requestAnimationFrame);
      const media = document.querySelector('section[aria-roledescription="carousel"] [aria-roledescription="slide"]');
      return { anims: media.getAnimations().length, t: getComputedStyle(media).transform, label: media.getAttribute("aria-label") };
    });
    check("reduce: instant swap, no animation", st.anims === 0 && (st.t === "none" || st.t === "matrix(1, 0, 0, 1, 0, 0)") && st.label.startsWith("3 of"), JSON.stringify(st));
    await ctx.close();
  }

  // ------------------------------------------------------------- phone
  {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 640 } });
    await ctx.addInitScript(() => { try { sessionStorage.setItem("tw_splash", "1"); } catch {} });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await p.evaluate(() => document.querySelector("dialog[open]")?.close());
    const geo = await p.evaluate(() => {
      const well = document.querySelector('section[aria-roledescription="carousel"]');
      const cap = well.querySelector('[aria-roledescription="slide"] ~ div');
      const cards = [...well.querySelectorAll('button[aria-label^="Show slide"]')].slice(0, 3).map((b) => b.getBoundingClientRect());
      const capR = cap.getBoundingClientRect();
      const wellR = well.getBoundingClientRect();
      const heading = cap.querySelector("p");
      const headR = heading ? heading.getBoundingClientRect() : null;
      return { capBottom: capR.bottom, cardTop: Math.min(...cards.map((r) => r.top)), sizes: cards.map((r) => [Math.round(r.width), Math.round(r.height)]), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, wellTop: wellR.top, wellH: wellR.height, headTop: headR?.top ?? null };
    });
    check("320px: caption box ends above the card row", geo.capBottom <= geo.cardTop + 0.5, `caption bottom ${geo.capBottom.toFixed(1)} vs cards top ${geo.cardTop.toFixed(1)}`);
    check("320px: the heading is inside the well, not clipped off the top", geo.headTop !== null && geo.headTop >= geo.wellTop, `heading top ${geo.headTop?.toFixed(1)} vs well top ${geo.wellTop.toFixed(1)} (well ${geo.wellH.toFixed(0)}px tall)`);
    check("320px: cards are at least 64px (tap targets)", geo.sizes.every(([w, h]) => w >= 64 && h >= 64), JSON.stringify(geo.sizes));
    check("320px: no horizontal overflow", geo.overflow === 0, `${geo.overflow}px`);
    await ctx.close();
  }
} finally {
  if (previous !== null) {
    await setLayout(previous);
    console.log(`\nhero layout restored to "${previous}"`);
  }
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
