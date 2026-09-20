import { chromium } from "playwright";

/**
 * Measures the ticket queue's selection bar (`admin/(app)/tickets/bulk.tsx`)
 * and its sortable headings (`components/admin/sort-th.tsx`).
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/ticket-bulk.mjs
 *
 * Checks: (1) no bar until a row is ticked; (2) ticking two rows shows "2
 * tickets selected"; (3) applying a priority to them changes both rows'
 * badges after the round trip and clears the ticks; (4) the same two are put
 * back to what they were; (5) pressing the Priority heading navigates to
 * `?sort=priority&dir=asc` and pressing it again flips to `desc`, with
 * `aria-sort` on that heading.
 *
 * Signs in through the real form via `signInAsStaff`; carries no credential.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const { signInAsStaff } = await import("../shared.mjs");
await signInAsStaff(page);
await page.goto(`${BASE}/admin/tickets`, { waitUntil: "load", timeout: 120000 });

ok((await page.locator("[data-bulk-bar]").count()) === 0, "no bar before anything is ticked");

// The queue orders by priority, so changing one moves the row: everything
// below is addressed by reference, never by row index.
const priorityOf = async (ref) => (await page.locator(`tbody tr:has(input[aria-label="Select ${ref}"]) td[data-label="Priority"]`).innerText()).trim();
const tick = (ref) => page.locator(`input[aria-label="Select ${ref}"]`).check();
const refs = [];
for (const i of [0, 1]) refs.push((await page.locator("tbody tr").nth(i).locator('input[type="checkbox"]').getAttribute("aria-label")).replace("Select ", ""));
const before = [];
for (const r of refs) before.push(await priorityOf(r));
for (const r of refs) await tick(r);
const bar = page.locator("[data-bulk-bar]");
ok(await bar.isVisible(), "bar appears once rows are ticked");
ok((await bar.innerText()).includes("2 tickets selected"), "bar counts the selection");

const target = before[0] === "Low" ? "high" : "low";
await bar.locator('select[name="priority"]').selectOption(target);
await bar.getByRole("button", { name: "Apply" }).click();
await page.waitForFunction(([want, a, b]) => {
  const read = (ref) => document.querySelector(`tbody tr:has(input[aria-label="Select ${ref}"]) td[data-label="Priority"]`)?.innerText.trim().toLowerCase();
  return read(a) === want && read(b) === want;
}, [target, ...refs], { timeout: 30000 }).then(() => ok(true, `${refs.join(" and ")} read ${target} after Apply`), () => ok(false, `rows did not change to ${target}`));
await page.waitForFunction(() => !document.querySelector("[data-bulk-bar]"), null, { timeout: 10000 })
  .then(() => ok(true, "selection cleared after the action"), () => ok(false, "bar still showing after the action"));

// Put them back, one at a time (they may have differed).
for (const [i, r] of refs.entries()) {
  await tick(r);
  await page.locator('[data-bulk-bar] select[name="priority"]').selectOption(before[i].toLowerCase());
  await page.locator("[data-bulk-bar]").getByRole("button", { name: "Apply" }).click();
  await page.waitForFunction(() => !document.querySelector("[data-bulk-bar]"), null, { timeout: 30000 }).catch(() => {});
}
const after = [];
for (const r of refs) after.push(await priorityOf(r));
ok(after[0] === before[0] && after[1] === before[1], `${refs.join(", ")} restored to ${before.join(", ")}`);

// Sorting.
await page.getByRole("link", { name: "Priority" }).first().click();
await page.waitForURL((u) => u.searchParams.get("sort") === "priority" && u.searchParams.get("dir") === "asc", { timeout: 30000 })
  .then(() => ok(true, "Priority heading sorts ascending"), () => ok(false, "Priority heading did not sort"));
ok((await page.locator('th[aria-sort="ascending"]').count()) === 1, "aria-sort marks the active heading");
await page.getByRole("link", { name: /Priority/ }).first().click();
await page.waitForURL((u) => u.searchParams.get("dir") === "desc", { timeout: 30000 })
  .then(() => ok(true, "second press flips to descending"), () => ok(false, "second press did not flip"));

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
