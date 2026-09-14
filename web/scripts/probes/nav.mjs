import { chromium } from "playwright";

/**
 * Signs in as up to three accounts and prints the sidebar each one is shown,
 * which is how the role-split of the "Site" section was measured rather than
 * reasoned about (see CLAUDE.md, "The two halves of that failed differently").
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/nav.mjs
 *
 * NAV_CM_EMAIL/NAV_CM_PASSWORD and NAV_SE_EMAIL/NAV_SE_PASSWORD add a
 * content-manager and a support-engineer account — create them through
 * /admin/staff and delete them afterwards. Absent, only the administrator's
 * view is printed.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const env = process.env;
const ACCOUNTS = [
  { who: "every role", email: env.ADMIN_LOGIN_EMAIL, password: env.ADMIN_LOGIN_PASSWORD },
  { who: "content_manager", email: env.NAV_CM_EMAIL, password: env.NAV_CM_PASSWORD },
  { who: "support_engineer", email: env.NAV_SE_EMAIL, password: env.NAV_SE_PASSWORD },
].filter((a) => a.email && a.password);
if (!ACCOUNTS.length) { console.error("Set ADMIN_LOGIN_EMAIL and ADMIN_LOGIN_PASSWORD."); process.exit(2); }

async function signIn(page, email, password) {
  await page.goto(`${BASE}/admin/login`, { waitUntil: "load", timeout: 120000 });
  const toPassword = page.locator('button:has-text("Use your password instead")');
  if (await toPassword.count()) {
    await toPassword.first().click();
    await page.waitForSelector("#password", { timeout: 15000 });
  }
  await page.fill("#email", email);
  await page.fill("#password", password);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 120000 }),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForLoadState("networkidle");
}

async function readNav(page) {
  const nav = page.locator("nav").filter({ has: page.locator('a[href="/admin/profile"]') }).first();
  const buttons = nav.locator("button[aria-expanded]:visible");
  const count = await buttons.count();
  const groups = [];
  const inPanels = new Set();

  for (let i = 0; i < count; i++) {
    const b = buttons.nth(i);
    const label = (await b.innerText()).trim().split("\n")[0];
    if ((await b.getAttribute("aria-expanded")) !== "true") await b.click();
    await page.waitForTimeout(150);
    const panelId = await b.getAttribute("aria-controls");
    const rows = panelId
      ? await page.locator(`[id="${panelId}"] a`).evaluateAll((as) =>
          as.map((a) => ({ label: a.textContent.trim(), href: a.getAttribute("href") })))
      : [];
    for (const r of rows) inPanels.add(r.href);
    groups.push({ label, rows });
  }

  const all = await nav.evaluate((el) =>
    [...el.querySelectorAll("a")].map((a) => ({ label: a.textContent.trim(), href: a.getAttribute("href") })));
  const seen = new Set();
  const top = all.filter((a) => !inPanels.has(a.href) && !seen.has(a.href) && seen.add(a.href));
  return { groups, top };
}

const browser = await chromium.launch();
for (const acc of ACCOUNTS) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await signIn(page, acc.email, acc.password);
  const { groups, top } = await readNav(page);
  const rows = top.length + groups.reduce((n, g) => n + g.rows.length, 0);
  console.log("\n=== " + acc.who + "   " + groups.length + " sections, " + rows + " rows");
  for (const t of top) console.log("   " + t.label.padEnd(18) + t.href);
  for (const g of groups) {
    const one = g.rows.length === 1 ? "   <-- one row" : "";
    console.log("  [" + g.label + "] (" + g.rows.length + ")" + one);
    for (const r of g.rows) console.log("      " + r.label.padEnd(18) + r.href);
  }
  await page.close();
}
await browser.close();
