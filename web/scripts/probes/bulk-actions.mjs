import { chromium } from "playwright";

/**
 * Bulk actions on a console list (0.139.0, docs/admin-console.md "Bulk
 * actions"), end to end through the real screens, on the blog.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/bulk-actions.mjs
 *
 * It makes its own throwaway records — three posts whose titles begin with
 * `Bulk probe` and a stamp — through the new-post form, and never touches a
 * record it did not make: every tick is found by its post's title, and the
 * clean-up deletes by those titles, so a run that stops half-way leaves only
 * `Bulk probe …` drafts that the next run's first step removes.
 *
 * The run, signed in as staff:
 *   1. makes three draft posts;
 *   2. ticks two of them, and checks the bar appears, names "2 posts
 *      selected", and that the third row is not ticked;
 *   3. presses **Publish** and checks the toast, that the selection cleared
 *      and that exactly those two rows now read Published;
 *   4. ticks the same two and presses **Move to draft**, and checks both
 *      read Draft again;
 *   5. ticks all three through the header's tick (the indeterminate state is
 *      checked on the way: one row unticked → the header is indeterminate),
 *      presses **Delete**, checks the confirmation names the count and that
 *      Cancel leaves the rows, then confirms and checks all three are gone.
 * At 1280 and again at 360 it checks, with the bar open:
 *   - the page does not scroll sideways;
 *   - the bar's buttons are at least 24px tall and none leaves the screen;
 *   - nothing was logged to the console.
 *
 * A viewport change keeps the same three posts, so the 360 pass reuses the
 * ones made for 1280 (it ticks, looks, and unticks — it presses nothing).
 *
 * Carries no credential: sign-in is `signInAsStaff` from scripts/shared.mjs,
 * which reads `ADMIN_LOGIN_EMAIL` / `ADMIN_LOGIN_PASSWORD`. Run it on a
 * development install.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const T = 180000;
const STAMP = Date.now().toString(36);
const PREFIX = "Bulk probe";
const TITLES = [`${PREFIX} ${STAMP} A`, `${PREFIX} ${STAMP} B`, `${PREFIX} ${STAMP} C`];

const { signInAsStaff } = await import("../shared.mjs");

const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();
const problems = [];
page.on("console", (m) => {
  if (m.type() !== "error" && m.type() !== "warning") return;
  // Dev only (CLAUDE.md, "How the audits behave").
  if (m.text().includes("was preloaded using link preload but not used")) return;
  problems.push(`${m.type()} at ${page.url().replace(BASE, "")}: ${m.text().slice(0, 400)}`);
});
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`));

const settle = async () => { await page.waitForLoadState("load", { timeout: T }); await page.waitForTimeout(1200); };
const list = async () => { await page.goto(`${BASE}/admin/blog?q=${encodeURIComponent(`${PREFIX} ${STAMP}`)}&per_page=100`, { waitUntil: "load", timeout: T }); await settle(); };
const row = (title) => page.locator("main table.admin-table tbody tr", { hasText: title });
const tick = (title) => row(title).getByRole("checkbox");
const bar = () => page.locator("[data-bulk-bar]");
// The toasts are items of the two `aria-live` lists the admin layout mounts
// (`components/ui/toast.tsx`); they carry no role of their own.
const toastText = async () => (await page.locator("ul[aria-live] > *").allInnerTexts()).join(" | ");

/** Fails the run's cleanliness for any earlier probe's leftovers: removes `Bulk probe` drafts by title. */
async function removeLeftovers() {
  await page.goto(`${BASE}/admin/blog?q=${encodeURIComponent(PREFIX)}&per_page=100`, { waitUntil: "load", timeout: T });
  await settle();
  const rows = page.locator("main table.admin-table tbody tr", { hasText: PREFIX });
  const n = await rows.count();
  if (n === 0) return;
  console.log(`note removing ${n} earlier "${PREFIX}" post(s)`);
  for (let i = 0; i < n; i++) await rows.nth(i).getByRole("checkbox").check();
  await bar().getByRole("button", { name: "Delete", exact: true }).click();
  await page.locator("dialog[open]").getByRole("button", { name: /^Delete \d/ }).click();
  await page.waitForTimeout(2500);
}

async function makePost(title) {
  await page.goto(`${BASE}/admin/blog/new`, { waitUntil: "load", timeout: T });
  await settle();
  await page.fill("#title", title);
  await Promise.all([
    page.waitForURL(/\/admin\/blog\/\d+/, { timeout: T }),
    page.getByRole("button", { name: "Create post" }).click(),
  ]);
  await settle();
}

async function barFits(label) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(over <= 0, `${label}: no horizontal overflow with the bar open (${over}px)`);
  const boxes = await bar().getByRole("button").evaluateAll((bs) => bs.map((b) => {
    const r = b.getBoundingClientRect();
    return { h: Math.round(r.height), right: Math.round(r.right), left: Math.round(r.left), name: b.textContent?.trim() };
  }));
  const width = page.viewportSize().width;
  ok(boxes.length > 0 && boxes.every((b) => b.h >= 24), `${label}: every bar button is at least 24px tall (${boxes.map((b) => `${b.name}:${b.h}`).join(", ")})`);
  ok(boxes.every((b) => b.left >= 0 && b.right <= width), `${label}: no bar button leaves the screen`);
}

try {
  await signInAsStaff(page, { timeout: T });
  await removeLeftovers();

  for (const t of TITLES) await makePost(t);
  await list();
  ok((await page.locator("main table.admin-table tbody tr").count()) === 3, "three throwaway posts are listed");
  ok((await bar().count()) === 0, "no bar until something is ticked");

  // ---- tick two, publish
  await tick(TITLES[0]).check();
  await tick(TITLES[1]).check();
  await bar().waitFor({ timeout: T });
  ok(/2 posts selected/.test(await bar().innerText()), "the bar says 2 posts selected");
  ok(!(await tick(TITLES[2]).isChecked()), "the third row is not ticked");
  await barFits("1280");

  await bar().getByRole("button", { name: "Publish", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("[data-bulk-bar]"), null, { timeout: T });
  ok(/2 posts published/.test(await toastText()), `a toast says 2 posts published (${(await toastText()).slice(0, 80)})`);
  await settle();
  ok((await row(TITLES[0]).innerText()).includes("Published") && (await row(TITLES[1]).innerText()).includes("Published"), "both ticked rows read Published");
  ok((await row(TITLES[2]).innerText()).includes("Draft"), "the unticked row is still a draft");
  ok((await page.locator("main table.admin-table tbody input:checked").count()) === 0, "the selection cleared after the action");

  // ---- tick the same two, back to draft
  await tick(TITLES[0]).check();
  await tick(TITLES[1]).check();
  await bar().getByRole("button", { name: "Move to draft", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("[data-bulk-bar]"), null, { timeout: T });
  await settle();
  ok((await row(TITLES[0]).innerText()).includes("Draft") && (await row(TITLES[1]).innerText()).includes("Draft"), "both read Draft again");

  // ---- the header's tick, the narrow screen, and delete
  const head = page.locator("main table.admin-table thead").getByRole("checkbox");
  await tick(TITLES[0]).check();
  ok(await head.evaluate((el) => el.indeterminate), "the header tick is indeterminate with one row of three ticked");
  await tick(TITLES[0]).uncheck();
  await head.check();
  ok(/3 posts selected/.test(await bar().innerText()), "the header tick selects every row on the page");

  await page.setViewportSize({ width: 360, height: 800 });
  await page.waitForTimeout(600);
  await barFits("360");
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.waitForTimeout(400);

  await bar().getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.waitFor({ timeout: T });
  ok(/Delete 3 posts\?/.test(await dialog.innerText()), "the confirmation names the count");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(500);
  ok((await page.locator("main table.admin-table tbody tr").count()) === 3, "Cancel leaves the rows alone");

  await bar().getByRole("button", { name: "Delete", exact: true }).click();
  await dialog.waitFor({ timeout: T });
  await dialog.getByRole("button", { name: /^Delete 3 posts/ }).click();
  await page.waitForFunction(() => !document.querySelector("[data-bulk-bar]"), null, { timeout: T });
  await page.waitForTimeout(1500);
  await list();
  ok((await page.locator("main table.admin-table tbody tr").count()) === 0, "all three throwaway posts are gone");
} catch (error) {
  failed++;
  console.log(`FAIL the probe stopped: ${error.message.split("\n")[0]}`);
  // Leave nothing of ours behind.
  try { await removeLeftovers(); } catch { /* the next run removes them */ }
} finally {
  ok(problems.length === 0, `nothing logged to the console${problems.length ? `:\n  ${problems.join("\n  ")}` : ""}`);
  await browser.close();
}

console.log(failed === 0 ? "\nbulk-actions: clean" : `\nbulk-actions: ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
