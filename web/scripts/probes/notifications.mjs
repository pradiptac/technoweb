import { chromium } from "playwright";

/**
 * The Notifications card on Your account (0.185.0, docs/digest-alerts.md).
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/notifications.mjs
 *
 * Sign in as a **throwaway administrator**: it saves that account's own
 * digest choices twice (changed, then put back).
 *
 * What it checks:
 *   - the card is drawn under a "Notifications" heading;
 *   - "Skip a day when everything is zero" and the digest hour are saved and
 *     survive React's form reset and a reload;
 *   - with browser push not set up, "Get alerts in this browser" is absent
 *     and the "not set up" line is present;
 *   - nothing logged.
 * It **never** presses "Send me today's digest" or "Send a test alert".
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const T = 180000;

const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const { signInAsStaff } = await import("../shared.mjs");

const problems = [];
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text().slice(0, 400)}`); });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`));

const open = async () => {
  await page.goto(`${BASE}/admin/profile`, { waitUntil: "load", timeout: T });
  await page.getByRole("heading", { name: "Notifications" }).waitFor({ timeout: T });
  await page.waitForTimeout(1200);
};
const skip = () => page.locator('input[type="checkbox"][name="digest_skip_quiet"]');
const hour = () => page.locator('select[name="digest_hour"]');
const save = async () => {
  await page.getByRole("button", { name: "Save notification settings" }).click();
  await page.getByText("Your notification settings are saved.").waitFor({ timeout: T });
};

try {
  await signInAsStaff(page);
  await open();
  ok(true, "the Notifications card is drawn");

  const wasSkip = await skip().isChecked();
  const wasHour = await hour().inputValue();
  const newHour = wasHour === "9" ? "10" : "9";

  await skip().setChecked(!wasSkip, { force: true });
  await hour().selectOption(newHour);
  await save();
  ok(await skip().isChecked() === !wasSkip, "the switch still reads as saved after the form reset");
  ok(await hour().inputValue() === newHour, "the hour still reads as saved after the form reset");

  await open();
  ok(await skip().isChecked() === !wasSkip, "the switch survives a reload");
  ok(await hour().inputValue() === newHour, "the hour survives a reload");

  ok(await page.getByRole("button", { name: "Get alerts in this browser" }).count() === 0, "no subscribe button while push is not set up");
  ok(await page.getByText("Browser notifications are not set up on this site.").count() === 1, "the not-set-up line is shown");

  // Put it back.
  await skip().setChecked(wasSkip, { force: true });
  await hour().selectOption(wasHour);
  await save();
} catch (e) {
  ok(false, `probe stopped: ${e.message}`);
}

/*
 * The bell (0.187.0, docs/notifications.md): A mentions B in a team note on a
 * draft page; B's bell shows a count within 70s, the drawer lists the line,
 * pressing it opens the page and the count drops. The administrator signs in
 * to the API (`API`, default http://127.0.0.1:8000) only to make the two
 * throwaway content managers and the page, and deletes them after.
 */
{
  const API = `${process.env.API ?? "http://127.0.0.1:8000"}/api/v1`;
  const call = async (path, { method = "GET", body, token } = {}) => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { Accept: "application/json", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  };
  const made = [];
  let pageId = null;
  let admin = null;
  try {
    admin = (await call("/admin/auth/login", { method: "POST", body: { email: process.env.ADMIN_LOGIN_EMAIL, password: process.env.ADMIN_LOGIN_PASSWORD } })).json?.token;
    if (!admin) throw new Error("could not sign in to the API");
    const stamp = Date.now().toString(36);
    const staff = async (tag) => {
      const out = await call("/admin/staff", { method: "POST", token: admin, body: {
        name: `Bell ${tag} ${stamp}`, email: `bell-${tag}-${stamp}@example.test`, phone: "9876543210", roles: ["content_manager"], is_active: true,
      } });
      if (out.status !== 201) throw new Error(`staff ${tag}: ${out.status}`);
      made.push(out.json.data.id);
      return { name: out.json.data.name, email: out.json.data.email, password: out.json.data.generated_password };
    };
    const created = await call("/admin/pages", { method: "POST", token: admin, body: { title: `Bell page ${stamp}`, slug: `bell-page-${stamp}`, body: "<p>x</p>", template: "default", status: "draft" } });
    pageId = created.json?.data?.id;
    if (!pageId) throw new Error(`page: ${created.status}`);
    const a = await staff("a");
    const b = await staff("b");

    const signIn = async (account) => {
      const p = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
      p.on("pageerror", (e) => problems.push(`${account.name}: pageerror ${e.message.slice(0, 300)}`));
      await p.goto(`${BASE}/admin/login`, { waitUntil: "load", timeout: T });
      const toPassword = p.locator('button:has-text("Use your password instead")');
      if (await toPassword.count()) await toPassword.first().click();
      await p.fill("#email", account.email);
      await p.fill("#password", account.password);
      await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: T }), p.click('button[type="submit"]')]);
      return p;
    };

    const pa = await signIn(a);
    await pa.goto(`${BASE}/admin/pages/${pageId}`, { waitUntil: "load", timeout: T });
    await pa.getByRole("button", { name: /^Team notes/ }).click();
    const box = pa.locator('[data-record-notes] textarea[name="body"]');
    await box.click();
    await box.pressSequentially(`Can you check this, @${b.name.split(" ")[0]}`, { delay: 30 });
    const option = pa.getByRole("option", { name: b.name });
    ok(await option.waitFor({ timeout: 15000 }).then(() => true, () => false), "typing @ offers the colleague");
    await option.click();
    ok((await box.inputValue()).includes(`@${b.name} `), "choosing writes their full name");
    await pa.getByRole("button", { name: "Post note" }).click();
    ok(await pa.locator("[data-record-notes]").getByText(`@${b.name}`).first().waitFor({ timeout: T }).then(() => true, () => false), "the note is posted with the name");

    const pb = await signIn(b);
    await pb.goto(`${BASE}/admin`, { waitUntil: "load", timeout: T });
    const bell = pb.getByRole("button", { name: /^Notifications, 1 unread/ });
    ok(await bell.waitFor({ timeout: 70000 }).then(() => true, () => false), "B's bell shows 1 unread within 70s");

    // A failed poll draws no number — never the last one it read.
    await pb.route("**/api/admin/new-since**", (r) => r.fulfill({ status: 502, body: "{}" }));
    await pb.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    ok(await pb.getByRole("button", { name: "Notifications", exact: true }).waitFor({ timeout: 15000 }).then(() => true, () => false), "a failed poll removes the number");
    await pb.unroute("**/api/admin/new-since**");
    await pb.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await bell.waitFor({ timeout: 15000 });
    await bell.click();
    const line = pb.locator("[data-notifications-drawer]").getByText(`${a.name} mentioned you in a note on Bell page ${stamp}.`);
    ok(await line.waitFor({ timeout: T }).then(() => true, () => false), "the drawer lists the line");
    await Promise.all([pb.waitForURL((u) => u.pathname === `/admin/pages/${pageId}`, { timeout: T }), line.click()]);
    ok(true, "pressing it opens the page");
    ok(await pb.getByRole("button", { name: "Notifications" }).waitFor({ timeout: 70000 }).then(() => true, () => false), "the count drops");
  } catch (e) {
    ok(false, `bell probe stopped: ${e.message}`);
  } finally {
    if (admin && pageId) await call(`/admin/pages/${pageId}`, { method: "DELETE", token: admin });
    for (const id of made) await call(`/admin/staff/${id}`, { method: "DELETE", token: admin });
  }
}

ok(problems.length === 0, `nothing logged${problems.length ? `:\n  ${problems.join("\n  ")}` : ""}`);
await browser.close();
process.exit(failed ? 1 : 0);
