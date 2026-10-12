import { chromium } from "playwright";

/**
 * Measures Console 2.0's shell (docs/console-portal.md).
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/console-shell.mjs
 *
 * (1) The top bar carries an account menu button that opens, and closes with
 * Escape. (2) The sidebar folds to the rail, stays folded after a reload
 * with no expanded first frame (measured by an init script on the first
 * animation frame the nav exists in), and unfolds again. (3) With the rail
 * folded, a focused section icon opens its flyout and Escape closes it.
 * (4) The active pill's `translate` sampled mid-flight differs from both
 * ends. (5) Motion: Subtle stamps `html[data-console-motion]` and the pill
 * stops transitioning. (6) The dashboard has one h1, a hero band and no
 * horizontal overflow at 360 and 1280. (7) Nothing is logged.
 * Puts both preferences back.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
process.env.BASE = BASE; // shared.mjs signs in on 127.0.0.1 unless told
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
// The nav's width on the first frame it is painted in — a folded rail that
// flashes expanded first would read wide here.
await context.addInitScript(() => {
  const tick = () => {
    const n = document.querySelector("nav[aria-label='Admin sections']");
    if (n) { window.__navW0 = n.getBoundingClientRect().width; return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
const page = await context.newPage();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)); });

const { signInAsStaff } = await import("../shared.mjs");
await signInAsStaff(page);
const go = async (path = "/admin") => { await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 180000 }); await page.waitForTimeout(1500); };
await go();

// (1) Account menu
const account = page.locator("[data-account-menu] > button");
ok(await account.count() === 1, "account menu button present");
if (await account.count() === 1) {
  await account.click();
  ok(await account.getAttribute("aria-expanded") === "true", "account menu opens");
  await page.keyboard.press("Escape");
  ok(await account.getAttribute("aria-expanded") === "false", "Escape closes the account menu");
}

// (2) Fold persists, no expanded first frame
const nav = page.locator("nav[aria-label='Admin sections']");
const fold = page.getByRole("button", { name: /Fold the sidebar/ });
ok(await fold.count() === 1, "fold button present");
if (await fold.count() === 1) {
  await fold.click();
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => document.documentElement.dataset.consoleNav) === "rail", "folding stamps html[data-console-nav=rail]");
  await go();
  const first = await page.evaluate(() => window.__navW0 ?? null);
  const railWidth = (await nav.boundingBox())?.width ?? 999;
  ok(railWidth <= 80, `folded rail is narrow after reload (${Math.round(railWidth)}px)`);
  ok(first !== null && first <= 80, `no expanded first frame (${first === null ? "not measured" : Math.round(first)})`);

  // (3) Keyboard reaches a rail icon; flyout opens on focus, Escape closes
  const firstGroup = nav.locator("[data-rail-group] > button").first();
  await firstGroup.focus();
  await page.waitForTimeout(250);
  const flyout = nav.locator("[data-rail-group]").first().locator("[data-flyout]");
  ok(await flyout.isVisible(), "flyout opens when a rail icon has focus");
  // On top of the page, not under it: the sticky sidebar is its own stacking
  // context and once lost to the dashboard's hero (the client, 2026-10-12).
  const onTop = await flyout.evaluate((el) => {
    const r = el.querySelector("div")?.getBoundingClientRect();
    if (!r) return false;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 40));
    return Boolean(hit && el.contains(hit));
  });
  ok(onTop, "the flyout paints above the page content");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  ok(!(await flyout.isVisible()), "Escape closes the flyout");
  await page.getByRole("button", { name: /Unfold the sidebar/ }).click();
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => !document.documentElement.dataset.consoleNav), "unfolding clears the attribute");
}

// (4) Pill slides: sample mid-flight
await go("/admin/tickets");
const pill = nav.locator("[data-nav-pill]");
ok(await pill.count() === 1, "nav pill present");
if (await pill.count() === 1) {
  // Every frame's y from the click until it settles: a navigation on the dev
  // server takes an unknown time to commit, so a fixed-delay sample can land
  // before it starts. A glide shows at least one y strictly between the ends.
  await pill.evaluate((el) => {
    window.__pillYs = [];
    const t0 = performance.now();
    const tick = () => {
      // `translate` computes to "0px" for y = 0 and "0px 71px" otherwise.
      window.__pillYs.push(parseFloat(getComputedStyle(el).translate.split(" ")[1] ?? "0"));
      if (performance.now() - t0 < 4000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await nav.getByRole("link", { name: /^Dashboard$/ }).click();
  await page.waitForTimeout(4300);
  const ys = await page.evaluate(() => window.__pillYs);
  const start = ys[0], end = ys[ys.length - 1];
  const between = ys.some((y) => y > Math.min(start, end) + 0.5 && y < Math.max(start, end) - 0.5);
  ok(start !== end && between, `pill glides through a middle value (${start} → ${end}, ${new Set(ys).size} distinct)`);
}

// (5) Subtle stops the pill's transition
await go("/admin/profile");
const subtle = page.getByRole("radio", { name: /Subtle/ });
ok(await subtle.count() === 1, "Motion: Subtle choice present on Profile");
if (await subtle.count() === 1) {
  await subtle.check();
  ok(await page.evaluate(() => document.documentElement.dataset.consoleMotion) === "subtle", "Subtle stamps html[data-console-motion]");
  if (await pill.count() === 1) {
    const dur = await pill.evaluate((el) => getComputedStyle(el).transitionDuration);
    ok(/^0s/.test(dur), `Subtle: pill transition is 0s (${dur})`);
  }
  await page.getByRole("radio", { name: /Full/ }).check();
}

// (6) Dashboard structure and overflow
for (const width of [360, 1280]) {
  await page.setViewportSize({ width, height: 800 });
  await go("/admin");
  ok(await page.locator("h1").count() === 1, `${width}: exactly one h1`);
  ok(await page.locator("[data-hero-band]").count() === 1, `${width}: hero band present`);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(over <= 0, `${width}: no horizontal overflow (${over})`);
}

// (6b) The Activity panel, drawn for an administrator from the activity log
await page.setViewportSize({ width: 1280, height: 800 });
await go("/admin");
const activityRow = page.locator('[data-dashboard-row~="activity"]');
ok(await activityRow.count() === 1, "Activity panel on the dashboard");
ok(await activityRow.locator("ol li").count() >= 1, "Activity panel lists entries");

// (7) Console errors
ok(errors.length === 0, `nothing logged${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await page.evaluate(() => { localStorage.removeItem("tw_console_nav"); localStorage.removeItem("tw_console_motion"); });
await browser.close();
process.exit(failed ? 1 : 0);
