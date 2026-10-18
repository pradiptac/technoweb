/**
 * Writing help in the editors (0.183.0, docs/superpowers/specs/2026-10-18-ai-writing-design.md).
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/ai-writing.mjs
 *
 * Reads /admin/writing/status with the session token the sign-in leaves.
 *  - Off: the post editor has no visible AI button, the summary field has no writing-help
 *    button and an open ticket has no "Draft a reply"; prints "off — no AI controls drawn".
 *  - On: all three are there, and the panel opens on the post editor with the six modes.
 * The answer to Suggest is a stub (the server action is intercepted in the browser), so it spends nothing
 * and writes nothing. API_BASE_URL overrides the API.
 */
import { chromium } from "playwright";

const { signInAsStaff, BASE } = await import("../shared.mjs");

const T = 120000;
const API = `${process.env.API_BASE_URL ?? "http://127.0.0.1:8000"}/api/v1`;
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(T);
try {
  await signInAsStaff(page, { timeout: T });
  const cookie = (await context.cookies()).find((c) => c.name === "tw_admin_session");
  const headers = { Authorization: `Bearer ${decodeURIComponent(cookie?.value ?? "")}`, Accept: "application/json" };
  const status = (await (await fetch(`${API}/admin/writing/status`, { headers })).json()).data;
  if (!status) throw new Error("could not read /admin/writing/status");

  // The post editor and its excerpt.
  await page.goto(`${BASE}/admin/blog/new`, { waitUntil: "load", timeout: T });
  await page.locator(".note-editable").first().waitFor({ timeout: T });
  await page.waitForTimeout(4000); // the status is read after mount
  const aiButton = page.locator(".note-btn-ai");
  const summaryButton = page.locator('button[aria-label="Writing help"]');

  // A ticket, found from the queue.
  await page.goto(`${BASE}/admin/tickets`, { waitUntil: "load", timeout: T });
  const href = await page.locator('a[href^="/admin/tickets/"]').evaluateAll(
    (as) => as.map((a) => a.getAttribute("href")).find((h) => /^\/admin\/tickets\/[A-Z][A-Z0-9]*-\d{4}-\d{5}$/.test(h ?? "")) ?? null,
  );
  let draft = null;
  if (href) {
    await page.goto(`${BASE}${href}`, { waitUntil: "load", timeout: T });
    await page.locator("#body").waitFor({ timeout: T });
    await page.waitForTimeout(4000);
    draft = page.getByRole("button", { name: "Draft a reply" });
  }

  if (!status.available) {
    if (await draft?.count()) fail('"Draft a reply" is drawn although writing help is off');
    await page.goto(`${BASE}/admin/blog/new`, { waitUntil: "load", timeout: T });
    await page.locator(".note-editable").first().waitFor({ timeout: T });
    await page.waitForTimeout(4000);
    if (await aiButton.isVisible()) fail("the editor shows an AI button although writing help is off");
    if (await summaryButton.count()) fail("the excerpt shows a writing-help button although it is off");
    if (!process.exitCode) console.log("ai-writing probe: off — no AI controls drawn");
  } else {
    if (draft && !(await draft.count())) fail('no "Draft a reply" button on the ticket');
    if (!href) console.log("note: no ticket in the queue, the reply button was not checked");
    await page.goto(`${BASE}/admin/blog/new`, { waitUntil: "load", timeout: T });
    await page.locator(".note-editable").first().waitFor({ timeout: T });
    await aiButton.waitFor({ state: "visible", timeout: 30000 }).catch(() => fail("no AI button in the editor"));
    if (!(await summaryButton.count())) fail("no writing-help button on the excerpt");
    await aiButton.click();
    const dialog = page.getByRole("dialog", { name: "Writing help" });
    await dialog.waitFor({ timeout: 30000 }).catch(() => fail("the panel did not open"));
    const modes = await dialog.locator('[role="group"][aria-label="What to do"] button').count();
    if (modes !== 6) fail(`the panel offers ${modes} modes, not 6`);
    // Replace with a stubbed answer: the form must read as changed (the leave guard and the draft listen for an input event).
    await page.route("**/*", async (route) => {
      const r = route.request();
      if (r.method() === "POST" && r.headers()["next-action"] && (r.postData() ?? "").includes('"surface"')) {
        const body = '0:{"a":"$@1","f":"","b":"development"}\n1:{"ok":true,"output":"<p>Stubbed answer.</p>"}\n';
        return route.fulfill({ status: 200, contentType: "text/x-component", body });
      }
      return route.continue();
    });
    await dialog.getByRole("button", { name: "Suggest" }).click();
    await dialog.getByRole("button", { name: "Replace" }).click({ timeout: 30000 }).catch(() => fail("the stubbed answer did not arrive"));
    // Leaving by an in-app link must now ask first.
    let asked = false;
    page.once("dialog", (d) => { asked = d.type() === "confirm"; void d.dismiss(); });
    await page.locator('a[href="/admin"]:visible').first().click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);
    if (!asked) fail("applying an answer did not reach the leave guard");
    if (!(await page.locator(".note-editable").first().textContent())?.includes("Stubbed answer.")) fail("the answer is not in the editor");
    if (!process.exitCode) console.log("ai-writing probe passed");
  }
} catch (e) {
  fail(String(e?.message ?? e).split("\n")[0]);
} finally {
  await browser.close();
}
