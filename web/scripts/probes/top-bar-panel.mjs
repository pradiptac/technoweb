import { chromium } from "playwright";

/**
 * Measures the top bar's dropdown panel (`components/layout/top-bar-panel.tsx`)
 * against a live site whose `topbar` menu has an item with children — the
 * "Customer zone" shape: tabs down the left, cards beside them.
 *
 *   node scripts/probes/top-bar-panel.mjs            # BASE defaults to localhost:3000
 *
 * What it checks, in order, and why each is measured rather than read:
 *
 *   1. Hidden at rest — computed `visibility: hidden`, and the closed panel
 *      adds nothing to `documentElement.scrollWidth` at 1280 and 360 (the
 *      audit's zero-tolerance overflow check).
 *   2. Opens on hover, and opens on keyboard focus with no pointer at all.
 *   3. Hovering a tab switches the pane: the first card's label changes.
 *   4. Clicking a card closes the panel (`data-closed`) and the page navigates.
 *   5. The panel's right edge never passes the viewport's — it is anchored
 *      `right-0` because the host sits at the right edge, and a `left-0`
 *      panel there is mostly off-screen.
 *
 * No credential: the top bar is public. It exits 1 on the first failed check.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";

/**
 * A published popup is a modal `<dialog>` in the top layer and intercepts every
 * pointer event beneath it — the trap `audit.mjs` records for `/checkout`. It
 * opens after its own delay, so this waits it out rather than checking once.
 */
async function dismissPopup(page) {
  const dialog = page.locator("dialog[open]").first();
  // Up to eight seconds for one to arrive — under `next dev` hydration can
  // land late and the popup's own delay runs after it; a site with none
  // costs the wait.
  await dialog.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
  if (await dialog.count() === 0) return;
  await page.keyboard.press("Escape").catch(() => {});
  await dialog.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
}

/**
 * Polls the panel's computed `visibility` until it reads `want`, up to a
 * second, and returns how long that took (or -1). A single sample after a
 * fixed wait measured the transition mid-flight under `next dev`, where the
 * 140ms exit was observed landing anywhere between 200 and 500ms — the
 * "value read on the same tick is the start state" trap CLAUDE.md records
 * for the nav underline.
 */
async function visibilityBecomes(panel, want) {
  const started = Date.now();
  while (Date.now() - started < 1000) {
    if ((await panel.evaluate((el) => getComputedStyle(el).visibility)) === want) return Date.now() - started;
    await panel.page().waitForTimeout(25);
  }
  return -1;
}

const browser = await chromium.launch();
let failed = 0;
const ok = (cond, label) => { console.log(`${cond ? "ok  " : "FAIL"} ${label}`); if (!cond) failed++; };

for (const width of [1280, 360]) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  // `load`, not `networkidle`: under `next dev` the network is rarely quiet
  // for long after a recompile, and this probe measures the panel, not the page.
  await page.goto(BASE, { waitUntil: "load", timeout: 120000 });
  await dismissPopup(page);

  // `div` hosts are the bar's; the header's mega-menu hosts are `<li>`s.
  const host = page.locator("div[data-panel-host].group").last();
  if (!(await host.count())) {
    console.error("No top-bar item carries a panel: give one children in /admin/menus first.");
    process.exit(2);
  }
  const trigger = host.locator("> a");
  const panel = host.locator("> div");

  console.log(`--- ${width}px`);
  ok((await panel.evaluate((el) => getComputedStyle(el).visibility)) === "hidden", "hidden at rest");
  ok((await page.evaluate(() => document.documentElement.scrollWidth)) === width, "closed panel adds no horizontal scroll");

  if (width === 1280) {
    // Once more, in case one opened between the first dismissal and now.
    await dismissPopup(page);
    await trigger.hover();
    let ms = await visibilityBecomes(panel, "visible");
    ok(ms >= 0, `opens on hover (${ms}ms)`);
    const box = await panel.boundingBox();
    ok(box && box.x >= 0 && box.x + box.width <= width, `panel inside the viewport (x=${Math.round(box?.x ?? -1)}, right=${Math.round((box?.x ?? 0) + (box?.width ?? 0))})`);
    ok((await page.evaluate(() => document.documentElement.scrollWidth)) === width, "open panel adds no horizontal scroll");

    // A tab is a link, or a `<button>` when it is a heading with no page of its own.
    const tabs = panel.locator("ul:first-child > li > :is(a, button)");
    const tabCount = await tabs.count();
    ok(tabCount >= 2, `tab column present (${tabCount} tabs)`);
    const firstCard = () => panel.locator("ul:last-child a").first().innerText();
    const before = await firstCard();
    await tabs.nth(1).hover();
    await page.waitForTimeout(100);
    const after = await firstCard();
    ok(before !== after, `hovering the second tab switches the pane ("${before.split("\n")[0]}" → "${after.split("\n")[0]}")`);
    ok((await tabs.nth(1).getAttribute("aria-current")) === "true", "active tab carries aria-current");

    // Keyboard: move the pointer away, close, then Tab into the trigger.
    await page.mouse.move(10, 400);
    ms = await visibilityBecomes(panel, "hidden");
    ok(ms >= 0, `closes when the pointer leaves (${ms}ms)`);
    await trigger.focus();
    ms = await visibilityBecomes(panel, "visible");
    ok(ms >= 0, `opens on keyboard focus (${ms}ms)`);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    ok((await panel.evaluate((el) => getComputedStyle(el).visibility)) === "visible", "stays open while focus is inside it");

    // Navigate through a card and confirm the panel closed behind the click.
    // An internal card: an external one leaves the site, and a new-tab one
    // leaves this page where it is. The first tab is hovered again so the
    // pane is the one the first tab shows.
    await trigger.hover();
    await page.waitForTimeout(150);
    await tabs.first().hover();
    await page.waitForTimeout(150);
    const card = panel.locator('ul:last-child a[href^="/"]:not([target])').first();
    if (await card.count() === 0) {
      console.log("skip navigation check: no internal card under the first tab");
    } else {
      const href = await card.getAttribute("href");
      // `data-closed` is stamped on the host synchronously by the click, and
      // the destination may not carry the marketing chrome at all (a portal
      // page), so it is recorded at the click rather than read afterwards.
      // On `window`, which bubbles after React's root-delegated handler has
      // stamped the host; a listener on the host itself runs before it.
      await host.evaluate((el) => window.addEventListener("click", () => sessionStorage.setItem("tw-probe-closed", el.dataset.closed ?? "unset"), { once: true }));
      await Promise.all([page.waitForURL((u) => u.pathname !== "/", { timeout: 30000 }), card.click()]);
      ok(true, `card navigated to ${href}`);
      ok((await page.evaluate(() => sessionStorage.getItem("tw-probe-closed"))) === "", "panel marked closed on the click that navigated");
    }
  }

  await page.close();
}

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
