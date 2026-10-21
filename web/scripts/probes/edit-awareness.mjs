import { chromium } from "playwright";

/**
 * Two editors on one page (0.187.0, docs/notifications.md): who else has it
 * open, and a save refused over a newer one.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/edit-awareness.mjs
 *
 * `BASE` is the console (default http://localhost:3000), `API` the API
 * (default http://127.0.0.1:8000). The administrator signs in to the API only
 * to make two **throwaway content managers** and one **draft page**, and
 * deletes all three at the end. No credential is in this file.
 *
 * What it checks:
 *   1. each editor's strip says the other "has this open" within 45s (one
 *      20-second beat after both pages have hydrated, with slack);
 *   2. after A saves, B's save is refused with the stale alert, and B's typed
 *      title is still in the field;
 *   3. "Load the newer version" reloads, the draft bar offers Restore, and
 *      after Restore the save succeeds;
 *   4. after another save by A, B's "Save mine anyway" succeeds;
 *   5. nothing is logged.
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
const made = [];
async function staff(tag) {
  const out = await api("/admin/staff", { method: "POST", token: admin, body: {
    name: `Probe ${tag} ${stamp}`, email: `probe-${tag}-${stamp}@example.test`, phone: "9876543210",
    roles: ["content_manager"], is_active: true,
  } });
  if (out.status !== 201) throw new Error(`staff ${tag}: ${out.status} ${JSON.stringify(out.json)}`);
  made.push(out.json.data.id);
  return { name: out.json.data.name, email: out.json.data.email, password: out.json.data.generated_password };
}

const browser = await chromium.launch();
const problems = [];
let pageId = null;

async function editor(account) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();
  // `next dev` forwards its own MaxListeners warning to the browser (CLAUDE.md, "How the audits behave").
  page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("MaxListenersExceededWarning")) problems.push(`${account.name}: ${m.text().slice(0, 300)}`); });
  page.on("pageerror", (e) => problems.push(`${account.name}: pageerror ${e.message.slice(0, 300)}`));
  // The leave guard asks before a reload with unsaved typing; the probe means it.
  page.on("dialog", (d) => d.accept());
  await page.goto(`${BASE}/admin/login`, { waitUntil: "load", timeout: T });
  const toPassword = page.locator('button:has-text("Use your password instead")');
  if (await toPassword.count()) await toPassword.first().click();
  await page.fill("#email", account.email);
  await page.fill("#password", account.password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: T }), page.click('button[type="submit"]')]);
  return page;
}

const open = async (page) => {
  await page.goto(`${BASE}/admin/pages/${pageId}`, { waitUntil: "load", timeout: T });
  await page.locator('input[name="title"]').waitFor({ timeout: T });
};
const saveTitle = async (page, title) => {
  await page.locator('input[name="title"]').fill(title);
  await page.getByRole("button", { name: "Save changes" }).click();
};
const freshTitle = async () => (await api(`/admin/pages/${pageId}`, { token: admin })).json?.data?.title;
// The saved title read back from the API — `?saved=1` is stripped from the URL by the toast handler, so it cannot be waited on.
const savedAs = async (page, title) => {
  for (let i = 0; i < 60; i++) {
    if ((await freshTitle()) === title) {
      await page.waitForLoadState("networkidle").catch(() => {});
      return true;
    }
    await page.waitForTimeout(1000);
  }
  return false;
};

try {
  const page = await api("/admin/pages", { method: "POST", token: admin, body: { title: `Probe page ${stamp}`, slug: `probe-page-${stamp}`, body: "<p>x</p>", template: "default", status: "draft" } });
  if (page.status !== 201) throw new Error(`page: ${page.status} ${JSON.stringify(page.json)}`);
  pageId = page.json.data.id;

  const a = await staff("a");
  const b = await staff("b");
  const pa = await editor(a);
  const pb = await editor(b);
  await open(pa);
  await open(pb);

  // 1. Each sees the other.
  const sees = (p, who) => p.locator("[data-edit-presence]").getByText(`${who} has this open.`).waitFor({ timeout: 45000 }).then(() => true, () => false);
  ok(await sees(pb, a.name), "B sees A has it open");
  ok(await sees(pa, b.name), "A sees B has it open");

  // 2. A saves; B's save is refused with B's typing kept.
  await pa.waitForTimeout(1100); // the guard compares to the second
  await saveTitle(pa, `A title ${stamp}`);
  ok(await savedAs(pa, `A title ${stamp}`), "A's save goes through");
  await saveTitle(pb, `B title ${stamp}`);
  const stale = pb.locator("[data-stale-alert]");
  ok(await stale.waitFor({ timeout: T }).then(() => true, () => false), "B's save is refused with the stale alert");
  ok(await stale.getByText(`${a.name} saved this at`).count() === 1, "the alert names A");
  ok(await pb.locator('input[name="title"]').inputValue() === `B title ${stamp}`, "B's typed title is still in the field");
  ok(await freshTitle() === `A title ${stamp}`, "A's version was not overwritten");

  // 3. Load the newer version, restore, save.
  await Promise.all([pb.waitForEvent("load", { timeout: T }), pb.getByRole("button", { name: "Load the newer version" }).click()]);
  const restore = pb.getByRole("button", { name: "Restore" });
  ok(await restore.waitFor({ timeout: T }).then(() => true, () => false), "after the reload the draft bar offers Restore");
  await restore.click();
  ok(await pb.locator('input[name="title"]').inputValue() === `B title ${stamp}`, "Restore puts B's title back");
  await pb.getByRole("button", { name: "Save changes" }).click();
  ok(await savedAs(pb, `B title ${stamp}`), "after Restore, B's save goes through");
  ok(await pb.locator("[data-stale-alert]").count() === 0, "and is not refused");

  // 4. Save mine anyway.
  await open(pa);
  await open(pb);
  await pa.waitForTimeout(1100);
  await saveTitle(pa, `A again ${stamp}`);
  ok(await savedAs(pa, `A again ${stamp}`), "A saves again");
  await saveTitle(pb, `B wins ${stamp}`);
  ok(await pb.locator("[data-stale-alert]").waitFor({ timeout: T }).then(() => true, () => false), "B is refused again");
  await pb.getByRole("button", { name: "Save mine anyway" }).click();
  ok(await savedAs(pb, `B wins ${stamp}`), "Save mine anyway goes through, replacing A's version");
} catch (e) {
  ok(false, `probe stopped: ${e.message}`);
} finally {
  // Close the browsers first: an open edit screen beating on a deleted page logs a 404 as an error.
  await browser.close();
  if (pageId) await api(`/admin/pages/${pageId}`, { method: "DELETE", token: admin });
  for (const id of made) await api(`/admin/staff/${id}`, { method: "DELETE", token: admin });
}

ok(problems.length === 0, `nothing logged${problems.length ? `:\n  ${problems.join("\n  ")}` : ""}`);
process.exit(failed ? 1 : 0);
