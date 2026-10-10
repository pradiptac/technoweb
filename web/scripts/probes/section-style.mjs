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

// The helper signs in on its own default origin (127.0.0.1); a cookie set
// there is not sent to localhost, so both must use one.
process.env.BASE = BASE;
const { signInAsStaff } = await import("../shared.mjs");
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
const problems = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`));
await signInAsStaff(page);
await page.goto(`${BASE}/admin/pages/${PAGE_ID}?tab=builder`, { waitUntil: "load", timeout: 180000 });

const card = page.locator("li[data-section-card]").nth(1);
await card.waitFor({ timeout: 120000 });
// A press before hydration does nothing: press until the card says it is open.
const opener = card.locator("button[aria-expanded]").first();
for (let i = 0; i < 30 && (await opener.getAttribute("aria-expanded")) !== "true"; i++) {
  await opener.click();
  await page.waitForTimeout(1000);
}
const panel = card.locator("fieldset:has(legend:text-is('Style'))");
await panel.waitFor();
// `.first()`: the per-device rows repeat these names further down; the base row comes first.
const press = (group, label) => panel.locator(`[role="group"]:has(p:text-is("${group}")) button:text-is("${label}")`).first().click();
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

// ---- Per-device design (0.146.0) ------------------------------------------
// Close the preview, turn phones back on, and set a base height and heading
// colour plus overrides: phone S above / M tall, tablet Normal above. Then
// read the computed padding and min-height inside the preview frame at three
// widths (the iframe is resized in the parent, so its media queries answer for
// that width), and check a section with no override is untouched.
await page.keyboard.press("Escape");
await styled.first().waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
await press("Show on", "Phones");
await press("Space above", "L");
await press("Minimum height", "L");
await press("Heading colour", "Brand");
const toggle = panel.locator("button[aria-controls$='-st-devices']");
if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
const devicePress = (group, label) => card.locator(`[id$="-st-devices"] [role="group"]:has(p:text-is("${group}")) button:text-is("${label}")`).click();
const deviceTab = (label) => panel.locator(`[aria-label="Screen to edit"] button`, { hasText: label }).click();
await deviceTab("Phone");
await devicePress("Space above", "S");
await devicePress("Minimum height", "M");
await deviceTab("Tablet");
await devicePress("Space above", "Normal");
ok((await toggle.innerText()).includes("2 screens"), "the disclosure counts two overridden screens");
await deviceTab("Phone");
await devicePress("Space above", "Same as other screens");
await devicePress("Space above", "S");
ok(await panel.locator('[aria-label="Screen to edit"] button[aria-pressed="true"]').innerText().then((t) => t.startsWith("Phone")), "the device switch follows the press");

await page.locator("button.btn", { hasText: /^Preview$/ }).click();
const frame2 = page.frameLocator('iframe[title="Unsaved preview of the sections"]');
const mineBox = frame2.locator("[data-section-style]").first();
await mineBox.waitFor({ timeout: 120000 });
const tokens = await mineBox.getAttribute("data-r");
ok(tokens === "pt-p-s mh-p-m pt-t-m", `data-r lists the overrides in a fixed order (${tokens})`);
ok((await mineBox.getAttribute("data-heading-color")) === "brand" && (await mineBox.getAttribute("data-min-h")) === "l", "base min height and heading colour are stamped");
const iframe = page.locator('iframe[title="Unsaved preview of the sections"]');
const measure = async (width) => {
  await iframe.evaluate((el, w) => { el.style.width = `${w}px`; el.style.maxWidth = "none"; }, width);
  await page.waitForTimeout(400);
  return mineBox.locator("> [data-page-section]").evaluate((el) => {
    const cs = getComputedStyle(el);
    return { pt: parseFloat(cs.paddingTop), mh: parseFloat(cs.minHeight), over: document.documentElement.scrollWidth - window.innerWidth };
  });
};
const phone = await measure(390);
const tablet = await measure(768);
const desktop = await measure(1280);
ok(Math.abs(phone.pt - 24) < 1 && Math.abs(phone.mh - 576) < 1, `phone: 1.5rem above, 36rem tall (${JSON.stringify(phone)})`);
ok(Math.abs(tablet.pt - 48) < 1 && Math.abs(tablet.mh - 768) < 1, `tablet: 3rem above (normal), base 48rem tall (${JSON.stringify(tablet)})`);
ok(desktop.pt >= 100 && Math.abs(desktop.mh - 768) < 1, `desktop: the base - large space, 48rem tall (${JSON.stringify(desktop)})`);
ok(phone.over <= 0 && (await measure(320)).over <= 0, "no horizontal overflow at 320 or 390");
// A section with no style at all is not wrapped, so nothing changed for it.
ok(await frame2.locator("[data-section-style]").count() === 1, "only the styled section is wrapped; the others are unchanged");
if (SHOTS) await mineBox.screenshot({ path: `${SHOTS}/style-device.png` });

await page.waitForTimeout(1500);
ok(problems.length === 0, `no console errors or warnings${problems.length ? ":\n  " + problems.join("\n  ") : ""}`);
await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
