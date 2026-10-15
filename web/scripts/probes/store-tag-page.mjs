import { chromium } from "playwright";

/**
 * Shop tag landing pages (0.157.0, docs/store.md "Tags"), end to end through
 * the real screens.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/store-tag-page.mjs
 *   BASE=http://localhost:3000   (default)
 *
 * It makes one tag ("Zz Page Probe") on Store -> Tags, edits its page, reads
 * the public page, renames it to check the old address redirects, and deletes
 * the tag at the end whatever happened. It attaches the tag to no product, so
 * no seeded record is edited: the tag page of a tag nothing carries is the
 * ordinary "Nothing here yet" page, and is `noindex` (fewer than three
 * published products). A tag already on a product is read, never changed.
 *
 * What it checks:
 *  1. Store -> Tags has an "Edit page" link per tag; the edit screen has the
 *     Content and SEO tabs and a "View page" link that is a plain path.
 *  2. Heading, introduction and an SEO title saved on the edit screen reach
 *     /store/tags/<slug>: one h1 with the heading, the intro text, the SEO
 *     title in <title>, a canonical, a CollectionPage JSON-LD with no literal
 *     "<", `noindex` in the robots meta (no products).
 *  3. No horizontal overflow at 360 and 1280, nothing logged to the console.
 *  4. A hidden tag's page is a 404 (Shown switch off), and comes back.
 *  5. Renaming the tag moves the page: the old address redirects (301 via the
 *     proxy's redirect table, polled - it refreshes within a minute).
 *  6. Read-only: the first tag chip on a product page opens a tag page whose
 *     robots meta agrees with its product count (noindex under three cards).
 *
 * Carries no credential: the staff login is the shared helper's.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const T = 180000;
const NAME = "Zz Page Probe";
const RENAMED = "Zz Page Probe Two";
const slugOf = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const HEADING = "Probe heading for the tag page";
const INTRO = "This introduction was typed by the probe.";
const SEO_TITLE = "Probe SEO title for the tag page";

// The helper signs in on its own default origin (127.0.0.1), and a cookie set
// there is not sent to localhost: both must use one.
process.env.BASE = BASE;
const { signInAsStaff } = await import("../shared.mjs");

const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();
const problems = [];
let hiding = false; // while the tag is hidden, and the old address before its redirect lands, the page is the not-found page
page.on("console", (m) => {
  if (m.type() !== "error") return;
  if (m.text().includes("was preloaded using link preload but not used")) return;
  // A deliberate 404 (the hidden tag) logs the failed resource; that is the check.
  if (m.text().startsWith("Failed to load resource")) return;
  // and in dev the not-found body logs React's "script tag while rendering" warning (CLAUDE.md, the 404's note).
  if (hiding && m.text().startsWith("Encountered a script tag")) return;
  problems.push(`console ${m.type()} at ${page.url().replace(BASE, "")}: ${m.text().slice(0, 300)}`);
});
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`));

const go = async (path, p = page) => {
  const res = await p.goto(`${BASE}${path}`, { waitUntil: "load", timeout: T });
  await p.waitForLoadState("networkidle", { timeout: T }).catch(() => {});
  return res;
};

/** Poll a public page until the predicate holds: the purge reaches the site on the next request. */
async function until(path, predicate, tries = 12) {
  for (let i = 0; i < tries; i++) {
    await go(path);
    if (await predicate()) return true;
    await page.waitForTimeout(1500);
  }
  return false;
}

const robots = () => page.locator('meta[name="robots"]').getAttribute("content").catch(() => null);

let slug = slugOf(NAME);
let tagId = null;

try {
  await signInAsStaff(page);

  // 1 ----------------------------------------------------------- the list
  await go("/admin/store/tags");
  await page.fill("#new-tag", NAME);
  await page.getByRole("button", { name: "Add tag" }).click();
  const row = page.locator("li", { hasText: NAME }).first();
  await row.waitFor({ timeout: T });
  const edit = row.getByRole("link", { name: "Edit page" });
  ok((await edit.count()) === 1, "the tag has an Edit page link on the Tags screen");
  tagId = Number((await edit.getAttribute("href"))?.match(/tags\/(\d+)/)?.[1]);
  ok(Boolean(tagId), `tag created (#${tagId})`);

  await go(`/admin/store/tags/${tagId}`);
  ok((await page.getByRole("tab", { name: "Content" }).count()) === 1 && (await page.getByRole("tab", { name: "SEO" }).count()) === 1, "the edit screen has Content and SEO tabs");
  const view = page.getByRole("link", { name: "View page" });
  ok((await view.getAttribute("href")) === `/store/tags/${slug}`, "View page is a plain path");

  // 2 ------------------------------------------------------- edit and read
  await page.fill("#heading", HEADING);
  await page.locator(".note-editable").first().click();
  await page.keyboard.type(INTRO);
  await page.getByRole("tab", { name: "SEO" }).click();
  await page.fill("#seo_title", SEO_TITLE);
  await page.getByRole("button", { name: /^Save changes/ }).click();
  await page.waitForURL(/\/admin\/store\/tags(\?|$)/, { timeout: T });

  const PUBLIC = `/store/tags/${slug}`;
  const shown = await until(PUBLIC, async () => (await page.locator("h1").first().textContent().catch(() => ""))?.includes(HEADING));
  ok(shown, "the heading is the page's h1");
  ok((await page.locator("h1").count()) === 1, "exactly one h1");
  ok((await page.getByText(INTRO).count()) > 0, "the introduction is on the page");
  ok((await page.title()).includes(SEO_TITLE), "the SEO title is the <title>");
  ok(Boolean(await page.locator('link[rel="canonical"]').getAttribute("href").catch(() => null)), "a canonical");
  ok(/noindex/.test((await robots()) ?? ""), "a tag with no published products is noindex");
  const ld = await page.locator('script[type="application/ld+json"]').evaluateAll((els) => els.map((e) => e.textContent ?? ""));
  ok(ld.some((t) => t.includes('"CollectionPage"')), "a CollectionPage graph");
  ok(ld.every((t) => !t.includes("<")), "no literal < in any JSON-LD block");

  // 3 --------------------------------------------------------------- widths
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await go(PUBLIC);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(overflow <= 0, `no horizontal overflow at ${width}px (${overflow})`);
  }
  await page.setViewportSize({ width: 1280, height: 1000 });

  // 4 ------------------------------------------------------------ hidden
  await go("/admin/store/tags");
  hiding = true;
  const hideRow = page.locator("li", { hasText: NAME }).first();
  await hideRow.getByLabel(`Show ${NAME} on the shop`).uncheck();
  const gone = await until(PUBLIC, async () => (await page.locator("body").textContent())?.includes("could not be found") || page.url().includes("not-found") || (await page.title()).toLowerCase().includes("not found"));
  ok(gone, "a hidden tag's page is a 404");
  await go("/admin/store/tags");
  await page.locator("li", { hasText: NAME }).first().getByLabel(`Show ${NAME} on the shop`).check();
  ok(await until(PUBLIC, async () => (await page.locator("h1").first().textContent().catch(() => ""))?.includes(HEADING)), "the page comes back when the tag is shown again");

  // 5 --------------------------------------------------------------- rename
  await page.goto(`${BASE}/admin/store/tags`, { waitUntil: "load", timeout: T });
  await page.locator("li", { hasText: NAME }).first().getByRole("button", { name: "Rename" }).click();
  await page.fill("#rename-tag", RENAMED);
  await page.getByRole("dialog").getByRole("button", { name: "Rename" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden", timeout: T }).catch(() => {});
  slug = slugOf(RENAMED);
  const moved = await until(PUBLIC, async () => page.url().endsWith(`/store/tags/${slug}`), 50);
  ok(moved, "the old address redirects to the renamed tag's page");
  hiding = false;

  // 6 ----------------------------------------------------- read-only on a real tag
  await go("/store");
  const productHref = await page.locator('a[href^="/store/products/"]').first().getAttribute("href");
  if (productHref) {
    await go(productHref);
    const chip = page.locator('ul[aria-label="Tags"] a[href^="/store/tags/"]').first();
    if ((await chip.count()) > 0) {
      await Promise.all([page.waitForURL(/\/store\/tags\//, { timeout: T }), chip.click()]);
      await page.waitForLoadState("networkidle", { timeout: T }).catch(() => {});
      const cards = await page.locator('[data-collection="products"] li').count();
      const r = (await robots()) ?? "";
      ok(cards >= 3 ? !/noindex/.test(r) : /noindex/.test(r), `a real tag page (${cards} products on it): robots is "${r}"`);
      ok((await page.locator("h1").count()) === 1, "one h1 on a real tag page");
    } else {
      console.log("skip the first product carries no tag chip");
    }
  }

  ok(problems.length === 0, "nothing logged to the console");
  for (const p of problems) console.log(`     ${p}`);
} catch (error) {
  failed++;
  console.log(`FAIL ${error instanceof Error ? error.message.split("\n")[0] : error}`);
} finally {
  // Delete what was made, whatever happened.
  try {
    await go("/admin/store/tags");
    for (const name of [RENAMED, NAME]) {
      const row = page.locator("li", { hasText: name }).first();
      if ((await row.count()) === 0) continue;
      await row.getByRole("button", { name: "Delete" }).click();
      await page.getByRole("dialog").getByRole("button", { name: /^Delete/ }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});
    }
  } catch {}
  await browser.close();
}

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
