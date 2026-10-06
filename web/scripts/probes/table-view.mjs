import { chromium } from "playwright";

/**
 * Measures the console's "Table view" (`admin/(app)/table-view.tsx`,
 * `lib/table-view.ts`, and its two blocks in `globals.css`).
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/table-view.mjs
 *   LIST=/admin/seo node scripts/probes/table-view.mjs       # another list
 *
 * On one list screen (`LIST`, the SEO overview by default — it is long enough
 * to scroll): (1) a column put away in the dialog is `display: none` on its
 * heading and on every cell under it, and no other column moves; (2) it is
 * still away after a reload, and back after "Show all columns"; (3) Compact
 * makes a row shorter, is on `<html>` after a reload, and Comfortable undoes
 * it; (4) at 1280, 1440 and 1920px the `[data-table-fits]` marker agrees with
 * a measurement of the table against its wrapper — where it fits, the header
 * row stays under the console's bar once the list has scrolled; where it does
 * not, the wrapper still scrolls sideways and the head goes with the rows
 * (the first cut clipped 98px off this very table at 1440); (5) below `md` a hidden column's detail
 * is still on the card; (6) nothing scrolls sideways at any of the widths
 * and nothing is logged. It reads and changes `localStorage` only, and puts
 * both preferences back.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const LIST = process.env.LIST ?? "/admin/seo";
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 800 } });
const page = await context.newPage();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)); });

const { signInAsStaff } = await import("../shared.mjs");
await signInAsStaff(page);
const open = async () => { await page.goto(`${BASE}${LIST}`, { waitUntil: "load", timeout: 180000 }); await page.waitForSelector("main table.admin-table", { timeout: 60000 }); await page.waitForTimeout(2500); };
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const trigger = page.getByRole("button", { name: /^Table view/ });
const dialog = page.locator("dialog[open]");
const columns = () => page.evaluate(() => {
  const table = document.querySelector("main table.admin-table");
  const heads = [...table.querySelectorAll("thead th")];
  const row = table.querySelector("tbody tr");
  return heads.map((th, i) => ({ label: th.textContent.replace(/[▲▼]/g, "").replace(/\s+/g, " ").trim(), th: getComputedStyle(th).display, td: row?.children[i] ? getComputedStyle(row.children[i]).display : null }));
});
const rowHeight = () => page.evaluate(() => document.querySelector("main table.admin-table tbody tr").getBoundingClientRect().height);

await open();
ok(await trigger.isVisible(), "the Table view button is in the header");
ok((await overflow()) <= 0, `1440: no sideways scroll (${await overflow()}px)`);

const before = await columns();
await trigger.click();
const offered = await dialog.locator('input[type="checkbox"]').evaluateAll((boxes) => boxes.map((b) => b.closest("label").textContent.trim()));
console.log(`    columns: ${before.map((c) => c.label || "(none)").join(" | ")}`);
console.log(`    offered: ${offered.join(" | ")}`);
ok(offered.length > 0 && !offered.includes(before[0].label), "the first column is not offered");
const target = offered[Math.min(1, offered.length - 1)];
await dialog.getByLabel(target, { exact: true }).uncheck();
await dialog.getByRole("button", { name: "Done" }).click();
const after = await columns();
const gone = after.filter((c) => c.th === "none" && c.td === "none").map((c) => c.label);
ok(gone.length === 1 && gone[0] === target, `"${target}" is hidden on its heading and its cells, and only it (${gone.join(", ") || "nothing"})`);
ok((await overflow()) <= 0, "still no sideways scroll");

await open();
ok((await columns()).some((c) => c.label === target && c.th === "none"), "it is still hidden after a reload");

// Density.
const roomy = await rowHeight();
await trigger.click();
await dialog.getByLabel(/^Compact/).check();
await dialog.getByRole("button", { name: "Done" }).click();
const tight = await rowHeight();
ok(tight < roomy, `Compact shortens a row (${Math.round(roomy)}px → ${Math.round(tight)}px)`);
await open();
ok((await page.evaluate(() => document.documentElement.dataset.consoleDensity)) === "compact", "Compact is on <html> after a reload");
ok(Math.abs((await rowHeight()) - tight) < 1, "and the rows are the compact height at once");

// The header row: sticky where the table fits its wrapper, and where it does
// not the wrapper must still scroll sideways — never clip a column away.
const head = async (width) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  const fit = await page.evaluate(() => {
    const table = document.querySelector("main table.admin-table");
    const wrap = table.parentElement;
    return { table: table.offsetWidth, wrap: wrap.clientWidth, overflowX: getComputedStyle(wrap).overflowX, marker: !!document.querySelector("[data-table-fits]") };
  });
  const fits = fit.table <= fit.wrap + 1;
  ok(fit.marker === fits, `${width}: the fits marker agrees with the measurement (table ${fit.table}px in ${fit.wrap}px, marker ${fit.marker})`);
  if (!fits) ok(/auto|scroll/.test(fit.overflowX), `${width}: a table wider than its wrapper still scrolls sideways (overflow-x: ${fit.overflowX})`);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  const at = await page.evaluate(() => {
    const table = document.querySelector("main table.admin-table");
    const th = table.querySelector("thead th").getBoundingClientRect();
    const bar = document.querySelector("[data-console] > .sticky").getBoundingClientRect();
    const t = table.getBoundingClientRect();
    return { th: Math.round(th.top), bar: Math.round(bar.bottom), scrolledPast: t.top < bar.bottom - 20, tableBottom: Math.round(t.bottom) };
  });
  if (!at.scrolledPast || at.tableBottom <= at.bar + 60) { console.log(`    ${width}: the list is too short to scroll its head away — nothing to measure`); return; }
  if (fits) ok(Math.abs(at.th - at.bar) <= 1, `${width}: the header row sits under the bar (${at.th}px vs ${at.bar}px)`);
  else ok(at.th < at.bar - 1, `${width}: the header row scrolls away with the list (${at.th}px)`);
};
await head(1440);

await page.setViewportSize({ width: 1280, height: 800 });
await open();
ok((await overflow()) <= 0, `1280: no sideways scroll (${await overflow()}px)`);
await head(1280);

await page.setViewportSize({ width: 1920, height: 900 });
await open();
ok((await overflow()) <= 0, `1920: no sideways scroll (${await overflow()}px)`);
await head(1920);

// Below md a row is a card: the hidden column's detail is still there, and the button is not.
await page.setViewportSize({ width: 390, height: 844 });
await open();
const card = await page.evaluate((label) => {
  const row = document.querySelector("main table.admin-table tbody tr");
  const cell = [...row.children].find((td) => td.dataset.label === label);
  return cell ? getComputedStyle(cell).display : "no-such-cell";
}, target);
ok(card !== "none", `390: "${target}" is still on the card (${card})`);
ok(!(await trigger.isVisible()), "390: the button is not offered");
ok((await overflow()) <= 0, `390: no sideways scroll (${await overflow()}px)`);

// Put everything back.
await page.setViewportSize({ width: 1440, height: 800 });
await open();
await trigger.click();
await dialog.getByRole("button", { name: "Show all columns" }).click();
await dialog.getByLabel(/^Comfortable/).check();
await dialog.getByRole("button", { name: "Done" }).click();
ok((await columns()).every((c) => c.th !== "none"), "Show all columns brings every column back");
ok((await page.evaluate(() => document.documentElement.dataset.consoleDensity)) === undefined, "Comfortable takes the attribute off");
ok(errors.length === 0, `nothing logged${errors.length ? ": " + errors.slice(0, 3).join(" || ") : ""}`);

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
