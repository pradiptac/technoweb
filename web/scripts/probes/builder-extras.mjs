import { chromium } from "playwright";

/**
 * Measures the builder's visual extras (0.126.0, docs/page-builder.md) on a
 * published builder page.
 *
 *   PAGE=/some-page node scripts/probes/builder-extras.mjs
 *
 * The page needs, in this order: any opening section; an in-page menu; a
 * section with a background, an anchor and both edges set; at least one more
 * anchored section; and, somewhere below, a section whose background is an
 * animation, with edges. Checks, at 1280 and 390: (1) the menu is a direct
 * child of the page's section wrapper, lists two or more links, and once the
 * page has scrolled past it sits directly under the site header; (2) a
 * press on its last link brings that section's heading into view below both
 * bars; (3) every edged section is masked, overlaps its neighbour by exactly
 * the room it gives back as padding, and the section straight after the
 * menu has no top edge; (4) the animation's canvas is mounted only while its
 * section is near the screen, and its pause button stops it; (5) nothing
 * scrolls sideways and the page logs no error or warning. Reads only.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const PAGE = process.env.PAGE;
if (!PAGE) { console.error("PAGE is required: the path of a published builder page (see the docblock)."); process.exit(2); }

const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

for (const width of [1280, 390]) {
  const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
  const log = [];
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) log.push(m.text().slice(0, 160)); });
  page.on("pageerror", (e) => log.push(e.message.slice(0, 160)));
  await page.goto(`${BASE}${PAGE}`, { waitUntil: "load", timeout: 180000 });
  await page.waitForTimeout(2500);

  // 1. The menu.
  const menu = await page.evaluate(() => {
    const nav = document.querySelector('[data-page-section="subnav"]');
    return nav ? { direct: nav.parentElement?.hasAttribute("data-page-sections") ?? false, links: nav.querySelectorAll("a").length, position: getComputedStyle(nav).position } : null;
  });
  ok(menu?.direct === true && menu.position === "sticky" && menu.links >= 2, `${width}: the menu is a sticky direct child of the page's wrapper with ${menu?.links} links`);

  await page.evaluate(() => window.scrollTo(0, 1600));
  await page.waitForTimeout(900);
  const stuck = await page.evaluate(() => {
    const nav = document.querySelector('[data-page-section="subnav"]').getBoundingClientRect();
    const header = getComputedStyle(document.documentElement).getPropertyValue("--h-site-header");
    return { top: Math.round(nav.top), header: parseFloat(header) || 0 };
  });
  ok(Math.abs(stuck.top - stuck.header) <= 2, `${width}: scrolled past, it sits under the header (${stuck.top}px, header ${stuck.header}px)`);

  // 2. A press.
  const target = await page.locator('[data-page-section="subnav"] a').last().getAttribute("href");
  await page.locator('[data-page-section="subnav"] a').last().click();
  await page.waitForTimeout(1800);
  const landed = await page.evaluate((hash) => {
    const section = document.querySelector(hash);
    const heading = section?.querySelector("h1, h2, h3");
    const nav = document.querySelector('[data-page-section="subnav"]').getBoundingClientRect();
    return heading ? { heading: Math.round(heading.getBoundingClientRect().top), bars: Math.round(nav.bottom), view: window.innerHeight } : null;
  }, target);
  ok(landed !== null && landed.heading >= landed.bars && landed.heading < landed.view, `${width}: its last link lands the heading below both bars (${landed?.heading}px, bars end ${landed?.bars}px)`);

  // 3. The edges.
  const edges = await page.evaluate(() => {
    const after = document.querySelector('[data-page-section="subnav"]')?.nextElementSibling;
    return {
      afterMenuTop: after?.matches("[data-section]") ? after.getAttribute("data-edge-top") : null,
      list: [...document.querySelectorAll("[data-section][data-edge-top], [data-section][data-edge-bottom]")].map((el) => {
        const cs = getComputedStyle(el);
        return {
          top: el.dataset.edgeTop ?? null, bottom: el.dataset.edgeBottom ?? null,
          masked: cs.maskImage.includes("data:image/svg+xml"),
          balanced: (!el.dataset.edgeTop || parseFloat(cs.marginTop) === -parseFloat(cs.paddingTop)) && (!el.dataset.edgeBottom || parseFloat(cs.marginBottom) < 0),
        };
      }),
    };
  });
  ok(edges.list.length >= 2 && edges.list.every((e) => e.masked && e.balanced), `${width}: ${edges.list.length} edged sections are masked and overlap by the room they give back`);
  ok(edges.afterMenuTop === null, `${width}: the section straight after the menu has no top edge`);

  // 4. The animation.
  const scene = page.locator("[data-section-scene]").first();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(900);
  const far = await scene.locator("canvas").count();
  await scene.scrollIntoViewIfNeeded();
  const drawn = await scene.locator("canvas").waitFor({ state: "attached", timeout: 30000 }).then(() => true, () => false);
  ok(far === 0 && drawn, `${width}: the animation is not mounted at the top of the page (${far}) and is once its section is on screen`);
  const pause = page.getByRole("button", { name: "Pause the background animation" }).first();
  await pause.click();
  ok(await page.getByRole("button", { name: "Play the background animation" }).first().getAttribute("aria-pressed") === "true", `${width}: and its pause button stops it`);

  // 5. The page.
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(over <= 0, `${width}: no sideways scroll (${over})`);
  ok(log.length === 0, `${width}: no error or warning (${log.length}${log[0] ? `: ${log[0]}` : ""})`);
  await page.context().close();
}

await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
