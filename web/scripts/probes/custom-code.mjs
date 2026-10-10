import { chromium } from "playwright";

/**
 * The custom code section (0.158.0, docs/page-builder.md "Custom code"), built
 * in the console and read on the public page and in the console's previews.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/custom-code.mjs
 *   SHOTS=<dir> saves the public page at 360 and 1280.
 *   KEEP=1 leaves the throwaway page behind (its address is printed).
 *
 * **It creates one published page and deletes it again.** Its code tries to
 * read `parent.document.cookie` and writes what happened into its own body,
 * then adds 600px of height. In the builder it adds a Custom code section,
 * names it, pastes the code and saves. Then it checks:
 *
 *  - the console: the editor offers the code box, the starting height and (for
 *    this administrator) the "Where it runs" choice, not the note;
 *  - the public page: exactly one `iframe[data-custom-code-frame]`, whose
 *    `sandbox` has `allow-scripts` and NOT `allow-same-origin`; the code ran
 *    inside it (its own `#out` is filled) and **was blocked** from the parent's
 *    document ("blocked:…", never "READ:…"); the frame grew to its content
 *    (>= 600px, <= 4000px) by the postMessage handshake; no horizontal overflow
 *    at 360 and 1280; nothing reached the parent's `window.name`/DOM;
 *  - the console's previews: the saved preview (`/admin/pages/{id}/preview`)
 *    and the builder's live frame (`/admin/draft-preview/…`) show the
 *    labelled placeholder and contain **no** `iframe[data-custom-code-frame]`
 *    and no `[data-custom-code-page]` — the code runs nowhere in the console;
 *  - nothing is logged to the console by either surface (a CSP violation the
 *    inherited Report-Only policy reported would be logged and fail here).
 *
 * Carries no credential. Not run by the author of the release: written against
 * the markup, so a locator that has drifted fails here first.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const SHOTS = process.env.SHOTS;
const T = 180000;
const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const problems = [];
const listen = (p, where) => {
  p.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(`${where} ${m.type()}: ${m.text().slice(0, 300)}`); });
  p.on("pageerror", (e) => problems.push(`${where} pageerror: ${e.message.slice(0, 300)}`));
};

// The helper signs in on its own default origin; a cookie set there is not
// sent to another host name, so both must use one.
process.env.BASE = BASE;
const { signInAsStaff } = await import("../shared.mjs");
const context = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
const page = await context.newPage();
listen(page, "console");
await signInAsStaff(page);

const CODE = [
  '<div id="out">pending</div>',
  "<script>",
  "var r; try { r = 'READ:' + parent.document.cookie; } catch (e) { r = 'blocked:' + e.name; }",
  "document.getElementById('out').textContent = r;",
  "</script>",
  '<div style="height:600px;background:#eee">tall</div>',
].join("\n");

// ---- a throwaway published page -------------------------------------------
const stamp = Date.now().toString(36);
const slug = `code-probe-${stamp}`;
await page.goto(`${BASE}/admin/pages/new`, { waitUntil: "load", timeout: T });
await page.locator("#title").fill(`Code probe ${stamp}`);
await page.locator("#slug").fill(slug);
await page.locator("#template").selectOption("builder");
await page.locator("#status").selectOption("published");
await Promise.all([
  page.waitForURL(/\/admin\/pages\/\d+/, { timeout: T }),
  page.locator('button[type="submit"]').filter({ hasText: /^(Create|Save)/ }).first().click(),
]);
const pageId = page.url().match(/\/admin\/pages\/(\d+)/)?.[1];
ok(Boolean(pageId), `a throwaway page was created (${pageId})`);

try {
  await page.goto(`${BASE}/admin/pages/${pageId}?tab=builder`, { waitUntil: "load", timeout: T });
  await page.getByRole("button", { name: "Add a section" }).first().waitFor({ timeout: T });
  await page.waitForTimeout(1500);

  // ---- add and fill the section ---------------------------------------------
  await page.getByRole("button", { name: "Add a section" }).first().click();
  await page.locator("dialog[open] button", { hasText: "Custom code" }).first().click();
  const card = page.locator('li[data-section-card="custom_code"]').first();
  await card.waitFor({ timeout: 30000 });
  if ((await card.locator("button[aria-expanded]").first().getAttribute("aria-expanded")) !== "true") await card.locator("button[aria-expanded]").first().click();

  await card.getByLabel("What this code is").fill("Probe widget");
  await card.getByLabel("Code", { exact: true }).fill(CODE);
  ok(await card.getByLabel("Where it runs").count() === 1, "an administrator is offered where the code runs");
  ok(await card.getByLabel("Starting height").count() === 1, "the starting height is offered");
  await card.getByLabel("Starting height").selectOption("s");

  await Promise.all([
    page.waitForURL((u) => u.searchParams.has("saved"), { timeout: T }),
    page.getByRole("button", { name: /^Save changes$/ }).click(),
  ]);
  await page.waitForLoadState("load");
  ok(true, "the page saved");

  // ---- the console's previews: a placeholder, never the code --------------------
  await page.goto(`${BASE}/admin/pages/${pageId}/preview`, { waitUntil: "load", timeout: T });
  await page.waitForTimeout(1500);
  ok(await page.locator("[data-custom-code-placeholder]").count() === 1, "the saved preview draws the placeholder");
  ok((await page.locator("[data-custom-code-placeholder]").first().textContent())?.includes("Probe widget") === true, "...naming the code");
  ok(await page.locator("iframe[data-custom-code-frame], [data-custom-code-page]").count() === 0, "...and runs no code in the console");

  await page.goto(`${BASE}/admin/pages/${pageId}?tab=builder`, { waitUntil: "load", timeout: T });
  // The live preview loads its first draft on its own a moment after the builder mounts (inline-edit.mjs waits the same way).
  await page.locator('aside[aria-label="Live preview"] iframe.visible').waitFor({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const live = page.frames().find((f) => f.url().includes("/admin/draft-preview/"));
  if (live) {
    ok(await live.locator("[data-custom-code-placeholder]").count() === 1, "the builder's live frame draws the placeholder");
    ok(await live.locator("iframe[data-custom-code-frame], [data-custom-code-page]").count() === 0, "...and runs no code in it");
  } else {
    console.log("skip the live frame is not shown at this width or has not loaded");
  }

  // ---- the public page ----------------------------------------------------------
  const site = await context.newPage();
  listen(site, "site");
  for (const width of [1280, 360]) {
    await site.setViewportSize({ width, height: 900 });
    await site.goto(`${BASE}/${slug}`, { waitUntil: "load", timeout: T });
    await site.waitForSelector("html[data-aos-ready]", { timeout: T });
    const frame = site.locator("iframe[data-custom-code-frame]");
    await frame.scrollIntoViewIfNeeded();
    ok(await frame.count() === 1, `${width}px: exactly one code frame`);

    const sandbox = (await frame.getAttribute("sandbox")) ?? "";
    ok(sandbox.includes("allow-scripts") && !sandbox.includes("allow-same-origin"), `${width}px: sandboxed with scripts and without allow-same-origin (${sandbox})`);

    const inner = site.frameLocator("iframe[data-custom-code-frame]");
    await inner.locator("#out").waitFor({ timeout: 30000 });
    const said = (await inner.locator("#out").textContent()) ?? "";
    ok(said.startsWith("blocked:"), `${width}px: the code ran and could not read the parent's document (${said.slice(0, 40)})`);

    // The handshake: the frame grows to its content.
    let height = 0;
    for (let i = 0; i < 40 && height < 600; i++) {
      height = (await frame.boundingBox())?.height ?? 0;
      if (height < 600) await site.waitForTimeout(250);
    }
    ok(height >= 600 && height <= 4000, `${width}px: the frame resized to its content (${Math.round(height)}px)`);

    const overflow = await site.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(overflow <= 0, `${width}px: no horizontal overflow (${overflow})`);
    ok(await site.locator("[data-custom-code-placeholder]").count() === 0, `${width}px: no placeholder on the published page`);
    if (SHOTS) await site.screenshot({ path: `${SHOTS}/custom-code-${width}.png`, fullPage: true });
  }
  await site.close();
} finally {
  if (process.env.KEEP === "1") {
    console.log(`kept: ${BASE}/admin/pages/${pageId} and ${BASE}/${slug}`);
  } else if (pageId) {
    try {
      // The builder session left a form draft in this browser; a fresh form deletes cleanly.
      await page.evaluate(() => { try { localStorage.clear(); } catch { /* none */ } });
      await page.goto(`${BASE}/admin/pages/${pageId}`, { waitUntil: "load", timeout: T });
      await page.waitForTimeout(2000);
      page.on("dialog", (dialog) => dialog.accept().catch(() => {}));
      await page.getByRole("button", { name: /^Delete/ }).first().click();
      const confirm = page.locator("dialog[open] button", { hasText: /^Delete/ }).last();
      if (await confirm.count()) await confirm.click();
      await page.waitForURL((u) => u.pathname === "/admin/pages", { timeout: 30000 });
      console.log("ok   the throwaway page was deleted");
    } catch (e) {
      console.log(`FAIL could not delete page ${pageId} (${slug}); remove it by hand: ${String(e).slice(0, 120)}`);
      failed++;
    }
  }
}

await page.waitForTimeout(1000);
ok(problems.length === 0, `no console errors or warnings${problems.length ? ":\n  " + problems.join("\n  ") : ""}`);
await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
