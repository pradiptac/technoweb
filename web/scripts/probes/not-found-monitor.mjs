import { chromium } from "playwright";
import { join } from "node:path";

/**
 * Missing pages, the 404 monitor (0.137.0, docs/seo.md "Missing pages"), end to
 * end through the real screens.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/not-found-monitor.mjs
 *   SHOTS=<dir> saves /admin/not-found at 360, 768, 1280 and 1920.
 *
 * What it checks:
 *   - a made-up public address renders the 404 page, and the 404 page reports
 *     it (the browser's POST to /api/not-found is seen answering 204);
 *   - signed in, the address is on /admin/not-found?q=… asked for at least once;
 *   - "Make a redirect" opens the redirect form with the address already in
 *     "Redirect from";
 *   - saving a redirect to /about takes the address off the Missing pages list
 *     (it leaves by itself — there is no "done" to press);
 *   - the public address then redirects to /about. The proxy holds the redirect
 *     table for a minute, so this polls for up to 90 seconds;
 *   - /admin/not-found has no horizontal overflow at 360;
 *   - one h1, and nothing logged.
 *
 * **It leaves nothing behind that matters.** The redirect it made is deleted
 * through the redirect's own edit screen (in a `finally`, so a failed run
 * cleans up too), and the address is then ignored so it does not sit on a real
 * install's worklist. The one row left is that ignored address, which the
 * nightly prune removes ninety days after it was last asked for.
 *
 * Reads and writes only what is described above. Carries no credential.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS;
const T = 180000;
const POLL_MS = 5000;
const POLL_FOR_MS = Number(process.env.POLL_FOR_MS) || 90000;

const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const { signInAsStaff } = await import("../shared.mjs");

const ADDRESS = `/probe-missing-${Math.random().toString(36).slice(2, 10)}`;
const problems = [];
const watch = (p, ignoreUrl) => {
  p.on("console", (m) => {
    if (m.type() !== "error" && m.type() !== "warning") return;
    // The 404 page's own document, which the browser logs as a failed load.
    if (ignoreUrl && m.location().url.endsWith(ignoreUrl)) return;
    // Dev only, on the 404 page, with or without this feature (CLAUDE.md, the 404 rule):
    // the not-found body can arrive after `load` and React says so.
    if (ignoreUrl && m.text().includes("Encountered a script tag while rendering React component")) return;
    problems.push(`${m.type()} at ${p.url().replace(BASE, "")}: ${m.text().slice(0, 1200)}`);
  });
  p.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`));
};

/* ---- a visitor asks for an address that does not exist ---- */

const visitor = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
watch(visitor, ADDRESS);

const reported = visitor.waitForResponse(
  (r) => r.url().endsWith("/api/not-found") && r.request().method() === "POST",
  { timeout: T },
);
const response = await visitor.goto(`${BASE}${ADDRESS}`, { waitUntil: "load", timeout: T });
ok(response?.status() === 404, `${ADDRESS} answers 404`);
await visitor.waitForSelector("h1", { timeout: T });
ok(await visitor.locator("h1").count() === 1, "…and draws the 404 page with one h1");
ok((await (await reported).status()) === 204, "…which reports the address (POST /api/not-found answers 204)");
await visitor.close();

/* ---- the SEO manager's side ---- */

const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();
watch(page);

const go = async (path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: T });
  await page.waitForSelector("h1", { timeout: T });
  // The console polls, so the network never goes idle: settle on hydration instead.
  await page.waitForTimeout(1500);
};
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const rowFor = () => page.locator("tbody tr", { hasText: ADDRESS });
const search = encodeURIComponent("probe-missing");

let redirectId = null;

try {
  await signInAsStaff(page, { timeout: T });

  await go(`/admin/not-found?q=${search}`);
  ok(await page.locator("h1").count() === 1, "one h1 on Missing pages");
  ok((await page.locator("h1").innerText()).trim() === "Missing pages", "…titled Missing pages");

  const row = rowFor();
  ok(await row.count() === 1, "the address is on the waiting list");
  const times = Number((await row.locator('td[data-label="Asked"]').innerText()).replace(/[^\d]/g, ""));
  ok(times >= 1, `…asked for ${times} time(s)`);

  // Every cell is labelled, or it reads as a loose string once the table becomes cards.
  const cells = row.locator("td");
  let unlabelled = 0;
  for (let i = 0; i < await cells.count(); i++) {
    if ((await cells.nth(i).getAttribute("data-label")) === null) unlabelled++;
  }
  ok(unlabelled === 0, "every cell carries a data-label");

  if (SHOTS) {
    for (const width of [360, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(300);
      // `caret: "initial"`: a screenshot's default caret style on inputs is a hydration mismatch of the probe's own making.
      await page.screenshot({ path: join(SHOTS, `not-found-${width}.png`), fullPage: true, caret: "initial" });
    }
    await page.setViewportSize({ width: 1280, height: 1000 });
  }

  await page.setViewportSize({ width: 360, height: 900 });
  await page.waitForTimeout(300);
  ok(await overflow() <= 0, "no horizontal overflow on Missing pages at 360");
  await page.setViewportSize({ width: 1280, height: 1000 });

  /* ---- Make a redirect ---- */

  await Promise.all([
    page.waitForURL((u) => u.pathname === "/admin/redirects/new", { timeout: T }),
    rowFor().getByRole("link", { name: "Make a redirect" }).click(),
  ]);
  await page.waitForSelector("#from_path", { timeout: T });
  await page.waitForTimeout(1000);
  ok(await page.locator("#from_path").inputValue() === ADDRESS, "the redirect form opens with the address in Redirect from");

  await page.fill("#to_path", "/about");
  await Promise.all([
    page.waitForURL((u) => /^\/admin\/redirects\/\d+$/.test(u.pathname), { timeout: T }),
    page.getByRole("button", { name: "Create redirect" }).click(),
  ]);
  redirectId = new URL(page.url()).pathname.split("/").pop();
  ok(Boolean(redirectId), `the redirect saved (#${redirectId})`);

  /* ---- it leaves the list by itself ---- */

  await go(`/admin/not-found?q=${search}`);
  ok(await rowFor().count() === 0, "the address has left the waiting list");

  /* ---- and the public address now redirects ---- */

  // Asked as a visitor would ask: a context of its own, so no staff cookie
  // rides along. A dropped connection is a busy dev server, not an answer —
  // ask again rather than fail the run on it.
  const anonymous = await browser.newContext();
  const deadline = Date.now() + POLL_FOR_MS;
  let seen = null;
  while (Date.now() < deadline) {
    try {
      const r = await anonymous.request.get(`${BASE}${ADDRESS}`, { maxRedirects: 0, failOnStatusCode: false, timeout: T });
      if ([301, 302, 307, 308].includes(r.status())) { seen = { status: r.status(), to: r.headers().location ?? "" }; break; }
    } catch {
      // Try again until the deadline.
    }
    await page.waitForTimeout(POLL_MS);
  }
  await anonymous.close();
  ok(seen !== null && /\/about$/.test(seen.to), seen ? `${ADDRESS} redirects (${seen.status}) to ${seen.to}` : `${ADDRESS} never redirected within ${POLL_FOR_MS / 1000}s`);
} finally {
  /* ---- clean up: delete the redirect through its own screen, then ignore the address ---- */
  if (redirectId) {
    try {
      await go(`/admin/redirects/${redirectId}`);
      page.once("dialog", (d) => d.accept());
      await Promise.all([
        page.waitForURL((u) => u.pathname === "/admin/redirects", { timeout: T }),
        page.getByRole("button", { name: "Delete redirect" }).click(),
      ]);
      ok(true, `the redirect it made (#${redirectId}) is deleted`);

      await go(`/admin/not-found?q=${search}`);
      const back = rowFor();
      ok(await back.count() === 1, "…and the address is waiting again, since nothing redirects from it");
      if (await back.count() === 1) {
        await back.getByRole("button", { name: "Ignore", exact: true }).click();
        await page.waitForTimeout(2500);
        await go(`/admin/not-found?q=${search}`);
        ok(await rowFor().count() === 0, "…then ignored, so it does not stay on the worklist");
      }
    } catch (error) {
      ok(false, `cleanup failed - delete redirect #${redirectId} by hand: ${String(error).slice(0, 300)}`);
    }
  }
}

ok(problems.length === 0, `nothing logged (${problems.length})`);
for (const p of problems) console.log(`     ${p}`);

await browser.close();
console.log(failed === 0 ? "\nnot-found-monitor: all passed" : `\nnot-found-monitor: ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
