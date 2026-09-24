/**
 * "View as": a support engineer opens the portal as a customer from the
 * console, in a new tab, and ends the session.
 *
 * Measures the whole chain through the real screens rather than the API:
 * the form on the customer list opens a new tab (a POST with
 * `target="_blank"`), the tab lands on `/portal` carrying the banner, the
 * portal reads as that customer, End revokes the token and lands the tab on
 * the customer's record with the toast — and the customer's own session,
 * signed in beforehand in a second context, is still alive afterwards. Then
 * the two refusals: a content manager's list carries no button and a
 * hand-crafted POST from that session is 403, and a cross-site POST with
 * no admin cookie is 401 (the `sameSite: lax` argument in `route.ts`).
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=…   a support engineer
 *   CM_LOGIN_EMAIL=… CM_LOGIN_PASSWORD=…         a content manager
 *   CUSTOMER_LOGIN_EMAIL=… CUSTOMER_LOGIN_PASSWORD=…   the active customer
 *   CUSTOMER_ID=…                                 that customer's id
 *   node scripts/probes/impersonation.mjs
 */
import { chromium } from "playwright";
import { switchToPasswordForm } from "../shared.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const env = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set`);
  return v;
};

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function signIn(context, loginPath, doneRe, email, password) {
  const page = await context.newPage();
  await page.goto(`${BASE}${loginPath}`, { waitUntil: "load", timeout: 180_000 });
  await switchToPasswordForm(page);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await Promise.all([
    page.waitForURL(doneRe, { timeout: 180_000 }),
    page.click('button[type="submit"]'),
  ]);
  return page;
}

const signInStaff = (ctx, email, pw) => signIn(ctx, "/admin/login", (u) => !u.pathname.startsWith("/admin/login"), email, pw);
const signInCustomer = (ctx, email, pw) => signIn(ctx, "/portal/login", (u) => !u.pathname.startsWith("/portal/login"), email, pw);

const browser = await chromium.launch();
try {
  const customerId = env("CUSTOMER_ID");

  // The customer's own session, in its own browser context, before anything else.
  const customerCtx = await browser.newContext();
  const customerPage = await signInCustomer(customerCtx, env("CUSTOMER_LOGIN_EMAIL"), env("CUSTOMER_LOGIN_PASSWORD"));
  check("customer signs in on their own", /\/portal/.test(customerPage.url()));

  // The engineer.
  const staffCtx = await browser.newContext();
  const list = await signInStaff(staffCtx, env("ADMIN_LOGIN_EMAIL"), env("ADMIN_LOGIN_PASSWORD"));
  await list.goto(`${BASE}/admin/customers?q=${encodeURIComponent(env("CUSTOMER_LOGIN_EMAIL"))}`, { waitUntil: "load", timeout: 180_000 });
  await list.waitForSelector("table.admin-table", { timeout: 120_000 });

  const form = list.locator(`form[action="/api/admin/customers/${customerId}/impersonate"]`).first();
  check("the list carries a View as form for the active customer", (await form.count()) === 1);
  check("it is a POST form opening a new tab",
    (await form.getAttribute("method"))?.toLowerCase() === "post" && (await form.getAttribute("target")) === "_blank");
  check("no next/link points at the route handler",
    (await list.locator(`a[href*="/impersonate"]`).count()) === 0);

  const [tab] = await Promise.all([
    staffCtx.waitForEvent("page"),
    form.getByRole("button").click(),
  ]);
  await tab.waitForURL(/\/portal/, { timeout: 180_000 });
  await tab.waitForLoadState("load");
  check("the new tab lands on the portal", /\/portal\/?$/.test(tab.url()), tab.url());

  const banner = tab.getByRole("status").filter({ hasText: /viewing the portal as/i });
  check("the banner names the customer and says staff",
    (await banner.count()) === 1 && /Probe Customer/.test(await banner.first().innerText()) && /staff/i.test(await banner.first().innerText()));
  check("the portal reads as the customer", /probe-customer@example\.test/.test(await tab.locator("body").innerText()));

  // A tab the engineer browses, then ends.
  await tab.goto(`${BASE}/portal/tickets`, { waitUntil: "load", timeout: 180_000 });
  check("the banner is on every portal page", (await tab.getByRole("status").filter({ hasText: /viewing the portal as/i }).count()) === 1);

  await tab.getByRole("button", { name: /^end$/i }).click();
  await tab.waitForURL(new RegExp(`/admin/customers/${customerId}`), { timeout: 180_000 });
  await tab.waitForLoadState("load");
  check("End lands on the customer's record in the console", true, tab.url());
  const toast = await tab.getByText(/stopped viewing as the customer/i).first().waitFor({ timeout: 30_000 }).then(() => 1).catch(() => 0);
  check("with the toast", toast >= 1);

  // The customer's own session survived the whole exercise.
  await customerPage.goto(`${BASE}/portal`, { waitUntil: "load", timeout: 180_000 });
  check("the customer's own session is untouched", /\/portal\/?$/.test(customerPage.url()) && (await customerPage.getByRole("status").filter({ hasText: /viewing the portal as/i }).count()) === 0);

  // A content manager: no button, and a hand-crafted POST is 403.
  const cmCtx = await browser.newContext();
  const cm = await signInStaff(cmCtx, env("CM_LOGIN_EMAIL"), env("CM_LOGIN_PASSWORD"));
  const cmList = await cm.goto(`${BASE}/admin/customers`, { waitUntil: "load", timeout: 180_000 });
  check("a content manager cannot open the customer list at all", cmList?.status() === 404 || !/\/admin\/customers/.test(cm.url()), `${cmList?.status()} ${cm.url()}`);
  const forged = await cmCtx.request.post(`${BASE}/api/admin/customers/${customerId}/impersonate`, { maxRedirects: 0 });
  check("a content manager's hand-crafted POST is 403", forged.status() === 403, String(forged.status()));

  // No admin cookie at all — what a cross-site form POST arrives as.
  const anon = await browser.newContext();
  const noCookie = await anon.request.post(`${BASE}/api/admin/customers/${customerId}/impersonate`, { maxRedirects: 0 });
  check("without the admin cookie the handler answers 401", noCookie.status() === 401, String(noCookie.status()));
  const wrongOrigin = await staffCtx.request.post(`${BASE}/api/admin/customers/${customerId}/impersonate`, {
    maxRedirects: 0, headers: { origin: "https://attacker.example" },
  });
  check("a foreign Origin is refused even with the cookie", wrongOrigin.status() === 403, String(wrongOrigin.status()));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
