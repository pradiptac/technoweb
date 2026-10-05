import { chromium } from "playwright";

/**
 * Measures a builder section's Style panel (`style-field.tsx`) through the
 * unsaved preview, so nothing is written.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… PAGE_ID=<builder page id> \
 *     node scripts/probes/section-style.mjs
 *   SHOTS=<dir> saves the Style panel and the previewed section.
 *
 * On the page's second section: chooses XL space above, Narrow, Centred,
 * Larger heading, link name `probe-anchor`, and switches phones off; opens
 * Preview and checks the framed section carries `[data-section-style]` with
 * those attributes and the id, that its container is narrower than its
 * neighbour's, that its padding grew, and that it is hidden at a phone width
 * inside the frame. Carries no credential; saves nothing.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const SHOTS = process.env.SHOTS;
const PAGE_ID = process.env.PAGE_ID;
if (!PAGE_ID) { console.error("PAGE_ID is required"); process.exit(2); }
const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const { signInAsStaff } = await import("../shared.mjs");
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
const problems = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`));
await signInAsStaff(page);
await page.goto(`${BASE}/admin/pages/${PAGE_ID}?tab=builder`, { waitUntil: "load", timeout: 180000 });

const card = page.locator("li[data-section-card]").nth(1);
await card.waitFor({ timeout: 120000 });
await card.locator("button[aria-expanded]").first().click();
const panel = card.locator("fieldset:has(legend:text-is('Style'))");
await panel.waitFor();
const press = (group, label) => panel.locator(`[role="group"]:has(p:text-is("${group}")) button:text-is("${label}")`).click();
await press("Space above", "XL");
await press("Content width", "Narrow");
await press("Heading and text", "Centred");
await press("Heading size", "Larger");
await press("Show on", "Phones");
await panel.locator('input[id$="-st-anchor"]').fill("probe-anchor");
ok(await panel.locator('[role="group"]:has(p:text-is("Show on")) button[aria-pressed="true"]').count() === 2, "phones switched off, two devices left");
if (SHOTS) await panel.screenshot({ path: `${SHOTS}/style-panel.png` });

await page.locator("button.btn", { hasText: /^Preview$/ }).click();
const frame = page.frameLocator('iframe[title="Unsaved preview of the sections"]');
const styled = frame.locator("[data-section-style]");
await styled.first().waitFor({ timeout: 120000 });
ok(await styled.count() === 1, "exactly one styled section in the preview");
const attrs = await styled.first().evaluate((el) => ({
  id: el.id, top: el.dataset.padTop, width: el.dataset.width, align: el.dataset.align, heading: el.dataset.heading, cls: el.className,
}));
ok(attrs.id === "probe-anchor" && attrs.top === "xl" && attrs.width === "narrow" && attrs.align === "center" && attrs.heading === "l",
  `the wrapper carries every choice (${JSON.stringify(attrs)})`);
ok(attrs.cls.includes("max-sm:hidden"), "phones are hidden by class, not attribute");
const pad = await styled.first().locator("> [data-page-section]").evaluate((el) => parseFloat(getComputedStyle(el).paddingTop));
ok(pad >= 140, `space above grew (${pad}px)`);
const widths = await frame.locator("[data-page-section] [data-container]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
const mine = await styled.first().locator("[data-container]").first().evaluate((e) => e.getBoundingClientRect().width);
ok(mine <= 770 && Math.max(...widths) > mine, `its container is narrower (${Math.round(mine)}px vs ${Math.round(Math.max(...widths))}px)`);
if (SHOTS) await styled.first().screenshot({ path: `${SHOTS}/style-section.png` });

await page.waitForTimeout(1500);
ok(problems.length === 0, `no console errors or warnings${problems.length ? ":\n  " + problems.join("\n  ") : ""}`);
await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
