import { chromium } from "playwright";

/**
 * "Shop the videos" (0.140.0, docs/store.md "Product videos row"), end to end
 * through the real screens.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/store-videos.mjs
 *
 * It makes its own throwaway records — two published shop products whose names
 * begin `Videos probe` and a stamp, each with one YouTube video — through the
 * new-product form; it never touches a record it did not make. A run that
 * stops half-way leaves only those products, which the next run's first step
 * removes by name. The three settings it changes (the autoplay switch and
 * the two places it turns on) are read from the console first and put back in a
 * `finally`.
 *
 * What it checks, signed out in a fresh context (nothing is cached or cookied):
 *   1. /store draws the shelf with both probe tiles, each with its product
 *      under it (name linking to the product, price, an Add button), the
 *      heading an h2 and the names h3.
 *   2. **No request goes to any YouTube host before a press** — not
 *      youtube.com, not youtube-nocookie.com, not googlevideo.com, and never
 *      i.ytimg.com at any point.
 *   3. Pressing the first tile mounts the nocookie iframe for its id; pressing
 *      the second puts the first back to its poster (one plays at a time).
 *   4. The Add button on a tile adds to the basket (the toast, and the
 *      `/api/store/basket` read afterwards says one item).
 *   5. The product page carries a small "Watch" row, the page is not dynamic
 *      (its first byte comes with `x-nextjs-cache` — against a build; the dev
 *      server sends none and the check is skipped, and said so), and the same
 *      no-request-before-a-press rule holds there.
 *   6. The page builder offers a "Product videos" section and places it
 *      (nothing is saved), and the homepage draws the row once its switch
 *      is on.
 *   7. At 360, 768, 1280 and 1920 the page does not scroll sideways and the
 *      row's buttons are at least 24px; nothing is logged to the console.
 *   8. With autoplay on: no player before consent where the banner is in use
 *      (skipped, and said so, where it is not), a muted player mounts when a
 *      tile is on screen with at most four mounted, a visible Pause videos
 *      button unmounts them all, and a press gives that tile sound.
 *
 * Carries no credential: sign-in is `signInAsStaff` from scripts/shared.mjs.
 * Run it on a development install.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const T = 180000;
const STAMP = Date.now().toString(36);
const PREFIX = "Videos probe";
const NAMES = [`${PREFIX} ${STAMP} one`, `${PREFIX} ${STAMP} two`];
// Eleven characters each; Big Buck Bunny is the project's own placeholder video.
const IDS = ["aqz-KE-bpKQ", "dQw4w9WgXcQ"];
const YOUTUBE_HOST = /(^|\.)(youtube\.com|youtube-nocookie\.com|googlevideo\.com|ytimg\.com|youtu\.be)$/;

const { signInAsStaff } = await import("../shared.mjs");

const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const note = (l) => console.log(`skip ${l}`);

const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();
const problems = [];
const watch = (p, label) => {
  p.on("console", (m) => {
    if (m.type() !== "error" && m.type() !== "warning") return;
    // Dev only (CLAUDE.md, "How the audits behave").
    if (m.text().includes("was preloaded using link preload but not used")) return;
    // YouTube's own player, inside its frame, asks a headless browser for a
    // WebGPU adapter and says so twice. Not this site's code.
    if (/requestAdapter\(\)|No available adapters/.test(m.text())) return;
    try { if (YOUTUBE_HOST.test(new URL(m.location().url).hostname)) return; } catch { /* no location */ }
    problems.push(`${label} ${m.type()} at ${p.url().replace(BASE, "")}: ${m.text().slice(0, 400)}`);
  });
  p.on("pageerror", (e) => problems.push(`${label} pageerror: ${e.message.slice(0, 300)}`));
};
watch(page, "staff");

const settle = async (p) => { await p.waitForLoadState("load", { timeout: T }); await p.waitForTimeout(1500); };

/* ------------------------------------------------------------- the console */

/** Sets a `SettingSwitch` to the wanted state; the real checkbox is overlaid at zero opacity, so force. */
async function setSwitch(id, want) {
  const box = page.locator(`#${id}`);
  if ((await box.isChecked()) !== want) await box.setChecked(want, { force: true });
}

async function readVideoSettings() {
  await page.goto(`${BASE}/admin/store/videos`, { waitUntil: "load", timeout: T });
  await page.waitForSelector("h1", { timeout: T });
  await settle(page);
  return {
    "videos-shop": await page.locator("#videos-shop").isChecked(),
    "videos-product": await page.locator("#videos-product").isChecked(),
    "videos-others": await page.locator("#videos-others").isChecked(),
    "videos-home": await page.locator("#videos-home").isChecked(),
    "videos-autoplay": await page.locator("#videos-autoplay").isChecked(),
  };
}

async function writeVideoSettings(want) {
  await page.goto(`${BASE}/admin/store/videos`, { waitUntil: "load", timeout: T });
  await page.waitForSelector("h1", { timeout: T });
  await settle(page);
  for (const [id, state] of Object.entries(want)) await setSwitch(id, state);
  await page.getByRole("button", { name: "Save product videos" }).click();
  await page.getByText("Product videos saved", { exact: false }).first().waitFor({ timeout: T });
}

async function removeProbeProducts() {
  await page.goto(`${BASE}/admin/store/products?q=${encodeURIComponent(PREFIX)}`, { waitUntil: "load", timeout: T });
  await settle(page);
  const links = await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")).filter((h) => /^\/admin\/store\/products\/\d+$/.test(h ?? "")));
  for (const href of [...new Set(links)]) {
    await page.goto(`${BASE}${href}`, { waitUntil: "load", timeout: T });
    await settle(page);
    const name = await page.locator("#name").inputValue().catch(() => "");
    if (!name.startsWith(PREFIX)) continue;
    const del = page.getByRole("button", { name: /^Delete/ }).first();
    if ((await del.count()) === 0) continue;
    // The form's Delete asks through `window.confirm`, which Playwright
    // dismisses — cancels — unless told otherwise.
    page.once("dialog", (dialog) => dialog.accept());
    await Promise.all([
      page.waitForURL(/\/admin\/store\/products(\?|$)/, { timeout: T }),
      del.click(),
    ]);
  }
}

async function createProduct(name, youtubeId) {
  await page.goto(`${BASE}/admin/store/products/new`, { waitUntil: "load", timeout: T });
  await page.waitForSelector("#name", { timeout: T });
  await settle(page);
  await page.fill("#name", name);
  await page.selectOption("#status", "published");
  // The price and the stock switch are on the Selling tab; a hidden panel cannot be typed into.
  await page.getByRole("tab", { name: "Selling" }).click();
  await page.fill("#price", "999");
  // Untracked, so the Add button is never "Sold out" on a product with no stock.
  await page.selectOption("#track_stock", "0").catch(() => {});
  await page.getByRole("tab", { name: "Media" }).click();
  await page.getByRole("button", { name: "Add a video" }).click();
  await page.getByLabel("Video 1 YouTube link").fill(`https://www.youtube.com/watch?v=${youtubeId}`);
  await page.getByLabel("Video 1 title").fill(`${name} — demo`);
  await Promise.all([
    page.waitForURL(/\/admin\/store\/products\/\d+/, { timeout: T }),
    page.getByRole("button", { name: "Create product" }).click(),
  ]);
  const id = Number(page.url().match(/\/admin\/store\/products\/(\d+)/)?.[1]);
  ok(Number.isInteger(id) && id > 0, `created ${name} (#${id})`);
  return id;
}

/* ------------------------------------------------------------ the public site */

/** Watches every request a context makes; the answer to "did anything go to YouTube". */
function trackRequests(p) {
  const seen = [];
  p.on("request", (r) => {
    try { seen.push(new URL(r.url()).hostname); } catch { /* data: and blob: URLs have no host */ }
  });
  return { youtube: () => seen.filter((h) => YOUTUBE_HOST.test(h)), ytimg: () => seen.filter((h) => /ytimg\.com$/.test(h)), all: seen };
}

async function openPublic(width, path, { before } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
  const p = await ctx.newPage();
  watch(p, `public@${width}`);
  const tracker = trackRequests(p);
  const res = await p.goto(`${BASE}${path}`, { waitUntil: "load", timeout: T });
  await p.waitForTimeout(2000);
  if (before) await before(p);
  return { ctx, p, tracker, res };
}

const tileFor = (p, name) => p.locator("[data-video-tile]").filter({ hasText: name });

async function checkLayout(p, width, label) {
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(over <= 0, `${label} @${width}: no horizontal overflow (${over}px)`);
  const small = await p.locator("[data-video-shelf] button, [data-video-shelf] a").evaluateAll((els) =>
    els.filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && Math.min(r.width, r.height) < 24 && !e.closest("[aria-hidden='true']") && e.getAttribute("tabindex") !== "-1";
    }).length);
  ok(small === 0, `${label} @${width}: every control in the row is at least 24px (${small} smaller)`);
}

/* --------------------------------------------------------------------- the run */

await signInAsStaff(page);
await removeProbeProducts();
const original = await readVideoSettings();
let pageId = null;
const productIds = [];

try {
  await writeVideoSettings({ "videos-shop": true, "videos-product": true, "videos-others": true, "videos-home": false, "videos-autoplay": false });
  for (const [i, name] of NAMES.entries()) productIds.push(await createProduct(name, IDS[i]));

  /* 1–4: the shop front. */
  {
    const { ctx, p, tracker } = await openPublic(1280, "/store");
    const shelf = p.locator("[data-video-shelf]").first();
    ok((await shelf.count()) === 1, "/store draws the shelf");
    ok((await shelf.locator("h2").count()) === 1, "/store: the shelf's heading is an h2");
    for (const name of NAMES) {
      const tile = tileFor(p, name);
      ok((await tile.count()) === 1, `/store: a tile for ${name}`);
      ok((await tile.locator("h3 a").innerText()) === name, `/store: ${name} is the tile's h3 and links to the product`);
      ok(/₹/.test(await tile.innerText()), `/store: ${name} shows its price`);
      ok((await tile.getByRole("button", { name: new RegExp(`^Add ${name}`) }).count()) === 1, `/store: ${name} has its Add button`);
    }
    ok(tracker.youtube().length === 0, `/store: nothing requested from a YouTube host before a press (${[...new Set(tracker.youtube())].join(", ") || "none"})`);
    ok(await p.locator("iframe").count() === 0, "/store: no iframe before a press");

    await tileFor(p, NAMES[0]).getByRole("button", { name: /^Play the video/ }).click();
    const frame = tileFor(p, NAMES[0]).locator("iframe");
    await frame.waitFor({ timeout: T });
    const src = (await frame.getAttribute("src")) ?? "";
    ok(src.startsWith(`https://www.youtube-nocookie.com/embed/${IDS[0]}`), `/store: the press mounts the nocookie iframe (${src.slice(0, 70)})`);

    await tileFor(p, NAMES[1]).getByRole("button", { name: /^Play the video/ }).click();
    await tileFor(p, NAMES[1]).locator("iframe").waitFor({ timeout: T });
    ok((await tileFor(p, NAMES[0]).locator("iframe").count()) === 0, "/store: starting the second tile put the first back to its poster");
    ok((await p.locator("iframe").count()) === 1, "/store: exactly one player at a time");
    ok(tracker.ytimg().length === 0, "/store: i.ytimg.com was never contacted");

    // The cart button: the toast, and the basket read afterwards.
    // Asked for after the toast, never by waiting on "the next basket read":
    // the strip's own read on mount can still be in flight and answers empty.
    await tileFor(p, NAMES[0]).getByRole("button", { name: new RegExp(`^Add ${NAMES[0]}`) }).click();
    await p.getByText("Added to your basket", { exact: false }).first().waitFor({ timeout: T });
    const body = await p.evaluate(() => fetch("/api/store/basket").then((r) => (r.status === 204 ? null : r.json())).catch(() => null));
    ok(Number(body?.data?.item_count) >= 1, `/store: the Add button put one in the basket (item_count ${body?.data?.item_count})`);
    await ctx.close();
  }

  /* 5: the product page. */
  {
    const { ctx, p, tracker, res } = await openPublic(1280, `/store/products/${NAMES[0].toLowerCase().replace(/[^a-z0-9]+/g, "-")}`);
    ok(res?.status() === 200, "the product page answers 200");
    // `next dev` renders every request and never sends the header, so the
    // cache is only checkable against a build (`npm run start`).
    const cache = res?.headers()["x-nextjs-cache"];
    if (cache === undefined) console.log("skip the product page's cache header: the dev server sends none — check against a build");
    else ok(/HIT|MISS|STALE/i.test(cache), `the product page is cached, not rendered per request (x-nextjs-cache: ${cache})`);
    const watchRow = p.locator("[data-video-shelf]").filter({ has: p.getByRole("heading", { name: "Watch" }) });
    ok((await watchRow.count()) === 1, "the product page draws the small Watch row");
    ok((await watchRow.locator("[data-video-tile] h3").first().innerText()) === NAMES[0], "…and this product's own video leads it");
    ok(tracker.youtube().length === 0, "the product page: nothing requested from a YouTube host before a press");
    await checkLayout(p, 1280, "product page");
    await ctx.close();
  }

  /* 6a: a builder page. */
  {
    // The console half only: the section is offered and can be placed. Nothing
    // is saved — the page is opened in a tab of its own and closed, so the
    // form's "leave without saving?" guard never meets the run. What a saved
    // section draws is `StoreVideosTest`'s (the presenter) and the shelf's
    // own checks above (one component draws all four placements).
    const tab = await context.newPage();
    watch(tab, "builder");
    await tab.goto(`${BASE}/admin/pages/new`, { waitUntil: "load", timeout: T });
    await tab.waitForSelector("#title", { timeout: T });
    await tab.waitForTimeout(1500);
    await tab.fill("#title", `${PREFIX} ${STAMP} page`);
    await tab.selectOption("#template", "builder");
    await tab.getByRole("tab", { name: /Builder/ }).first().click();
    await tab.getByRole("button", { name: "Add a section", exact: true }).first().click();
    const picker = tab.locator("dialog[open]");
    await picker.waitFor({ timeout: T });
    const option = picker.getByRole("button", { name: /Product videos/ }).first();
    ok((await option.count()) === 1, "the builder's Add a section offers Product videos");
    if ((await option.count()) === 1) {
      await option.click();
      await tab.waitForTimeout(800);
      ok((await tab.getByText("Product videos", { exact: false }).count()) >= 1, "…and placing it adds its card to the page's sections");
    }
    await tab.close();
  }

  /* 6b + 7: the homepage with its switch on, then the four widths. */
  await writeVideoSettings({ "videos-shop": true, "videos-product": true, "videos-others": true, "videos-home": true, "videos-autoplay": false });
  for (const [path, label] of [["/", "homepage"], ["/store", "/store"]]) {
    for (const width of [360, 768, 1280, 1920]) {
      const { ctx, p } = await openPublic(width, path);
      if (width === 1280 && path === "/") ok((await p.locator("[data-video-shelf]").count()) === 1, "the homepage draws the shelf once its switch is on");
      if ((await p.locator("[data-video-shelf]").count()) > 0) await checkLayout(p, width, label);
      await ctx.close();
    }
  }

  /* 8: autoplay. */
  await writeVideoSettings({ "videos-shop": true, "videos-product": true, "videos-others": true, "videos-home": false, "videos-autoplay": true });
  {
    const bannerInUse = await (async () => {
      const { ctx, p } = await openPublic(1280, "/store");
      const n = await p.locator("[data-cookie-banner]").count();
      await ctx.close();
      return n > 0;
    })();

    const { ctx, p, tracker } = await openPublic(1280, "/store", {
      // A tile plays once 60% of it is on screen, so put one in the middle of
      // the window: "scroll the row into view if needed" leaves a row that is
      // already peeking in exactly where it was, under the threshold.
      before: async (q) => {
        await q.locator("[data-video-shelf] [data-video-tile]").first().evaluate((el) => el.scrollIntoView({ block: "center" }));
        await q.waitForTimeout(2500);
      },
    });
    if (bannerInUse) {
      ok((await p.locator("[data-video-shelf] iframe").count()) === 0 && tracker.youtube().length === 0, "autoplay waits for the visitor's consent where the banner is in use");
      await p.getByRole("button", { name: /^Accept/ }).first().click();
      await p.waitForTimeout(2000);
    } else {
      note("autoplay consent wait: no cookie banner on this install (no analytics id), so autoplay needs none");
    }
    const frames = p.locator("[data-video-shelf] iframe");
    ok((await frames.count()) >= 1 && (await frames.count()) <= 4, `autoplay: a muted player mounts when a tile is on screen, at most four (${await frames.count()})`);
    ok(/mute=1/.test((await frames.first().getAttribute("src")) ?? ""), "autoplay: the player is muted");
    const pause = p.getByRole("button", { name: "Pause videos" });
    ok((await pause.count()) === 1 && (await pause.boundingBox())?.height >= 24, "autoplay: a visible Pause videos button, 24px or more");
    await pause.click();
    await p.waitForTimeout(500);
    ok((await frames.count()) === 0, "autoplay: Pause unmounts every player");
    await p.getByRole("button", { name: "Resume videos" }).click();
    await p.waitForTimeout(1000);
    await tileFor(p, NAMES[0]).getByRole("button", { name: /^Play the video with sound/ }).click().catch(() => {});
    const loud = tileFor(p, NAMES[0]).locator("iframe");
    if ((await loud.count()) > 0) ok(!/mute=1/.test((await loud.getAttribute("src")) ?? ""), "autoplay: pressing a tile gives it the full player with sound");
    await ctx.close();
  }
} finally {
  // Put everything back: the settings, then the products and the page it made.
  await writeVideoSettings({
    "videos-shop": original["videos-shop"], "videos-product": original["videos-product"], "videos-others": original["videos-others"],
    "videos-home": original["videos-home"], "videos-autoplay": original["videos-autoplay"],
  }).catch((e) => console.log(`could not put the settings back: ${e.message}`));
  await removeProbeProducts().catch((e) => console.log(`could not remove the probe products: ${e.message}`));
  if (pageId) {
    await page.goto(`${BASE}/admin/pages/${pageId}`, { waitUntil: "load", timeout: T }).catch(() => {});
    const del = page.getByRole("button", { name: /^Delete/ }).first();
    if ((await del.count()) > 0) {
      await del.click();
      const confirm = page.locator("dialog[open]").getByRole("button", { name: /^(Delete|Yes)/ });
      if ((await confirm.count()) > 0) await confirm.first().click();
    }
  }
}

ok(problems.length === 0, `nothing was logged to the console${problems.length ? `:\n  ${problems.slice(0, 8).join("\n  ")}` : ""}`);
await browser.close();
console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
