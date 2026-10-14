/**
 * Ask ALTIS, through the real drawer (0.177.0, `docs/copilot.md`).
 *
 * **What is deliberately not here.** The matching (the noise list, the
 * singularisation, the 0.45 threshold, the model as an index-returning
 * fallback, the counted run), the role narrowing and every question's
 * figure are 17 cases in `CopilotTest`, which drives the real endpoints
 * against the real scopes. Repeating them in a browser would be a slower
 * copy that proves less.
 *
 * What only a browser can answer: that the **✦** is in the bar, that the
 * drawer draws the API's suggestion list rather than one of its own, that
 * pressing a suggestion puts a figure and a sentence on screen with the
 * question it answered above them, and that an asking nothing matches
 * comes back as the list rather than an error.
 *
 *   cd web
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/copilot.mjs
 *
 * **It writes nothing.** The copilot reads, so this probe makes no account,
 * no record and no setting, and has nothing to put back. No credential is
 * in this file. One probe at a time, and never beside an audit: each
 * sign-in revokes the other's token.
 *
 * **Never `networkidle` against `next dev`.** Its HMR socket keeps the
 * network busy for ever, so every wait here is `domcontentloaded` plus an
 * explicit wait for the element that matters.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const EMAIL = process.env.ADMIN_LOGIN_EMAIL;
const PASSWORD = process.env.ADMIN_LOGIN_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("Set ADMIN_LOGIN_EMAIL and ADMIN_LOGIN_PASSWORD.");
  process.exit(1);
}

let failures = 0;

function check(ok, what, detail = "") {
  console.log(`${ok ? "ok   " : "FAIL "} ${what}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(60000);
page.setDefaultNavigationTimeout(60000);

const open = (path) => page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });

try {
  /* --------------------------------------------------------- signing in */

  await open("/admin/login");

  // No clicking a link to reach the password step: on this screen the
  // first link matching /password/i is "Forgot your password?".
  if ((await page.locator('input[name="password"]').count()) === 0) {
    await page.getByRole("link", { name: /use a password|password instead/i }).first().click();
  }

  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForFunction(() => !location.pathname.startsWith("/admin/login"));

  /* ------------------------------------------------- the button and list */

  await open("/admin");
  const trigger = page.getByRole("button", { name: "Ask about this install" });
  await trigger.waitFor();
  check(true, "the ✦ is in the console bar");

  const box = await trigger.boundingBox();
  check(
    box !== null && box.width >= 24 && box.height >= 24,
    "its target clears 24px",
    box ? `${Math.round(box.width)}×${Math.round(box.height)}` : "no box",
  );

  await trigger.click();
  const drawer = page.locator("[data-copilot-drawer]");
  await drawer.waitFor();
  check(true, "the drawer opens");

  // The suggestions are the API's list of what this account may ask. The
  // drawer lists nothing of its own, so an empty list here is a broken
  // route handler rather than an install with nothing to say.
  const suggestions = drawer.getByRole("button").filter({ hasText: /\?$/ });
  await suggestions.first().waitFor();
  const offered = await suggestions.count();
  check(offered > 0, "it draws the API's suggestions", `${offered} offered`);

  const asked = (await suggestions.first().textContent())?.trim() ?? "";

  /* ---------------------------------------------- pressing a suggestion */

  await suggestions.first().click();

  const answer = drawer.locator('[role="status"]').filter({ hasText: /\S/ });
  await answer.first().waitFor();

  const text = ((await answer.first().textContent()) ?? "").replace(/\s+/g, " ").trim();
  check(text.length > 0, "an answer arrives", text.slice(0, 80));

  // The question it answered is printed above the figure. That is what
  // makes a misclassification something a person can see, so its absence
  // is a defect and not a cosmetic one.
  check(asked !== "" && text.includes(asked), "the question it answered is shown", asked);

  // A figure or a plainly-worded zero. Either is an answer; neither being
  // there is not.
  check(/\d/.test(text) || /\bno\b|\bnothing\b/i.test(text), "it carries a figure or a worded zero");

  const link = drawer.getByRole("link", { name: /open the list/i });
  const linked = await link.count();
  const href = linked ? await link.first().getAttribute("href") : null;
  check(
    linked === 0 || (href !== null && href.startsWith("/admin/")),
    "the link, when there is one, is a console path",
    href ?? "no link (a zero figure has none)",
  );

  /* -------------------------------------------------- an asking it misses */

  const field = drawer.locator("#copilot-q");
  await field.fill("what is the weather in Oslo");
  await drawer.getByRole("button", { name: /^ask$/i }).click();

  await page.waitForFunction(
    () => /not something I can answer|nothing this account/i.test(
      document.querySelector("[data-copilot-drawer]")?.textContent ?? "",
    ),
    undefined,
    { timeout: 30000 },
  );
  check(true, "an asking nothing matches says so");

  // And answers it with the list rather than an apology.
  const retry = await drawer.getByRole("button").filter({ hasText: /\?$/ }).count();
  check(retry > 0, "it offers the list instead", `${retry} offered`);

  /* ------------------------------------------- the phone's way in exists */

  await page.setViewportSize({ width: 390, height: 844 });
  await open("/admin");

  const hidden = await page
    .getByRole("button", { name: "Ask about this install" })
    .isVisible()
    .catch(() => false);
  check(!hidden, "the ✦ is out of the bar on a phone");

  await page.getByRole("button", { name: /account|menu/i }).first().click();
  const item = page.getByRole("menuitem", { name: "Ask ALTIS" });
  const inMenu = (await item.count()) > 0 || (await page.getByText("Ask ALTIS", { exact: true }).count()) > 0;
  check(inMenu, "and is in the account menu instead");
} catch (error) {
  check(false, "the probe ran to the end", String(error.message ?? error).slice(0, 200));
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
