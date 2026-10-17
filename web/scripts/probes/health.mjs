/**
 * Site health (0.181.0, docs/health.md): a dead internal link in a throwaway
 * post is listed, Fix opens the post, correcting the link and saving clears it.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/health.mjs
 *
 * The recheck after a save is a queued job, so it drains the API's queue itself
 * (API_DIR, default ../api from the repo root) with `queue:work --stop-when-empty`.
 * With QUEUE_CONNECTION=sync that is a no-op. Needs `php` on the PATH.
 *
 * Writes one blog post and deletes it again, through its own screen.
 */
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const { signInAsStaff, BASE } = await import("../shared.mjs");

const T = 120000;
const API_DIR = process.env.API_DIR ?? fileURLToPath(new URL("../../../api", import.meta.url));
const slug = `health-probe-${Date.now()}`;
const DEAD = "/storage/health-probe-missing.pdf";
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const drain = () => execSync("php artisan queue:work --stop-when-empty", { cwd: API_DIR, stdio: "pipe", timeout: 120000 });

/** Writes the body through the real editor: Summernote reports on keyup and the form reads the hidden input. */
async function setBody(page, html) {
  const editable = page.locator(".note-editable").first();
  await editable.waitFor({ timeout: T });
  await editable.evaluate((el, h) => {
    el.innerHTML = h;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  }, html);
  await page.waitForFunction((h) => document.querySelector('input[type=hidden][name="body"]')?.value.includes(h), html.match(/href="([^"]+)"/)[1], { timeout: 10000 });
}

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
page.setDefaultTimeout(T);
page.on("dialog", (d) => d.accept());
let postPath = null;
try {
  await signInAsStaff(page, { timeout: T });

  // 1. A post whose body links to a file that does not exist.
  await page.goto(`${BASE}/admin/blog/new`, { waitUntil: "load", timeout: T });
  await page.locator("#title").fill("Health probe");
  await page.locator("#slug").fill(slug);
  await setBody(page, `<p><a href="${DEAD}">Missing file</a></p>`);
  await page.getByRole("button", { name: "Create post" }).click();
  await page.waitForURL(/\/admin\/blog\/\d+/, { timeout: T });
  postPath = new URL(page.url()).pathname;
  drain();

  // 2. Listed, naming the link.
  await page.goto(`${BASE}/admin/health?type=blog_post`, { waitUntil: "load", timeout: T });
  const row = page.getByRole("row", { name: /Health probe/ });
  await row.first().waitFor({ timeout: 30000 }).catch(() => fail("the dead link was not listed"));
  if (!(await row.first().textContent().catch(() => ""))?.includes(DEAD)) fail("the row does not name the link");

  // 3. Fix → correct the link → save → gone after the queue drains.
  await row.first().getByRole("link", { name: "Fix" }).click();
  await page.waitForURL(/\/admin\/blog\/\d+/, { timeout: T });
  await setBody(page, '<p><a href="/blog">The blog</a></p>');
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText("Saved", { exact: true }).first().waitFor({ timeout: T });
  drain();
  await page.goto(`${BASE}/admin/health?type=blog_post`, { waitUntil: "load", timeout: T });
  if (await page.getByRole("row", { name: /Health probe/ }).count()) fail("the finding is still listed after the fix");

  console.log(process.exitCode ? "health probe FAILED" : "health probe passed");
} catch (e) {
  fail(String(e?.message ?? e).split("\n")[0]);
} finally {
  // 4. Delete the throwaway post through its own screen.
  if (postPath) {
    try {
      await page.goto(`${BASE}${postPath}`, { waitUntil: "load", timeout: T });
      await page.getByRole("button", { name: "Delete post" }).click();
      await page.waitForURL(/\/admin\/blog(\?|$)/, { timeout: T });
    } catch { fail(`could not delete ${postPath}; remove it by hand`); }
  }
  await browser.close();
}
