import { chromium } from "playwright";

/**
 * Drives an editor-built form with every 0.117.0 feature through a real
 * browser: steps, conditions, the date floor, a refused and an accepted
 * upload, the rating, and the submit (docs/forms.md).
 *
 * It needs a published form made from `form-builder.fixture.json` beside this
 * file — POST it to `/admin/forms` as an administrator — and it **submits**
 * that form once, so run it against a development install and delete the
 * submission afterwards (or pass NO_SUBMIT=1).
 *
 *   node scripts/probes/form-builder.mjs                    # the embed frame, 1440px
 *   W=390 DARK=1 node scripts/probes/form-builder.mjs
 *   FORM_PATH=/a-page-holding-the-form node scripts/probes/form-builder.mjs
 *   EXPECT_REDIRECT=/contact …                              # when the form has a redirect
 *
 * What it measures that reading would not: a field hidden by its condition
 * is not in the way of Next; the hidden value is absent from the markup; a
 * .txt is taken back out of the file input in the browser; and after Next
 * the new step's title is **below** the sticky header (it was 7px from the
 * top of a 390px screen, behind a 69px bar, before the scroll margin).
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const SLUG = process.env.FORM_SLUG ?? "form-builder-probe";
const PATH = process.env.FORM_PATH ?? `/embed/forms/${SLUG}`;
const W = Number(process.env.W ?? 1440);
const SHOTS = process.env.SHOTS ?? ".";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

const browser = await chromium.launch();
const page = await browser.newPage({ colorScheme: process.env.DARK ? "dark" : "light", viewport: { width: W, height: W < 500 ? 844 : 900 } });
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

await page.goto(`${BASE}${PATH}`, { waitUntil: "networkidle", timeout: 180000 });
await page.waitForTimeout(1500);
const form = page.locator("form").filter({ has: page.locator('[name="full_name"]') }).first();
const vis = async (name) => page.locator(`[name="${name}"], [name="${name}[]"]`).first().isVisible();
const centre = async (sel) => page.locator(sel).evaluate((el) => el.scrollIntoView({ block: "center" }));
const overflow = async () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const stepText = async () => (await page.locator("[data-form-js]").allInnerTexts()).join(" | ");

ok(await vis("full_name"), "step 1: name is shown");
ok(!(await vis("site_type")), "step 1: step 2's fields are hidden");
ok(!(await vis("floor_plan")), "step 1: step 3's fields are hidden");
ok((await overflow()) <= 0, `no horizontal overflow (${await overflow()}px)`);
console.log("    step line:", await stepText());
ok((await page.locator('[name="campaign"]').count()) === 0, "the hidden value is not in the markup");
if (process.env.SHOTS) await page.screenshot({ path: `${SHOTS}/form-builder-${W}-1.png`, fullPage: true });

const submit = form.locator('button[type="submit"]');
console.log("    button:", (await submit.innerText()).trim());
await submit.click();
await page.waitForTimeout(500);
ok(await vis("full_name"), "Next with a blank required field stays on step 1");

await page.fill('[name="full_name"]', "Probe Person");
await page.fill('[name="email"]', "probe-117-visitor@example.test");
await page.fill('[name="phone"]', "98765 00117");
await submit.click();
await page.waitForTimeout(700);
ok(await vis("site_type"), "Next moves to step 2");
const landed = await page.evaluate(() => {
  const title = document.activeElement?.getBoundingClientRect().top ?? -1;
  const bars = [...document.querySelectorAll("header")].filter((h) => ["sticky", "fixed"].includes(getComputedStyle(h).position)).map((h) => h.getBoundingClientRect().bottom);
  return { title: Math.round(title), header: Math.round(Math.max(0, ...bars)) };
});
ok(landed.title >= landed.header, `the step title lands below the sticky header (${landed.title}px vs ${landed.header}px)`);
ok(!(await vis("full_name")), "step 1 is hidden on step 2");
console.log("    step line:", await stepText(), "| focus:", await page.evaluate(() => `${document.activeElement?.tagName} ${document.activeElement?.textContent?.slice(0, 30)}`));

ok(!(await vis("racks")), "racks is hidden until Data centre is chosen");
await centre('[name="site_type"][value="datacentre"]'); await page.locator('[name="site_type"][value="datacentre"]').check({ force: true });
await page.waitForTimeout(300);
ok(await vis("racks"), "racks appears for Data centre");
await centre('[name="site_type"][value="office"]'); await page.locator('[name="site_type"][value="office"]').check({ force: true });
await page.waitForTimeout(300);
ok(!(await vis("racks")), "racks goes again for Office");
await centre('[name="site_type"][value="datacentre"]'); await page.locator('[name="site_type"][value="datacentre"]').check({ force: true });
await page.fill('[name="racks"]', "12");

ok(!(await vis("other_need")), "the follow-up is hidden until 'Something else' is ticked");
await centre('[name="needs[]"][value="other"]'); await page.locator('[name="needs[]"][value="other"]').check({ force: true });
await centre('[name="needs[]"][value="wifi"]'); await page.locator('[name="needs[]"][value="wifi"]').check({ force: true });
await page.waitForTimeout(300);
ok(await vis("other_need"), "the follow-up appears when 'Something else' is ticked");
await page.fill('[name="other_need"]', "A fibre run between two buildings.");

const today = new Date().toLocaleDateString("en-CA");
const min = await page.locator('[name="visit_date"]').getAttribute("min");
ok(min === today, `date floor is today (${min})`);
await page.selectOption('[name="urgency"]', "soon");
ok((await overflow()) <= 0, `step 2: no horizontal overflow (${await overflow()}px)`);
if (process.env.SHOTS) await page.screenshot({ path: `${SHOTS}/form-builder-${W}-2.png`, fullPage: true });

await submit.click();
await page.waitForTimeout(700);
ok(await vis("floor_plan"), "Next moves to step 3");
console.log("    step line:", await stepText(), "| button:", (await submit.innerText()).trim());
ok((await form.locator("button", { hasText: /back/i }).count()) > 0, "Back is offered");

const file = page.locator('[name="floor_plan"]');
await file.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not allowed") });
await page.waitForTimeout(400);
ok((await file.evaluate((el) => el.files.length)) === 0, "a .txt is refused in the browser");
console.log("    note:", (await page.locator("#floor_plan-note, [id$='floor_plan-note']").allInnerTexts()).join(" "));
await file.setInputFiles({ name: "plan.png", mimeType: "image/png", buffer: PNG });
await page.waitForTimeout(300);
ok((await file.evaluate((el) => el.files.length)) === 1, "a .png is kept");

const star = page.locator('[name="confidence"][value="4"]');
await star.evaluate((el) => el.scrollIntoView({ block: "center" })); await star.check({ force: true });
ok(await star.isChecked(), "four stars chosen");
await centre('[name="consent"]'); await page.locator('[name="consent"]').check({ force: true });
ok((await overflow()) <= 0, `step 3: no horizontal overflow (${await overflow()}px)`);
if (process.env.SHOTS) await page.screenshot({ path: `${SHOTS}/form-builder-${W}-3.png`, fullPage: true });

if (process.env.NO_SUBMIT) { await browser.close(); process.exit(failed ? 1 : 0); }
await submit.click();
if (process.env.EXPECT_REDIRECT) {
  await page.waitForURL((u) => u.pathname === process.env.EXPECT_REDIRECT, { timeout: 60000 }).then(
    () => ok(true, `submitted: sent on to ${process.env.EXPECT_REDIRECT}`),
    async () => { ok(false, "no redirect"); console.log(page.url(), (await page.locator("main").innerText()).slice(0, 400)); },
  );
} else {
  await page.waitForFunction(() => /thank you/i.test(document.body.innerText), null, { timeout: 60000 }).then(
    () => ok(true, "submitted: the success message shows"),
    async () => { ok(false, "no success message"); console.log((await page.locator("body").innerText()).slice(0, 600)); },
  );
}
if (process.env.SHOTS) await page.screenshot({ path: `${SHOTS}/form-builder-${W}-4.png`, fullPage: true });
ok(errors.length === 0, `no console errors${errors.length ? ": " + errors.slice(0, 3).join(" || ") : ""}`);

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
