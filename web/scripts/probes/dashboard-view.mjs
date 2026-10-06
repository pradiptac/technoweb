import { chromium } from "playwright";

/**
 * Measures "Customise" on the console's dashboard (`admin/(app)/page.tsx`,
 * `dashboard-customise.tsx`, `lib/dashboard-view.ts`).
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/dashboard-view.mjs
 *
 * As an administrator: (1) untouched, the dashboard draws its panels in the
 * default order with the default spacing between them; (2) putting one panel
 * away and moving another to the top, then Save, redraws the page that way —
 * the hidden panel is not in the markup at all, and the document order is the
 * order on screen; (3) it is still so after a reload, because the server read
 * it from a cookie; (4) one group of tiles can be put away on its own;
 * (5) Cancel changes nothing; (6) Reset and Save restores the
 * first reading exactly; (7) nothing scrolls sideways at 1440, 768 or 390 in
 * either arrangement, and nothing is logged. It writes one cookie for the
 * signed-in account and removes it again.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)); });

const { signInAsStaff } = await import("../shared.mjs");
await signInAsStaff(page);

const open = async () => {
  await page.goto(`${BASE}/admin`, { waitUntil: "load", timeout: 180000 });
  await page.waitForSelector("[data-dashboard-row], main [role='status']:not(.animate-pulse)", { timeout: 120000 });
  await page.waitForSelector("[data-dashboard-row]", { timeout: 120000 });
  await page.waitForTimeout(1500);
};
const rows = () => page.evaluate(() => [...document.querySelectorAll("[data-dashboard-row]")].map((row) => ({
  keys: row.dataset.dashboardRow,
  top: Math.round(row.getBoundingClientRect().top + window.scrollY),
  gap: getComputedStyle(row).marginTop,
})));
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const trigger = page.getByRole("button", { name: /^Customise/ });
const dialog = page.locator("dialog[open]");
const save = async () => {
  await dialog.getByRole("button", { name: "Save" }).click();
  // The dialog closes in the commit that draws the new arrangement.
  await page.waitForFunction(() => !document.querySelector("dialog[open]"), null, { timeout: 120000 });
  await page.waitForTimeout(300);
};
const widths = async (label) => {
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(400);
    const by = await overflow();
    ok(by <= 0, `${label}, ${width}px: no sideways scroll (${by}px)`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
};

await open();
const first = await rows();
console.log(`    default: ${first.map((r) => `[${r.keys}] ${r.gap}`).join("  ")}`);
ok(first.map((r) => r.keys).join(" | ") === "glance | kpis | volume | arrivals | status pipeline | urgent", "untouched, the panels are in the default order");
ok(first.map((r) => r.gap).join(" ") === "0px 32px 12px 12px 12px 36px", "and spaced as the dashboard always was (0, 32, 12, 12, 12, 36)");
ok(first.every((r, i) => i === 0 || r.top > first[i - 1].top), "document order is the order on screen");
const button = await trigger.boundingBox();
ok(Math.round(button.height) === 32, `the button is the height the page reserved for it (${Math.round(button.height)}px)`);
await widths("default");

// Put "When tickets arrive" away; move "High priority" to the top.
await trigger.click();
const listed = await dialog.locator("ol > li").evaluateAll((items) => items.map((li) => li.querySelector("label span span")?.textContent ?? ""));
console.log(`    offered: ${listed.join(" | ")}`);
ok(listed.length === 7, `the dialog lists every panel this role has (${listed.length})`);
await dialog.getByLabel(/^When tickets arrive/).uncheck();
for (let i = 0; i < 6; i++) await dialog.getByRole("button", { name: "Move “High priority” up" }).click();
await dialog.getByRole("button", { name: "Cancel" }).click();
await page.waitForTimeout(600);
ok((await rows()).map((r) => r.keys).join("|") === first.map((r) => r.keys).join("|"), "Cancel changes nothing");

await trigger.click();
ok(await dialog.getByLabel(/^When tickets arrive/).isChecked(), "and the dialog reopens on what is saved, not on the abandoned draft");
await dialog.getByLabel(/^When tickets arrive/).uncheck();
for (let i = 0; i < 6; i++) await dialog.getByRole("button", { name: "Move “High priority” up" }).click();
await save();

const changed = await rows();
console.log(`    changed: ${changed.map((r) => `[${r.keys}] ${r.gap}`).join("  ")}`);
ok(changed.map((r) => r.keys).join(" | ") === "urgent | glance | kpis | volume | status pipeline", "after Save: High priority first, the heatmap gone");
// Among the rows: the closed dialog still names every panel.
ok((await page.locator("[data-dashboard-row]").getByText("When tickets arrive").count()) === 0, "the hidden panel is not in the markup");
ok(changed.every((r, i) => i === 0 || r.top > changed[i - 1].top), "document order is still the order on screen");
ok(changed[0].gap === "0px" && changed[1].gap === "32px", "the first row has no gap above it and the row after the ticket list has room");
await widths("rearranged");

await open();
ok((await rows()).map((r) => r.keys).join("|") === changed.map((r) => r.keys).join("|"), "it is still so after a reload");

// One group of tiles, on its own.
const groupsBefore = await page.locator('[data-dashboard-row="glance"] section h2').allTextContents();
await trigger.click();
await dialog.getByLabel("Content", { exact: true }).uncheck();
await save();
const groupsAfter = await page.locator('[data-dashboard-row="glance"] section h2').allTextContents();
ok(groupsBefore.includes("Content") && !groupsAfter.includes("Content") && groupsAfter.length === groupsBefore.length - 1, `the Content tiles alone are put away (${groupsAfter.join(", ")})`);

// Everything away.
await trigger.click();
for (const box of await dialog.locator("ol > li > div input[type=checkbox]").all()) await box.uncheck();
await save();
ok((await page.getByText("Every panel is put away").count()) === 1 && (await rows()).length === 0, "with every panel away the screen says so, and the button is still there");

// Back to the default.
await trigger.click();
await dialog.getByRole("button", { name: /^Reset/ }).click();
await save();
const last = await rows();
ok(JSON.stringify(last.map((r) => [r.keys, r.gap])) === JSON.stringify(first.map((r) => [r.keys, r.gap])), "Reset restores the first reading exactly");
const cookies = (await context.cookies()).filter((c) => c.name.startsWith("tw_dashboard_"));
ok(cookies.length === 0, `and the cookie is gone (${cookies.map((c) => c.name).join(", ") || "none"})`);
ok(errors.length === 0, `nothing logged${errors.length ? ": " + errors.slice(0, 3).join(" || ") : ""}`);

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
