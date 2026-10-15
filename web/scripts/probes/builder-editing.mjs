import { chromium } from "playwright";

/**
 * Measures the builder's editing comfort (`section-builder.tsx`, 0.105.0):
 * drag-and-drop, undo/redo, copy and paste. Saves nothing.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… PAGE_ID=<builder page id> \
 *     node scripts/probes/builder-editing.mjs
 *
 * Checks: (1) dragging the third section's handle onto the top half of the
 * first moves it to the top; (2) Undo puts the order back and Redo takes it
 * again; (3) Ctrl+Z with focus on a builder button undoes; (4) typing into a
 * field several times is one undo step; (5) Copy then Paste adds the same
 * type at the end with a new id; (6) no console errors.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const PAGE_ID = process.env.PAGE_ID;
if (!PAGE_ID) { console.error("PAGE_ID is required"); process.exit(2); }
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"] });
const page = await ctx.newPage();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const problems = [];
page.on("console", (m) => { if (m.type() === "error") problems.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => problems.push(e.message.slice(0, 200)));

const { signInAsStaff } = await import("../shared.mjs");
await signInAsStaff(page);
await page.goto(`${BASE}/admin/pages/${PAGE_ID}?tab=builder`, { waitUntil: "load", timeout: 180000 });
const cards = page.locator("li[data-section-card]");
await cards.first().waitFor({ timeout: 120000 });
await page.waitForTimeout(2500);
const order = () => cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-section-card")));
const before = await order();

// (1) drag
const handle = cards.nth(2).locator('span[draggable="true"]');
const target = cards.nth(0);
const tb = await target.boundingBox();
await handle.dragTo(target, { targetPosition: { x: tb.width / 2, y: 8 } });
await page.waitForTimeout(300);
const dragged = await order();
ok(dragged[0] === before[2] && dragged.length === before.length, `dragging moves the third section to the top (${before.slice(0, 3)} → ${dragged.slice(0, 3)})`);

// (2) undo / redo buttons
await page.getByRole("button", { name: "Undo", exact: true }).click();
ok(JSON.stringify(await order()) === JSON.stringify(before), "Undo puts the order back");
await page.getByRole("button", { name: "Redo", exact: true }).click();
ok(JSON.stringify(await order()) === JSON.stringify(dragged), "Redo takes it again");

// (3) keyboard
await page.getByRole("button", { name: "Undo", exact: true }).focus();
await page.keyboard.press("Control+z");
ok(JSON.stringify(await order()) === JSON.stringify(before), "Ctrl+Z on a builder button undoes");

// (4) typing is one step
await cards.nth(1).locator("button[aria-expanded]").first().click();
const field = cards.nth(1).locator('input[type="text"], input:not([type])').first();
const original = await field.inputValue();
await field.fill(`${original} one`);
await field.fill(`${original} one two`);
await field.fill(`${original} one two three`);
await page.getByRole("button", { name: "Undo", exact: true }).click();
ok(await field.inputValue() === original, "three quick edits to one field are one undo step");

// (5) copy / paste
const countBefore = await cards.count();
await cards.nth(1).getByRole("button", { name: /^Copy section 2/ }).click();
await page.getByRole("button", { name: "Paste a section" }).click();
await page.waitForTimeout(400);
const after = await order();
ok(after.length === countBefore + 1 && after[after.length - 1] === before[1], "Paste adds the copied type at the end");
await page.getByRole("button", { name: "Undo", exact: true }).click();
ok(await cards.count() === countBefore, "and Undo takes it away");

ok(problems.length === 0, `no console errors${problems.length ? ": " + problems.join(" | ") : ""}`);
await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
