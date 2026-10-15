import { chromium } from "playwright";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The downloads centre (0.131.0, docs/downloads.md), through the real
 * screens: the console's form, the public page, the file route and the
 * portal.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… \
 *   PORTAL_LOGIN_EMAIL=… PORTAL_LOGIN_PASSWORD=… \
 *     node scripts/probes/downloads.mjs
 *   SHOTS=<dir> saves the public page at 360, 768, 1280 and 1920.
 *
 * In the console it creates a download with a **private upload** through the
 * form — the watched path, a real file going up — marked customers only and
 * published; reads the edit screen back (the file named, a count of zero);
 * and checks staff can fetch the file. On the public page it then checks one
 * `h1`, the new row with its lock, no horizontal overflow at 360 or 1280,
 * and nothing logged; that a visitor who is not signed in is sent from the
 * file to the portal's sign-in; that search finds the file and a nonsense
 * term finds nothing. With portal credentials it signs in as a customer,
 * finds the file on `/portal/downloads` and fetches its exact bytes.
 *
 * **It deletes what it made**, through the form's own Delete, and checks the
 * row has left the public page. Carries no credential; the two accounts are
 * throwaway ones the caller made.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const SHOTS = process.env.SHOTS;
const PORTAL_EMAIL = process.env.PORTAL_LOGIN_EMAIL;
const PORTAL_PASSWORD = process.env.PORTAL_LOGIN_PASSWORD;
const T = 180000;

const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const { signInAsStaff, switchToPasswordForm } = await import("../shared.mjs");

const stamp = Date.now().toString(36);
const TITLE = `Probe firmware ${stamp}`;
const BYTES = `probe-firmware-${stamp}\n`.repeat(200);
const dir = mkdtempSync(join(tmpdir(), "tw-downloads-"));
const filePath = join(dir, `probe-fw-${stamp}.bin`);
writeFileSync(filePath, BYTES);

const problems = [];
const listen = (p, where) => {
  p.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(`${where} ${m.type()} at ${p.url().replace(BASE, "")}: ${m.text().slice(0, 2500)}`); });
  p.on("pageerror", (e) => problems.push(`${where} pageerror: ${e.message.slice(0, 300)}`));
};

/* ---- The console: create it with a private upload ---- */

const admin = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await admin.newPage();
listen(page, "console");
await signInAsStaff(page, { timeout: T });

await page.goto(`${BASE}/admin/downloads/new`, { waitUntil: "load", timeout: T });
await page.waitForSelector("#title", { timeout: T });
ok((await page.locator('[role="tab"]').allInnerTexts()).join("|").includes("Details") , "the form has its tabs");

await page.fill("#title", TITLE);
await page.fill("#summary", "Made by the downloads probe and deleted by it.");
await page.fill("#version", "9.9.9");

await page.getByRole("tab", { name: /File/ }).click();
await page.locator('input[name="source"][value="upload"]').check();
ok(await page.locator('#access option[value="customers"]').isEnabled(), "an upload may be limited to customers");
await page.selectOption("#access", "customers");
await page.selectOption("#status", "published");
await page.locator('input[type="file"][name="file"]').setInputFiles(filePath);

const posted = page.waitForResponse((r) => r.url().endsWith("/api/admin/downloads") && r.request().method() === "POST", { timeout: T });
await page.getByRole("button", { name: /Create download/ }).click();
const response = await posted;
ok(response.status() === 201, `the upload was accepted (${response.status()})`);
const created = await response.json().catch(() => null);
const id = created?.data?.id;
ok(Number.isInteger(id), "the API answered with the new download");

await page.waitForURL((u) => /\/admin\/downloads\/\d+$/.test(u.pathname), { timeout: T });
await page.waitForSelector("#title", { timeout: T });
ok(await page.inputValue("#title") === TITLE, "the edit screen opens on what was saved");
await page.getByRole("tab", { name: /File/ }).click();
ok(await page.getByText(`probe-fw-${stamp}.bin`).first().isVisible(), "the uploaded file is named on the File tab");
ok(await page.locator('input[name="source"][value="upload"]').isChecked(), "the source is the upload");
ok((await page.inputValue("#access")) === "customers", "it is customers only");

const staffFile = await admin.request.get(`${BASE}/api/admin/downloads/${id}/file`);
ok(staffFile.status() === 200 && (await staffFile.text()) === BYTES, "staff fetch the exact bytes");
ok((staffFile.headers()["content-disposition"] ?? "").includes("attachment"), "…as an attachment");

/* ---- The public page ---- */

const visitor = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const pub = await visitor.newPage();
listen(pub, "public");

await pub.goto(`${BASE}/downloads`, { waitUntil: "load", timeout: T });
await pub.waitForSelector("[data-download]", { timeout: T });
ok(await pub.locator("h1").count() === 1, "one h1 on /downloads");

const row = pub.locator("[data-download]", { hasText: TITLE });
ok(await row.count() === 1, "the new download is listed");
ok(await row.locator("[data-download-lock]").count() === 1, "…with its lock");
ok((await row.locator("a").getAttribute("href")) === `/api/downloads/${id}`, "its button goes through the site's own route");
ok((await pub.content()).includes("/storage/") === false || !(await row.innerHTML()).includes("/storage/"), "no file address is in the row");

const overflow = async (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(await overflow(pub) <= 0, "no horizontal overflow at 1280");

for (const width of [360, 768, 1280, 1920]) {
  await pub.setViewportSize({ width, height: 900 });
  await pub.waitForTimeout(300);
  if (width === 360) ok(await overflow(pub) <= 0, "no horizontal overflow at 360");
  // `caret: "initial"`: by default a screenshot hides the text caret with an
  // inline style on every input, and one taken while the footer is still
  // hydrating is then a hydration mismatch that is the probe's own doing.
  if (SHOTS) await pub.screenshot({ path: join(SHOTS, `downloads-${width}.png`), fullPage: true, caret: "initial" });
}
await pub.setViewportSize({ width: 1280, height: 900 });

// Not signed in: the file is a redirect to the portal's sign-in, and no bytes.
const refused = await visitor.request.get(`${BASE}/api/downloads/${id}`, { maxRedirects: 0 });
ok(refused.status() === 303 && (refused.headers().location ?? "").startsWith("/portal/login?return="), "a visitor is sent to sign in");

await pub.goto(`${BASE}/downloads?q=${encodeURIComponent(TITLE)}`, { waitUntil: "load", timeout: T });
ok(await pub.locator("[data-download]").count() === 1, "search finds exactly that file");
ok((await pub.locator('meta[name="robots"]').getAttribute("content") ?? "").includes("noindex"), "a search is not indexed");
await pub.goto(`${BASE}/downloads?q=zzqx-${stamp}`, { waitUntil: "load", timeout: T });
ok(await pub.locator("[data-download]").count() === 0 && await pub.getByText(/Nothing found/).count() === 1, "a nonsense search says so");

/* ---- The portal ---- */

if (PORTAL_EMAIL && PORTAL_PASSWORD) {
  const customer = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const portal = await customer.newPage();
  listen(portal, "portal");

  await portal.goto(`${BASE}/portal/login`, { waitUntil: "load", timeout: T });
  await switchToPasswordForm(portal);
  await portal.fill("#email", PORTAL_EMAIL);
  await portal.fill("#password", PORTAL_PASSWORD);
  await Promise.all([
    portal.waitForURL((u) => !u.pathname.startsWith("/portal/login"), { timeout: T }),
    portal.click('button[type="submit"]'),
  ]);

  await portal.goto(`${BASE}/portal/downloads`, { waitUntil: "load", timeout: T });
  await portal.waitForSelector("[data-download]", { timeout: T });
  ok(await portal.locator("h1").count() === 1, "one h1 on /portal/downloads");
  ok(await portal.locator("[data-download]", { hasText: TITLE }).count() === 1, "the customer's list holds the file");
  ok(await portal.getByRole("link", { name: "Downloads", exact: true }).count() >= 1, "the portal's menu links to it");

  const fetched = await customer.request.get(`${BASE}/api/downloads/${id}`);
  ok(fetched.status() === 200 && (await fetched.text()) === BYTES, "a signed-in customer fetches the exact bytes");
  ok((fetched.headers()["content-disposition"] ?? "").includes(`probe-fw-${stamp}.bin`), "…named as it was uploaded");

  await portal.setViewportSize({ width: 360, height: 800 });
  await portal.waitForTimeout(300);
  ok(await overflow(portal) <= 0, "no horizontal overflow on the portal page at 360");
  if (SHOTS) await portal.screenshot({ path: join(SHOTS, "portal-downloads-360.png"), fullPage: true, caret: "initial" });
  await customer.close();
} else {
  console.log("skip the portal half: PORTAL_LOGIN_EMAIL / PORTAL_LOGIN_PASSWORD are not set");
}

/* ---- The count, then the clean-up ---- */

await page.goto(`${BASE}/admin/downloads/${id}`, { waitUntil: "load", timeout: T });
await page.waitForSelector("#title", { timeout: T });
if (PORTAL_EMAIL && PORTAL_PASSWORD) {
  ok(await page.getByText(/Downloaded\s+1\s+time\./).count() === 1, "the one customer download was counted, and the refusals were not");
}

await Promise.all([
  page.waitForURL((u) => u.pathname === "/admin/downloads", { timeout: T }),
  page.getByRole("button", { name: "Delete download" }).click(),
]);
ok(page.url().includes("done=download-deleted"), "the probe's download was deleted");

await pub.goto(`${BASE}/downloads?q=${encodeURIComponent(TITLE)}`, { waitUntil: "load", timeout: T });
ok(await pub.locator("[data-download]").count() === 0, "and it has left the public page");
const gone = await visitor.request.get(`${BASE}/api/downloads/${id}`, { maxRedirects: 0 });
ok(gone.status() === 404, "its file route is a 404");

ok(problems.length === 0, "nothing logged to the console");
for (const p of problems) console.log("  " + p);

await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
