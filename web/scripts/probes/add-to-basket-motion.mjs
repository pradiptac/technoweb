import { chromium } from "playwright";

/**
 * Measures the product page's four-stage "Add to basket"
 * (`components/store/add-to-basket-button.tsx`, `.add-basket` in
 * `globals.css`).
 *
 *   node scripts/probes/add-to-basket-motion.mjs
 *   BASE=http://localhost:3000 SLUG=lenovo-thinkpad-e14 node scripts/probes/add-to-basket-motion.mjs
 *
 * `SLUG` defaults to the first product the API lists at `${BASE}`'s API
 * (read from the page's own store index if unset). No credentials: the
 * shop is public, and the press adds one line to a throwaway basket in this
 * browser context — the same thing `npm run audit` does before `/checkout`.
 *
 * Checks, each on a computed value sampled mid-flight rather than on a
 * class name: (1) at rest the arrow's `translate` is zero and the cart
 * track's is too; (2) hovering the pill moves the arrow — a sample
 * strictly between 0 and 4px is caught mid-transition, and it settles at
 * 4px; (3) pressing fades the idle label — a sample of its opacity strictly
 * between 0 and 1 within ~100ms of the stage's first painted frame, with
 * the click-to-commit and commit-to-paint gaps printed — and the track's
 * `translate` leaves zero; (4) the success stage arrives: the control is an
 * `<a href="/cart">`, its visible text reads "Added to basket", and the
 * green fill and the check's disc are painted; (5) 3.5s later the idle
 * `<button>` is back with "Add to basket" and the arrow at rest; (6) the
 * page adds no horizontal scroll at any point; (7) no page error and no
 * `console.error` — a hydration warning included — through the four
 * stages, which `npm run audit` never presses through; (8) under
 * `prefers-reduced-motion: reduce` a press still reaches the success stage
 * and nothing in the pill is animating.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const px = (t) => (t === "none" ? 0 : parseFloat(t));

// The site popup can open over the pill after its own delay; close any
// dialog the moment it opens. And an audit is not a first visit.
const quiet = (p) => p.addInitScript(() => {
  try { sessionStorage.setItem("tw_splash", "1"); } catch {}
  // `document`, not `documentElement`: an init script runs before the root
  // element exists, and the observer would throw on a null target.
  new MutationObserver(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()))
    .observe(document, { attributes: true, subtree: true, attributeFilter: ["open"] });
});

async function slug() {
  if (process.env.SLUG) return process.env.SLUG;
  const p = await browser.newPage();
  await quiet(p);
  await p.goto(`${BASE}/store`, { waitUntil: "load", timeout: 120000 });
  const href = await p.locator('a[href^="/store/products/"]').first().getAttribute("href");
  await p.close();
  return href.split("/store/products/")[1].split(/[?#]/)[0];
}

const SLUG = await slug();
const url = `${BASE}/store/products/${SLUG}`;
console.log(`probing ${url}`);

async function run(reducedMotion) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion });
  const page = await context.newPage();
  await quiet(page);
  // The audit never sees the pressed stages, so a hydration warning or an
  // error thrown by the swap between the two elements is caught here.
  const logged = [];
  page.on("pageerror", (e) => logged.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") logged.push(`console.error: ${m.text().split("\n")[0]}`); });
  await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
  const pill = page.locator(".add-basket").first();
  await pill.waitFor({ timeout: 10000 });
  await pill.scrollIntoViewIfNeeded();
  const noScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

  const read = () => pill.evaluate((el) => {
    const g = (sel, prop) => getComputedStyle(el.querySelector(sel))[prop];
    return {
      tag: el.tagName.toLowerCase(),
      href: el.getAttribute("href"),
      stage: el.dataset.stage,
      bg: getComputedStyle(el).backgroundColor,
      arrow: g(".add-basket__arrow", "translate"),
      track: g(".add-basket__track", "translate"),
      idle: g(".add-basket__label-idle", "opacity"),
      added: g(".add-basket__label-added", "opacity"),
      disc: g(".add-basket__disc", "opacity"),
      discScale: g(".add-basket__disc", "scale"),
      fill: g(".add-basket__fill", "clipPath"),
      animating: el.getAnimations({ subtree: true }).filter((a) => a.playState === "running").length,
      // What is actually readable: the label at full opacity. `innerText`
      // alone would list both labels, since opacity hides nothing from it.
      text: [...el.querySelectorAll(".add-basket__label")]
        .filter((n) => getComputedStyle(n).opacity === "1")
        .map((n) => n.textContent.trim()).join(" "),
    };
  });

  if (reducedMotion === "reduce") {
    const before = await read();
    await pill.click();
    const arrived = await page.waitForFunction(() => {
      const el = document.querySelector(".add-basket");
      return el?.tagName === "A" && el.dataset.stage === "added";
    }, null, { timeout: 15000 }).then(() => true).catch(() => false);
    const after = await read();
    ok(before.tag === "button" && before.stage === "idle", `reduce: idle button first (${before.tag}, ${before.stage})`);
    ok(arrived && after.href === "/cart" && /Added to basket/.test(after.text), `reduce: success stage still arrives (${after.tag} ${after.href} "${after.text}")`);
    ok(after.animating === 0, `reduce: nothing animating in the pill (${after.animating} running)`);
    ok(after.disc === "1" && after.added === "1" && after.idle === "0", `reduce: disc ${after.disc}, added label ${after.added}, idle label ${after.idle}`);
    ok(await noScroll(), "reduce: no horizontal scroll");
    ok(logged.length === 0, `reduce: no page errors or console errors${logged.length ? ` (${logged.join("; ")})` : ""}`);
    await context.close();
    return;
  }

  // (1) at rest
  const rest = await read();
  ok(rest.tag === "button" && rest.stage === "idle" && px(rest.arrow) === 0 && px(rest.track) === 0,
    `at rest: ${rest.tag}[data-stage=${rest.stage}], arrow ${rest.arrow}, track ${rest.track}`);
  const restBg = rest.bg;

  // (2) hover — move the pointer on and sample the arrow per frame.
  const box = await pill.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const hover = await pill.evaluate((el) => new Promise((resolve) => {
    const arrow = el.querySelector(".add-basket__arrow");
    const out = [];
    const t0 = performance.now();
    const tick = () => {
      out.push(getComputedStyle(arrow).translate);
      if (performance.now() - t0 < 400) requestAnimationFrame(tick); else resolve(out);
    };
    tick();
  }));
  const hoverPx = hover.map(px);
  ok(hoverPx.some((v) => v > 0 && v < 4), `arrow mid-hover: a sample strictly between 0 and 4px (${[...new Set(hover)].join(" | ")})`);
  ok(hoverPx.at(-1) === 4, `arrow settles at 4px (${hover.at(-1)})`);

  // (3) press — sample the idle label's opacity and the track per frame from
  // inside the page, so the round trip does not eat the fade.
  const press = await pill.evaluate((el) => new Promise((resolve) => {
    const label = el.querySelector(".add-basket__label-idle");
    const track = el.querySelector(".add-basket__track");
    const out = [];
    const t0 = performance.now();
    el.click();
    const tick = () => {
      const p = document.querySelector(".add-basket");
      out.push({
        t: Math.round(performance.now() - t0),
        stage: p?.dataset.stage,
        opacity: label.isConnected ? getComputedStyle(label).opacity : null,
        track: track.isConnected ? getComputedStyle(track).translate : null,
      });
      if (performance.now() - t0 < 600) requestAnimationFrame(tick); else resolve(out);
    };
    tick();
  }));
  // The label's fade and the track's glide start on the same style recalc —
  // the first frame the browser paints after React commits `pending` — so
  // the window is anchored on that frame (the track leaving zero) rather
  // than on the click. Against `next dev` the click-to-commit and
  // commit-to-paint gaps run 30–130ms on a cold page (the Server Action is
  // serialised and the tree re-rendered uncompiled, and rAF is starved
  // meanwhile), which is the server's latency and not the control's; both
  // gaps are printed so a regression there is still visible.
  const pendingAt = press.find((s) => s.stage === "pending")?.t;
  const paintedAt = press.find((s) => s.stage === "pending" && s.track && px(s.track) !== 0)?.t ?? pendingAt;
  const early = press.filter((s) => paintedAt !== undefined && s.t <= paintedAt + 100 && s.opacity !== null).map((s) => Number(s.opacity));
  ok(pendingAt !== undefined && early.some((v) => v > 0 && v < 1),
    `idle label mid-fade within ~100ms of the stage's first painted frame (pending ${pendingAt}ms after the press, painted at ${paintedAt}ms; ${press.filter((s) => paintedAt !== undefined && s.t <= paintedAt + 100).map((s) => `${s.t}ms:${s.opacity}`).join(" ")})`);
  ok(pendingAt !== undefined, "the button reports data-stage=pending");
  ok(press.some((s) => s.track && s.track !== "none" && px(s.track) !== 0), `the cart's track leaves zero (${[...new Set(press.map((s) => s.track))].join(" | ")})`);

  // (4) success
  const arrived = await page.waitForFunction(() => {
    const el = document.querySelector(".add-basket");
    return el?.tagName === "A" && el.dataset.stage === "added";
  }, null, { timeout: 15000 }).then(() => true).catch(() => false);
  ok(arrived, "the success stage arrives");
  // Sample the disc mid-arrival before it settles.
  const discSamples = await pill.evaluate((el) => new Promise((resolve) => {
    const out = [];
    const t0 = performance.now();
    const tick = () => {
      const d = el.querySelector(".add-basket__disc");
      out.push(getComputedStyle(d).scale);
      if (performance.now() - t0 < 500) requestAnimationFrame(tick); else resolve(out);
    };
    tick();
  }));
  await page.waitForTimeout(400);
  const added = await read();
  ok(added.tag === "a" && added.href === "/cart", `the control is an <a href="/cart"> (${added.tag} ${added.href})`);
  ok(/Added to basket/.test(added.text), `it reads "Added to basket" ("${added.text}")`);
  ok(added.bg !== restBg, `the fill changed from brand (${restBg} -> ${added.bg})`);
  ok(added.disc === "1" && added.added === "1" && added.idle === "0", `disc ${added.disc}, added label ${added.added}, idle label ${added.idle}`);
  ok(discSamples.some((s) => s !== "none" && parseFloat(s) !== 1), `the check's disc scales in (${[...new Set(discSamples)].slice(0, 6).join(" | ")})`);
  ok(px(added.track) > 0, `the cart sits at the right end of its track (${added.track})`);
  ok(await noScroll(), "no horizontal scroll in the success stage");

  // (5) back to idle after the three seconds. The pointer leaves first, or
  // the fill read back is the hover's `brand-700` rather than rest.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(3500);
  const back = await read();
  ok(back.tag === "button" && back.stage === "idle" && back.text === "Add to basket",
    `idle again after 3.5s (${back.tag}[data-stage=${back.stage}] "${back.text}")`);
  ok(px(back.track) === 0 && back.idle === "1" && back.disc === "0", `cart back at the left, label ${back.idle}, disc ${back.disc}`);
  ok(back.bg === restBg, `the fill is brand again (${back.bg})`);
  ok(await noScroll(), "no horizontal scroll at rest");
  ok(logged.length === 0, `no page errors or console errors through all four stages${logged.length ? ` (${logged.join("; ")})` : ""}`);
  await context.close();
}

await run("no-preference");
await run("reduce");

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
