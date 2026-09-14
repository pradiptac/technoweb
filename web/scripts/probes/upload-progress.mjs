/**
 * Do the watched uploads actually report a percentage?
 *
 * Three paths, each with a file large enough that the bar has time to move:
 * the media library (admin), a new ticket with two attachments (portal), and
 * a job application with a CV (public). Each asserts that the progress
 * caption showed a number strictly between 0 and 100 at some point, and that
 * the upload then completed as the old path would have.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… PORTAL_LOGIN_EMAIL=… PORTAL_LOGIN_PASSWORD=…
 *   node scripts/probes/upload-progress.mjs
 */
import { chromium } from "playwright";
import { BASE, signInAsStaff, switchToPasswordForm } from "../shared.mjs";

const JOB = process.env.JOB_SLUG ?? "hardware-engineer";
const MB = 1024 * 1024;
// A real photograph from the library, for the paths that validate an image.
const JPEG = process.env.PROBE_JPEG ?? "../api/storage/app/public/media/2026/08/XolDQNdcG0gKR7oQneOAZ6k0jXaVYeeND6iYlZAe.jpg";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(120000);

// Throttle uploads so a local server does not finish before the first
// progress event: 4Mbit/s up is a phone on a fair connection.
const cdp = await context.newCDPSession(page);
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 20, downloadThroughput: 50 * MB, uploadThroughput: (4 * MB) / 8 });

/** Watch the progress caption until the upload ends; return the percentages seen. */
async function watchPercentages(timeoutMs = 90000) {
  const seen = new Set();
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const texts = await page.$$eval('[role="progressbar"]', (els) => els.map((el) => el.parentElement?.querySelector(".tabular-nums")?.textContent ?? ""));
    for (const t of texts) { const m = t.match(/(\d{1,3})%/); if (m) seen.add(Number(m[1])); }
    if (texts.length === 0 && seen.size > 0) break;
    await page.waitForTimeout(80);
  }
  return [...seen].sort((a, b) => a - b);
}

const results = [];

// ---------------------------------------------------------------- admin media
await signInAsStaff(page);
await page.goto(`${BASE}/admin/media`, { waitUntil: "networkidle" });
const before = await page.locator("[data-media-id], article").count();
const mediaInput = page.locator('input[type="file"]').first();
await mediaInput.setInputFiles(JPEG);
const mediaPcts = await watchPercentages();
await page.waitForTimeout(1500);
const mediaMsg = await page.locator("text=/uploaded|failed|did not complete|too large|not be greater/i").first().textContent({ timeout: 5000 }).catch(() => "(no message found)");
results.push({ path: "admin media", pcts: mediaPcts, outcome: mediaMsg?.trim(), before });

// ---------------------------------------------------------------- portal ticket
await context.clearCookies();
await page.goto(`${BASE}/portal/login`, { waitUntil: "load" });
await switchToPasswordForm(page);
await page.fill("#email", process.env.PORTAL_LOGIN_EMAIL);
await page.fill("#password", process.env.PORTAL_LOGIN_PASSWORD);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/portal/login")), page.click('button[type="submit"]')]);
await page.goto(`${BASE}/portal/tickets/new`, { waitUntil: "networkidle" });
await page.fill("#subject", "Upload progress probe");
await page.fill("#description", "Two attachments, watched. Delete me.");
await page.locator("#attachments").setInputFiles([JPEG, JPEG]);
await page.click('button:has-text("Submit ticket")');
const ticketPcts = await watchPercentages();
await page.waitForURL((u) => /\/portal\/tickets\/TW-/.test(u.pathname), { timeout: 60000 }).catch(() => {});
const ticketRefusal = /TW-/.test(page.url()) ? "" : await page.locator('[role="alert"]').first().textContent().catch(() => "");
results.push({ path: "portal ticket", pcts: ticketPcts, outcome: page.url() + (ticketRefusal ? ` — ${ticketRefusal.trim()}` : "") });

// ---------------------------------------------------------------- careers
await context.clearCookies();
await page.goto(`${BASE}/careers/${JOB}`, { waitUntil: "networkidle" });
const dialog = page.locator("dialog[open]");
if (await dialog.count()) await page.keyboard.press("Escape");
await page.fill("#name", "Probe Applicant");
await page.fill("#email", "probe-applicant@technoware.invalid");
await page.locator("#cv").setInputFiles(process.env.PROBE_PDF ?? "../api/storage/app/public/media/2026/08/fe3toUxdcV5vxbNb2UqtwHVXWfWwvcygGjZOZ2fA.pdf");
await page.click('form:has(#cv) button[type="submit"]');
const cvPcts = await watchPercentages();
await page.waitForTimeout(1500);
const sent = await page.locator("text=Your application is with us").count();
const refusal = sent ? "" : await page.locator('[role="alert"]').first().textContent().catch(() => "");
results.push({ path: "careers cv", pcts: cvPcts, outcome: sent ? "sent" : `not sent: ${refusal?.trim()}` });

await browser.close();

let ok = true;
for (const r of results) {
  const moved = r.pcts.some((p) => p > 0 && p < 100);
  console.log(`${r.path.padEnd(14)} percentages seen: ${r.pcts.join(" ") || "-"}  → ${r.outcome}`);
  if (!moved) ok = false;
}
console.log(ok ? "PASS: every path reported a percentage between 0 and 100" : "FAIL");
process.exit(ok ? 0 : 1);
