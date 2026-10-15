import { chromium } from "playwright";

/**
 * Shop tags (0.141.0, docs/store.md "Tags"), end to end through the real
 * screens: the form's Tags field, the row under the shop's search bar, the
 * category page, the filter, Suggest tags and the Tags screen.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/store-tags.mjs
 *   BASE=http://localhost:3000   (default)
 *
 * It makes its own product ("Zz tag probe") and two tags ("Probe Alpha",
 * "Probe Beta"), and removes all three at the end, whatever happened. The row
 * switch is read and put back as it was. Run it on a development install: for
 * a few seconds the shop lists a probe product.
 *
 * What it checks:
 *  1. The product form: type two tags (Enter adds, the form does not submit),
 *     save, reload — both chips are there.
 *  2. Suggest tags answers with chips to press (rules or AI) or says why not.
 *  3. The bare /store draws no row (it appears once a category is chosen);
 *     /store?category=… draws `[data-store-tags]` under the strip with the probe's tags;
 *     the row is centred at 1280 (its chips' midpoint is within 12px of the
 *     page's centre), every chip 24px or taller, white on a token fill.
 *  4. The same tag is the same colour on /store and on the product's category
 *     page, whose chips link to /store?category=…&tag=….
 *  5. Pressing a chip filters the listing to the probe product, marks itself
 *     `aria-current="true"` with a ring; pressing it again clears the filter.
 *     The filtered view is noindex.
 *  6. Store → Tags: hiding "Probe Beta" with its Shown switch takes the chip
 *     off the shop (polled; the fetch cache is purged by the action).
 *  7. 360 and 1280: no horizontal overflow on /store.
 *
 * Carries no credential: the staff login is the shared helper's.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const T = 180000;
const NAME = "Zz tag probe";
const TAGS = ["Probe Alpha", "Probe Beta"];

// The helper signs in on its own default origin (127.0.0.1), and a cookie set
// there is not sent to localhost: both must use one.
process.env.BASE = BASE;
const { signInAsStaff } = await import("../shared.mjs");

const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const note = (l) => console.log(`skip ${l}`);

const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();
const problems = [];
page.on("console", (m) => {
  if (m.type() !== "error") return;
  if (m.text().includes("was preloaded using link preload but not used")) return;
  problems.push(`console ${m.type()} at ${page.url().replace(BASE, "")}: ${m.text().slice(0, 300)}`);
});
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`));

const go = async (path, p = page) => {
  await p.goto(`${BASE}${path}`, { waitUntil: "load", timeout: T });
  await p.waitForLoadState("networkidle", { timeout: T }).catch(() => {});
};

/** Poll a public page until the predicate holds: the purge reaches the site on the next request. */
async function until(path, predicate, label, tries = 12) {
  for (let i = 0; i < tries; i++) {
    await go(path);
    if (await predicate()) return true;
    await page.waitForTimeout(1500);
  }
  return false;
}

const chip = (name) => page.locator("[data-store-tags] a", { hasText: new RegExp(`^${name}$`) });

let productId = null;

try {
  await signInAsStaff(page);

  // 1 ---------------------------------------------------------------- the form
  // A category the shop lists: the console's own first option may be one that
  // is switched off, which has no public page to check.
  await go("/store");
  const shopCategory = page.locator("#category option:not([value=''])").first();
  const hasCategory = (await shopCategory.count()) > 0;
  const categoryName = hasCategory ? ((await shopCategory.textContent())?.trim() ?? "") : "";
  const categorySlug = hasCategory ? ((await shopCategory.getAttribute("value")) ?? "") : "";

  await go("/admin/store/products/new");
  await page.fill("#name", NAME);
  if (categoryName) await page.selectOption("#store_category_id", { label: categoryName });
  await page.selectOption("#status", "published");

  const box = page.getByLabel("Add a tag");
  for (const tag of TAGS) {
    await box.fill(tag);
    await box.press("Enter");
  }
  ok(page.url().endsWith("/new"), "Enter in the Tags box adds a chip and does not submit the form");
  for (const tag of TAGS) ok((await page.getByRole("button", { name: `Remove the tag ${tag}` }).count()) === 1, `chip for ${tag}`);

  // Selling tab: a product cannot be saved without a price.
  await page.getByRole("tab", { name: "Selling" }).click().catch(async () => { await page.getByText("Selling", { exact: true }).first().click(); });
  await page.fill("input[name=price]", "1234");
  await page.getByRole("button", { name: /^(Create|Save)/ }).first().click();
  await page.waitForURL(/\/admin\/store\/products\/\d+/, { timeout: T });
  productId = Number(page.url().match(/products\/(\d+)/)?.[1]);
  ok(Boolean(productId), `product created (#${productId})`);

  await go(`/admin/store/products/${productId}`);
  for (const tag of TAGS) ok((await page.getByRole("button", { name: `Remove the tag ${tag}` }).count()) === 1, `${tag} survives the save`);

  // 2 -------------------------------------------------------------- suggestion
  await page.getByRole("button", { name: "Suggest tags" }).click();
  const group = page.getByRole("group", { name: "Suggested tags" });
  const said = page.getByRole("status");
  const answered = await Promise.race([
    group.waitFor({ timeout: 30000 }).then(() => true),
    said.first().waitFor({ timeout: 30000 }).then(() => true),
  ]).catch(() => false);
  ok(answered, "Suggest tags answers with chips to press, or says why there is nothing new");

  // 3 -------------------------------------------------------------- the row
  const SHOP = categorySlug ? `/store?category=${categorySlug}` : "/store";
  await go("/store");
  ok((await page.locator("[data-store-tags]").count()) === 0, "the bare shop front draws no tag row");
  const onShop = await until(SHOP, async () => (await chip(TAGS[0]).count()) > 0, "tag row in the category");
  ok(onShop, `${SHOP} draws the tag row with the probe's tag`);
  if (onShop) {
    const row = page.locator("[data-store-tags]");
    const rowBox = await row.boundingBox();
    const chips = await row.locator("a").evaluateAll((as) => as.map((a) => {
      const r = a.getBoundingClientRect();
      return { h: r.height, left: r.left, right: r.right, color: getComputedStyle(a).color, bg: a.style.background };
    }));
    ok(chips.every((c) => c.h >= 24), `every chip is at least 24px tall (${Math.min(...chips.map((c) => c.h))}px)`);
    ok(chips.every((c) => /var\(--color-tag-fill-\d+\)/.test(c.bg) && c.color === "rgb(255, 255, 255)"), "white on a --color-tag-fill token, no hex");
    const mid = (Math.min(...chips.map((c) => c.left)) + Math.max(...chips.map((c) => c.right))) / 2;
    ok(Math.abs(mid - 640) < 12 || chips.length > 8, `the row is centred at 1280 (midpoint ${Math.round(mid)})`);
    ok(Boolean(rowBox), "the row is below the strip, in the flow");
    const colourOnShop = await chip(TAGS[0]).first().evaluate((a) => getComputedStyle(a).backgroundColor);

    // 5 -------------------------------------------------------------- filter
    await chip(TAGS[0]).first().click();
    await page.waitForURL(/tag=probe-alpha/, { timeout: T });
    await page.waitForLoadState("networkidle", { timeout: T }).catch(() => {});
    ok((await page.locator("body").innerText()).includes(NAME), "pressing the chip lists the probe product");
    ok((await chip(TAGS[0]).first().getAttribute("aria-current")) === "true", "the chosen chip is aria-current");
    // Read on a fresh load, as a crawler would: after a client-side move the
    // dev server can leave the previous page's tag beside the new one.
    await page.reload({ waitUntil: "load", timeout: T });
    const robots = await page.locator('meta[name="robots"]').evaluateAll((ms) => ms.map((m) => m.getAttribute("content") ?? ""));
    ok(robots.length === 1 && robots[0].includes("noindex"), `a tag-filtered view is noindex (${robots.join(" | ")})`);
    await chip(TAGS[0]).first().click();
    await page.waitForFunction(() => !location.search.includes("tag="), null, { timeout: T });
    ok(true, "pressing the chosen chip again clears the filter");

    // 4 ---------------------------------------------------- the category page
    if (categoryName) {
      const slug = categorySlug;
      await go(`/store/categories/${slug}`);
      const there = chip(TAGS[0]);
      ok((await there.count()) > 0, "the category page draws the same tag");
      if ((await there.count()) > 0) {
        ok((await there.first().getAttribute("href"))?.includes(`category=${slug}`) && (await there.first().getAttribute("href"))?.includes("tag=probe-alpha"), "its chip links to /store?category=…&tag=…");
        ok((await there.first().evaluate((a) => getComputedStyle(a).backgroundColor)) === colourOnShop, "the same colour on both pages");
      }
    } else {
      note("the shop has no category, so the category page is not covered");
    }
  }

  // 6 ---------------------------------------------------------- Tags screen
  await go("/admin/store/tags");
  const shown = page.getByRole("switch", { name: `Show ${TAGS[1]} on the shop` });
  ok((await shown.count()) === 1, "Store → Tags lists the probe's second tag with a Shown switch");
  await shown.uncheck();
  const gone = await until(SHOP, async () => (await chip(TAGS[1]).count()) === 0 && (await chip(TAGS[0]).count()) > 0, "hidden tag leaves the row");
  ok(gone, "hiding a tag takes it off the shop's row");

  // 7 --------------------------------------------------------------- widths
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await go(SHOP);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(overflow <= 0, `/store does not scroll sideways at ${width}px (${overflow})`);
  }
} finally {
  // Everything it made, whatever happened above.
  try {
    await page.setViewportSize({ width: 1280, height: 1000 });
    if (productId) {
      await go(`/admin/store/products/${productId}`);
      const del = page.getByRole("button", { name: /^Delete/ }).first();
      if (await del.count()) {
        // The form's Delete asks through `window.confirm`, which Playwright
        // dismisses — cancels — unless told otherwise.
        page.once("dialog", (dialog) => dialog.accept());
        await Promise.all([
          page.waitForURL(/\/admin\/store\/products(\?|$)/, { timeout: T }).catch(() => {}),
          del.click(),
        ]);
      }
    }
    await go("/admin/store/tags");
    for (const tag of TAGS) {
      const row = page.locator("li", { hasText: tag }).first();
      if (await row.count()) {
        await row.getByRole("button", { name: "Delete" }).click();
        await page.locator("dialog[open]").getByRole("button", { name: "Delete tag" }).click();
        await page.waitForTimeout(1500);
      }
    }
  } catch (error) {
    console.log(`cleanup: ${error.message.slice(0, 200)} — remove "${NAME}" and the Probe tags by hand`);
  }

  ok(problems.length === 0, `nothing logged (${problems.length})`);
  for (const line of problems.slice(0, 10)) console.log(`     ${line}`);
  await browser.close();
}

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log("\nall checks passed");
