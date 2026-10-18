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
  // Fails closed: a Server Action POST that is neither stubbed nor a known harmless read is aborted and fails
  // the probe, so a changed argument encoding can never reach a real (paid) make.
  const discarded = [];
  let made = 0;
  const reply = (route, value) => route.fulfill({
    status: 200, contentType: "text/x-component",
    body: `0:{"a":"$@1","f":"","b":"development"}
1:${JSON.stringify(value)}
`,
  });
  const tokenOf = (n) => n.toString(16).padStart(64, "a");
  if (status.available) {
    await page.route("**/*", async (route) => {
      const r = route.request();
      if (r.method() !== "POST" || !r.headers()["next-action"]) return route.continue();
      const raw = r.postData() ?? "";
      let args = null;
      try { args = JSON.parse(raw); } catch { /* not a plain-argument action */ }
      if (Array.isArray(args)) {
        const [a0] = args;
        if (args.length === 1 && a0 && typeof a0 === "object" && "prompt" in a0) {
          if (String(a0.prompt).includes("REFUSE")) return reply(route, { ok: false, error: "AI help is switched off. Turn it on in SEO → Settings." });
          made += 1;
          return reply(route, { ok: true, image: { token: tokenOf(made), width: 1344, height: 756, model: "stub", mime: "image/png" } });
        }
        if (args.length === 3 && /^[a-f0-9]{64}$/.test(String(a0))) {
          return reply(route, { ok: true, file: { url: `http://127.0.0.1:8000/storage/${STUB_PATH}`, alt: String(args[1]), path: STUB_PATH, name: "stub.png", bytes: 1 } });
        }
        if (args.length === 1 && /^[a-f0-9]{64}$/.test(String(a0))) {
          discarded.push(a0);
          return reply(route, null);
        }
        // Harmless reads: the status (no arguments) and the picker's own listing.
        if (args.length === 0 || (args.length === 1 && a0 && typeof a0 === "object" && "kind" in a0 && !raw.includes("prompt"))) return route.continue();
      }
      fail(`an unstubbed Server Action was aborted: ${raw.slice(0, 120)}`);
      return route.abort();
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
    // A refusal shows the Alert and leaves the form usable.
    await dialog.getByLabel("Describe the picture").fill("REFUSE: a tidy server room with blue light.");
    await make.click();
    await dialog.getByText("AI help is switched off. Turn it on in SEO → Settings.").waitFor({ timeout: 30000 }).catch(() => fail("a refused make did not show its sentence"));
    if (!(await dialog.getByText("The picture could not be made").count())) fail("a refused make did not show the Alert");
    if (!(await dialog.getByText("Style", { exact: true }).count()) || !(await dialog.getByText("Shape", { exact: true }).count())) fail("the Style and Shape labels are not drawn");

    // Make, Try again (the first is discarded, a second made), Discard (clears the preview), make again, keep.
    await dialog.getByLabel("Describe the picture").fill("A tidy server room with blue light along the racks.");
    await make.click();
    const use = dialog.getByRole("button", { name: "Use this picture" });
    await use.waitFor();
    const altValue = await dialog.getByLabel("Alt text").inputValue();
    if (!altValue.startsWith("A tidy server room")) fail(`the alt text was not prefilled from the description ("${altValue}")`);
    await dialog.getByRole("button", { name: "Try again" }).click();
    await page.waitForFunction((t) => document.querySelector("dialog[open] img")?.getAttribute("src")?.endsWith(t), tokenOf(2)).catch(() => fail("Try again did not show a second picture"));
    if (!discarded.includes(tokenOf(1))) fail("Try again did not discard the first picture");
    await dialog.getByRole("button", { name: "Discard" }).click();
    await use.waitFor({ state: "detached" }).catch(() => fail("Discard did not clear the preview"));
    if (!discarded.includes(tokenOf(2))) fail("Discard did not discard the second picture");
    await make.click();
    await use.click();
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
    if (!discarded.includes(tokenOf(made))) fail("closing the dialog did not discard the unused picture");
    if (!process.exitCode) console.log("ai-image probe passed");
  }
} catch (e) {
  fail(String(e?.message ?? e).split("\n")[0]);
} finally {
  await browser.close();
}
