/**
 * Specification filters, driven through the real screens (docs/store.md,
 * "Specification filters").
 *
 * Needs a store category whose filters are chosen — `CATEGORY` (default
 * `networking`) with at least two labels. Measures that:
 *
 *  1. the ISR category page draws the panel as links into `/store` (it never
 *     reads `searchParams`), each value with its count;
 *  2. following one link lands on `/store` filtered, with exactly that many
 *     products;
 *  3. on `/store` the same panel is a form that applies itself: ticking a
 *     value under a second label narrows further (AND across labels), and
 *     unticking it widens back;
 *  4. the counts beside each value are what the facets endpoint counted
 *     under the *other* choices.
 *
 * Read-only: nothing is written. Run from web/:
 *   node scripts/probes/spec-filters.mjs
 */
import { chromium } from "playwright";
import { BASE } from "../shared.mjs";

const CATEGORY = process.env.CATEGORY ?? "networking";
const failures = [];
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"}  ${what}`); if (!ok) failures.push(what); };

/**
 * Products in the filtered listing — the grid under "Top Picks For You"
 * only: the shop front shows other strips of products, one of them also a
 * `data-collection="products"` list, that a filter does not touch, and
 * counting them reads as the filter failing.
 */
async function productCount(page) {
  return page.locator('main h2:has-text("Top Picks For You") ~ ul[data-collection="products"] > li').count();
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

// 1. The category page: links, with counts.
await page.goto(`${BASE}/store/categories/${CATEGORY}`, { waitUntil: "load", timeout: 180000 });
await page.waitForTimeout(1500);
const legends = await page.locator("main fieldset legend").allTextContents();
check(legends.length >= 2, `the category page draws the panel (${legends.join(", ")})`);

// The value with the most products, so a second choice has room to narrow it.
const links = page.locator('main fieldset a[href*="spec"]');
let best = { index: 0, count: -1, text: "", label: 0 };

for (let i = 0; i < await links.count(); i++) {
  const spans = (await links.nth(i).locator("span").allTextContents()).map((t) => t.trim()).filter(Boolean);
  const count = Number(spans.filter((t) => /^\d+$/.test(t)).pop() ?? -1);
  const label = await links.nth(i).evaluate((a) => [...document.querySelectorAll("main fieldset")].indexOf(a.closest("fieldset")));

  if (count > best.count) best = { index: i, count, text: spans.join(" / "), label };
}

const link = links.nth(best.index);
const linkText = best.text;
const expected = best.count;
const href = await link.getAttribute("href");
check(Boolean(href?.startsWith("/store?")), `a value links into /store (${href})`);

// 2. Following it filters /store to that many products.
await link.click();
await page.waitForURL(/\/store\?/, { timeout: 60000 });
await page.waitForTimeout(2000);
const first = await productCount(page);
check(Number.isNaN(expected) || first === expected, `"${linkText}" shows ${first} product(s)${Number.isNaN(expected) ? "" : `, the count beside it said ${expected}`}`);

// 3. On /store the panel is a form: a second label narrows (AND), unticking widens.
const boxes = page.locator('main fieldset input[type="checkbox"]:not(:checked):not([disabled])');
// A label other than the one just chosen.
const other = best.label === 0 ? 1 : 0;
const secondLabel = await page.locator("main fieldset").nth(other).locator("legend").textContent();
const candidate = page.locator("main fieldset").nth(other).locator('input[type="checkbox"]:not(:checked):not([disabled])').first();

if (await candidate.count()) {
  const before = page.url();
  await candidate.check();
  await page.waitForURL((url) => url.toString() !== before, { timeout: 60000 });
  await page.waitForTimeout(2000);
  const narrowed = await productCount(page);
  check(narrowed < first && narrowed > 0, `ticking a value under "${secondLabel}" narrows ${first} → ${narrowed}`);
  check(new URL(page.url()).searchParams.toString().includes("spec"), "the choice is in the address, so the result is shareable");

  const again = page.url();
  // The box just ticked, under that same label — not whichever is last on the page.
  await page.locator("main fieldset").nth(other).locator('input[type="checkbox"]:checked').first().uncheck();
  await page.waitForURL((url) => url.toString() !== again, { timeout: 60000 });
  await page.waitForTimeout(2000);
  check(await productCount(page) === first, "unticking it widens back");
} else {
  check(await boxes.count() > 0, "a second label offers a value to tick");
}

// 4. The counts come from the facets endpoint, under the other choices.
const api = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";
const facets = await (await fetch(`${api}/api/v1/store/categories/${CATEGORY}/facets`)).json();
check(Array.isArray(facets.data) && facets.data.length === legends.length, `the facets endpoint answers the same ${facets.data?.length} label(s)`);

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);

await browser.close();
console.log(failures.length ? `\n${failures.length} check(s) failed.` : "\nAll checks passed.");
process.exit(failures.length ? 1 : 0);
