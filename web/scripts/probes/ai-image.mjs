/**
 * "Make with AI" in the media picker (0.184.0, docs/ai-images.md).
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/ai-image.mjs
 *
 * Reads /admin/media/ai-image/status with the session token the sign-in leaves.
 *  - Off: the cover picker has no "Make with AI" tab; prints "off — no tab drawn".
 *  - On: the tab is there, the cover's 1200x630 opens on Wide, a made picture is kept
 *    into the cover field, and a made picture left behind is discarded when the
 *    dialog closes. The make, keep and discard Server Actions are stubbed in the
 *    browser, so no picture is paid for and nothing is stored. API_BASE_URL overrides the API.
 */
import { chromium } from "playwright";

const { signInAsStaff, BASE } = await import("../shared.mjs");

const T = 120000;
const API = `${process.env.API_BASE_URL ?? "http://127.0.0.1:8000"}/api/v1`;
const STUB_PATH = "ai-images/stub.png";
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(T);
try {
  await signInAsStaff(page, { timeout: T });
  const cookie = (await context.cookies()).find((c) => c.name === "tw_admin_session");
  const headers = { Authorization: `Bearer ${decodeURIComponent(cookie?.value ?? "")}`, Accept: "application/json" };
  const status = (await (await fetch(`${API}/admin/media/ai-image/status`, { headers })).json()).data;
  if (!status) throw new Error("could not read /admin/media/ai-image/status");

  // Stubs: told apart by their arguments (status [], make [{prompt…}], keep [token, alt, folder], discard [token]).
  const discarded = [];
  let made = 0;
  const reply = (route, value) => route.fulfill({
    status: 200, contentType: "text/x-component",
    body: `0:{"a":"$@1","f":"","b":"development"}\n1:${JSON.stringify(value)}\n`,
  });
  if (status.available) {
    await page.route("**/*", async (route) => {
      const r = route.request();
      const raw = r.method() === "POST" && r.headers()["next-action"] ? r.postData() ?? "" : null;
      let args = null;
      try { args = raw ? JSON.parse(raw) : null; } catch { /* not a plain-argument action */ }
      if (!Array.isArray(args)) return route.continue();
      if (args.length === 1 && args[0] && typeof args[0] === "object" && "prompt" in args[0]) {
        made += 1;
        return reply(route, { ok: true, image: { token: made.toString(16).padStart(64, "a"), width: 1344, height: 756, model: "stub", mime: "image/png" } });
      }
      if (args.length === 3 && /^[a-f0-9]{64}$/.test(String(args[0]))) {
        return reply(route, { ok: true, file: { url: `http://127.0.0.1:8000/storage/${STUB_PATH}`, alt: String(args[1]), path: STUB_PATH, name: "stub.png", bytes: 1 } });
      }
      if (args.length === 1 && /^[a-f0-9]{64}$/.test(String(args[0]))) {
        discarded.push(args[0]);
        return reply(route, null);
      }
      return route.continue();
    });
  }

  const openPicker = async () => {
    await page.goto(`${BASE}/admin/blog/new`, { waitUntil: "load", timeout: T });
    await page.getByRole("tab", { name: "Media" }).click();
    await page.getByRole("button", { name: "Or choose from the library" }).first().click();
    const dialog = page.locator("dialog[open]");
    await dialog.waitFor();
    return dialog;
  };

  if (!status.available) {
    const dialog = await openPicker();
    await page.waitForTimeout(4000); // the status is read after the dialog opens
    if (await dialog.getByRole("button", { name: "Make with AI" }).count()) fail("the picker shows Make with AI although it is off");
    if (!process.exitCode) console.log("ai-image probe: off — no tab drawn");
  } else {
    let dialog = await openPicker();
    const tab = dialog.getByRole("button", { name: "Make with AI" });
    await tab.waitFor({ timeout: 30000 }).catch(() => fail("no Make with AI tab"));
    await tab.click();
    const wide = dialog.getByRole("button", { name: /^Wide/ });
    if ((await wide.getAttribute("aria-pressed")) !== "true") fail("the cover picker did not open on Wide");
    const make = dialog.getByRole("button", { name: "Make picture" });
    if (!(await make.isDisabled())) fail("Make picture is enabled with nothing described");
    await dialog.getByLabel("Describe the picture").fill("A tidy server room with blue light along the racks.");
    await make.click();
    await dialog.getByRole("button", { name: "Use this picture" }).click();
    await page.locator("dialog[open]").waitFor({ state: "detached", timeout: 30000 }).catch(() => fail("the dialog stayed open after keeping"));
    const value = await page.locator('input[type="hidden"][name="cover_image_path"]').inputValue();
    if (value !== STUB_PATH) fail(`the cover field holds "${value}", not the kept picture`);

    // A made picture left behind is discarded when the dialog closes.
    dialog = await openPicker();
    await dialog.getByRole("button", { name: "Make with AI" }).click();
    await dialog.getByLabel("Describe the picture").fill("A tidy server room with blue light along the racks.");
    await dialog.getByRole("button", { name: "Make picture" }).click();
    await dialog.getByRole("button", { name: "Use this picture" }).waitFor();
    await dialog.getByRole("button", { name: "Close" }).click();
    await page.waitForTimeout(1500);
    if (!discarded.length) fail("closing the dialog did not discard the unused picture");
    if (!process.exitCode) console.log("ai-image probe passed");
  }
} catch (e) {
  fail(String(e?.message ?? e).split("\n")[0]);
} finally {
  await browser.close();
}
