import { chromium } from "playwright";

/**
 * Native analytics, end to end (0.188.0, docs/analytics.md): a visitor's
 * pages, an outbound click and a search that finds nothing reach the console's
 * Analytics screen, and a signed-in staff browser adds nothing.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/native-analytics.mjs
 *
 * `BASE` is the site (default http://localhost:3000), `API` the API (default
 * http://127.0.0.1:8000). The administrator signs in to the API only to make
 * one **throwaway SEO manager**, who is deleted at the end. No credential is
 * in this file. Needs `native_analytics_enabled` on and, for the dev machine's
 * address, no entry in "Addresses to leave out".
 *
 * What it checks:
 *   1. a fresh visitor opens `/`, goes to `/about` and `/contact` in the site,
 *      presses an outbound link and searches for `zzqqxx` (the beacon waits for
 *      the page to be idle, so the probe waits too);
 *   2. the SEO manager's Analytics screen (`?period=7`) reads at least one
 *      visit, lists `/about` under Top pages and `zzqqxx` under "Searches that
 *      found nothing";
 *   3. the SEO manager opening `/` writes no hit (the page's views today are
 *      the same before and after) — staff are not counted;
 *   4. nothing is logged.
 *
 * The visitor's browser says it is Chrome: the default headless agent names
 * itself, and the collector rightly refuses to count it as a person.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const API = `${process.env.API ?? "http://127.0.0.1:8000"}/api/v1`;
const T = 120000;
const env = process.env;
if (!env.ADMIN_LOGIN_EMAIL || !env.ADMIN_LOGIN_PASSWORD) { console.error("Set ADMIN_LOGIN_EMAIL and ADMIN_LOGIN_PASSWORD."); process.exit(2); }

let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

async function api(path, { method = "GET", body, token } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Accept: "application/json", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

const login = await api("/admin/auth/login", { method: "POST", body: { email: env.ADMIN_LOGIN_EMAIL, password: env.ADMIN_LOGIN_PASSWORD } });
if (login.status !== 200) { console.error(`Sign-in to the API failed (${login.status}).`); process.exit(2); }
const admin = login.json.token;

const stamp = Date.now().toString(36);
let staffId = null;
const created = await api("/admin/staff", { method: "POST", token: admin, body: {
  name: `Probe analytics ${stamp}`, email: `probe-analytics-${stamp}@example.test`, phone: "9876543210", roles: ["seo_manager"], is_active: true,
} });
if (created.status !== 201) { console.error(`Could not make the throwaway SEO manager (${created.status}).`); process.exit(2); }
staffId = created.json.data.id;
const account = { email: created.json.data.email, password: created.json.data.generated_password };

const browser = await chromium.launch();
const problems = [];
const watch = (page, who) => {
  page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("MaxListenersExceededWarning")) problems.push(`${who}: ${m.text().slice(0, 300)}`); });
  page.on("pageerror", (e) => problems.push(`${who}: pageerror ${e.message.slice(0, 300)}`));
};
const idle = (page) => page.waitForLoadState("networkidle", { timeout: T }).catch(() => {});

try {
  // 1. A visitor, in a context that has never signed in.
  const visitor = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  });
  const v = await visitor.newPage();
  watch(v, "visitor");
  await v.goto(`${BASE}/`, { waitUntil: "load", timeout: T });
  await idle(v);
  await v.waitForTimeout(4000);
  for (const path of ["/about", "/contact"]) {
    await v.evaluate((p) => { const a = document.createElement("a"); a.href = p; a.textContent = "go"; a.id = "probe-go"; document.body.appendChild(a); }, path);
    await v.locator("#probe-go").click();
    await v.waitForURL((u) => u.pathname === path, { timeout: T });
    await idle(v);
    await v.waitForTimeout(4000);
    await v.evaluate(() => document.getElementById("probe-go")?.remove());
  }
  await v.evaluate(() => { const a = document.createElement("a"); a.href = "https://example.com/"; a.id = "probe-out"; a.target = "_blank"; a.textContent = "out"; document.body.appendChild(a); });
  await v.locator("#probe-out").click();
  await v.waitForTimeout(1500);
  await v.goto(`${BASE}/search?q=zzqqxx`, { waitUntil: "load", timeout: T });
  await idle(v);
  await v.waitForTimeout(3000);
  ok(true, "the visitor opened /, /about, /contact, pressed an outbound link and searched for zzqqxx");

  // 2. The SEO manager reads it.
  const staffCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const s = await staffCtx.newPage();
  watch(s, "staff");
  await s.goto(`${BASE}/admin/login`, { waitUntil: "load", timeout: T });
  const toPassword = s.locator('button:has-text("Use your password instead")');
  if (await toPassword.count()) await toPassword.first().click();
  await s.fill("#email", account.email);
  await s.fill("#password", account.password);
  await Promise.all([s.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: T }), s.click('button[type="submit"]')]);

  await s.goto(`${BASE}/admin/analytics?period=7`, { waitUntil: "load", timeout: T });
  await s.locator('section[aria-label="Totals"]').waitFor({ timeout: T });
  await s.waitForTimeout(1500);
  const visits = await s.evaluate(() => {
    const label = document.querySelector('section[aria-label="Totals"] p[title="Visits"]');
    const m = (label?.parentElement?.innerText ?? "").match(/\d[\d,]*/);
    return m ? Number(m[0].replace(/,/g, "")) : null;
  });
  ok(visits !== null && visits >= 1, `the Visits tile reads at least 1 (read ${visits})`);
  const body = await s.locator("main").innerText();
  const top = body.slice(body.indexOf("Top pages"));
  ok(body.includes("Top pages") && top.slice(0, 600).includes("/about"), "Top pages lists /about");
  const nothing = body.slice(body.indexOf("Searches that found nothing"));
  ok(body.includes("Searches that found nothing") && nothing.slice(0, 400).includes("zzqqxx"), "Searches that found nothing lists zzqqxx");

  // 3. Staff add nothing.
  const todayViews = async () => {
    const out = await api("/admin/analytics/pages?path=%2F", { token: admin });
    return (out.json?.data?.series ?? []).reduce((n, p) => n + p.views, 0);
  };
  const before = await todayViews();
  await s.goto(`${BASE}/`, { waitUntil: "load", timeout: T });
  await idle(s);
  await s.waitForTimeout(5000);
  const after = await todayViews();
  ok(before === after, `a signed-in staff load of / writes no hit (${before} before, ${after} after)`);

  ok(problems.length === 0, `nothing logged${problems.length ? `: ${problems.slice(0, 3).join(" | ")}` : ""}`);
} catch (e) {
  console.error(e);
  failed++;
} finally {
  await browser.close();
  if (staffId) await api(`/admin/staff/${staffId}`, { method: "DELETE", token: admin });
}

console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
