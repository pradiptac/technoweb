import { chromium } from "playwright";

/**
 * The custom layout section (0.147.0, docs/page-builder.md "The layout
 * section"), built in the console through its own buttons and read on the
 * public page at five widths.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/layout-section.mjs
 *   SHOTS=<dir> saves the editor and the page at 390 and 1280.
 *   KEEP=1 leaves the throwaway page behind (its address is printed).
 *
 * **It creates one published page and deletes it again.** In the builder it:
 * adds a Custom layout section, gives it a heading, makes row 1 two columns
 * with the second wider, adds a heading, a text (typed into Summernote), a
 * button, a space and a rule to column 1 and an icon box, a list and a
 * question to column 2, moves a widget down and Undoes it, changes the column
 * count to one — the widgets must follow into the column that is left — and
 * Undoes that, and adds a second row of three boxes. After saving, on the
 * public page at 320, 390, 768, 1024 and 1280 it checks: exactly one `h1`;
 * heading levels that never jump; no horizontal overflow; no text under 12px;
 * the two columns side by side from 768 and stacked at 390; the Tab order
 * reaches the question and the button; nothing logged to the console. The
 * picture widget needs a library file, so the sample builder page covers it
 * (`npm run audit` on `/admin/pages/{id}/preview`).
 *
 * 0.149.0 adds a third row of one column holding a Video widget (a YouTube
 * link): the console shows the link field and not the file one, and on the
 * public page **nothing is requested from a YouTube or Google host and no
 * iframe exists until the play button is pressed**, after which the
 * privacy-enhanced frame appears. The form, slider and gallery widgets need
 * published records, so the API tests cover those.
 *
 * Carries no credential. Not run by the author of the release: written
 * against the markup, so a locator that has drifted fails here first.
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

// The helper signs in on its own default origin (127.0.0.1); a cookie set
// there is not sent to localhost, so both must use one.
process.env.BASE = BASE;
const { signInAsStaff } = await import("../shared.mjs");
const context = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
const page = await context.newPage();
listen(page, "console");
await signInAsStaff(page);

// ---- a throwaway published page -------------------------------------------
const stamp = Date.now().toString(36);
const slug = `layout-probe-${stamp}`;
await page.goto(`${BASE}/admin/pages/new`, { waitUntil: "load", timeout: T });
await page.locator("#title").fill(`Layout probe ${stamp}`);
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

  // ---- add the section ------------------------------------------------------
  await page.getByRole("button", { name: "Add a section" }).first().click();
  await page.locator("dialog[open] button", { hasText: "Custom layout" }).first().click();
  const card = page.locator('li[data-section-card="layout"]').first();
  await card.waitFor({ timeout: 30000 });
  if ((await card.locator("button[aria-expanded]").first().getAttribute("aria-expanded")) !== "true") await card.locator("button[aria-expanded]").first().click();
  ok(await card.locator("[data-layout-row-card]").count() === 1, "a new layout starts with one row");

  await card.getByLabel("Heading", { exact: true }).first().fill("Probe: a custom layout");

  const row = card.locator("[data-layout-row-card]").first();
  // A row starts open; a widget starts closed.
  ok(await row.locator("[data-layout-col-card]").count() === 2, "the row opens on two columns");
  await row.getByLabel("Split").selectOption("wide_last");
  await row.getByLabel("Columns line up").selectOption("center");

  const col = (n) => row.locator("[data-layout-col-card]").nth(n);
  const add = async (n, name) => { await col(n).getByRole("button", { name: `+ ${name}`, exact: true }).click(); };
  for (const w of ["Heading", "Text", "Button", "Space", "Rule"]) await add(0, w);
  for (const w of ["Icon box", "List", "Questions that open"]) await add(1, w);
  ok(await col(0).locator("[data-layout-widget-card]").count() === 5 && await col(1).locator("[data-layout-widget-card]").count() === 3, "five widgets in column 1, three in column 2");

  // ---- fill them ------------------------------------------------------------
  const widget = (n, type) => col(n).locator(`[data-layout-widget-card="${type}"]`).first();
  const open = async (w) => { await w.locator("button[aria-expanded]").first().click(); };

  await open(widget(0, "heading"));
  await widget(0, "heading").getByLabel("Heading", { exact: true }).fill("Probe heading widget");

  await open(widget(0, "text"));
  const editable = widget(0, "text").locator(".note-editable");
  await editable.waitFor({ timeout: 60000 });
  await editable.click();
  await page.keyboard.type("Probe paragraph from the editor.");
  await page.waitForTimeout(400);

  await open(widget(0, "button"));
  await widget(0, "button").getByLabel("Label", { exact: true }).fill("Probe button");
  await widget(0, "button").getByLabel("Link", { exact: true }).fill("/contact");

  await open(widget(1, "icon_box"));
  await widget(1, "icon_box").getByLabel("Title", { exact: true }).fill("Probe icon box");

  await open(widget(1, "list"));
  await widget(1, "list").getByLabel("Words", { exact: true }).first().fill("Probe point");

  await open(widget(1, "accordion"));
  await widget(1, "accordion").getByLabel("Question", { exact: true }).first().fill("Probe question?");
  await widget(1, "accordion").getByLabel("Answer", { exact: true }).first().fill("Probe answer.");

  // ---- reorder, and Undo ------------------------------------------------------
  const order = () => col(0).locator("[data-layout-widget-card]").evaluateAll((els) => els.map((e) => e.getAttribute("data-layout-widget-card")));
  const before = await order();
  await col(0).getByRole("button", { name: "Move heading 1 down" }).click();
  const moved = await order();
  ok(moved[0] === before[1] && moved[1] === "heading", `a widget moves down (${before.slice(0, 2)} → ${moved.slice(0, 2)})`);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  ok(JSON.stringify(await order()) === JSON.stringify(before), "Undo puts it back");

  // ---- the column count follows the widgets -----------------------------------
  const total = () => row.locator("[data-layout-widget-card]").count();
  const widgetsBefore = await total();
  await row.getByLabel("Columns", { exact: true }).selectOption("1");
  ok(await row.locator("[data-layout-col-card]").count() === 1 && await total() === widgetsBefore, `one column left, all ${widgetsBefore} widgets in it`);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  ok(await row.locator("[data-layout-col-card]").count() === 2 && await col(0).locator("[data-layout-widget-card]").count() === 5, "Undo gives the two columns and their widgets back");

  // ---- a second row of three ---------------------------------------------------
  await card.getByRole("button", { name: "3 columns", exact: true }).click();
  ok(await card.locator("[data-layout-row-card]").count() === 2, "a second row of three columns is added");

  // ---- a video widget (0.149.0) -------------------------------------------------
  await card.getByRole("button", { name: "1 column", exact: true }).click();
  const videoRow = card.locator("[data-layout-row-card]").nth(2);
  await videoRow.getByRole("button", { name: "+ Video", exact: true }).click();
  const videoCard = videoRow.locator('[data-layout-widget-card="video"]').first();
  await videoCard.locator("button[aria-expanded]").first().click();
  ok(await videoCard.getByLabel("YouTube link").count() === 1 && await videoCard.getByLabel("Video file").count() === 0, "a new video asks for a YouTube link, not a file");
  await videoCard.getByLabel("Where it is").selectOption("mp4");
  ok(await videoCard.getByLabel("YouTube link").count() === 0, "choosing a file hides the link field");
  await videoCard.getByLabel("Where it is").selectOption("youtube");
  await videoCard.getByLabel("YouTube link").fill("https://www.youtube.com/watch?v=aqz-KE-bpKQ");
  await videoCard.getByLabel("Caption (optional)").fill("Probe video caption");
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/layout-editor.png` });

  await Promise.all([
    page.waitForURL((u) => u.searchParams.has("saved"), { timeout: T }),
    page.getByRole("button", { name: /^Save changes$/ }).click(),
  ]);
  await page.waitForLoadState("load");
  ok(true, "the page saved");

  // ---- the public page ----------------------------------------------------------
  const site = await context.newPage();
  listen(site, "site");
  for (const width of [320, 390, 768, 1024, 1280]) {
    await site.setViewportSize({ width, height: 900 });
    await site.goto(`${BASE}/${slug}`, { waitUntil: "load", timeout: T });
    await site.waitForSelector("html[data-aos-ready]", { timeout: T });
    await site.waitForTimeout(500);

    const r = await site.evaluate(() => {
      const section = document.querySelector('[data-page-section="layout"]');
      const levels = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => Number(h.tagName[1]));
      let jumps = 0;
      for (let i = 1; i < levels.length; i++) if (levels[i] - levels[i - 1] > 1) jumps++;
      const small = [];
      for (const el of section?.querySelectorAll("*") ?? []) {
        const direct = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (direct && parseFloat(getComputedStyle(el).fontSize) < 12) small.push(el.tagName);
      }
      const rowEl = section?.querySelector("[data-layout-row]");
      const cols = rowEl ? [...rowEl.children].map((c) => c.getBoundingClientRect()) : [];
      return {
        h1: document.querySelectorAll("h1").length, jumps, small: small.length,
        over: document.documentElement.scrollWidth - window.innerWidth,
        side: cols.length === 2 ? Math.abs(cols[0].top - cols[1].top) < 40 : null,
        wider: cols.length === 2 ? cols[1].width > cols[0].width : null,
      };
    });
    ok(r.h1 === 1, `${width}px: exactly one h1`);
    ok(r.jumps === 0, `${width}px: heading levels never jump`);
    ok(r.over <= 0, `${width}px: no horizontal overflow (${r.over})`);
    ok(r.small === 0, `${width}px: no text under 12px (${r.small})`);
    if (width >= 768) ok(r.side === true && r.wider === true, `${width}px: two columns side by side, the second wider`);
    else ok(r.side === false, `${width}px: the columns are stacked`);

    if (width === 1280) {
      // Tab order: the question and the button are both reachable.
      const reached = new Set();
      await site.locator('[data-page-section="layout"]').scrollIntoViewIfNeeded();
      await site.locator("body").press("Tab");
      for (let i = 0; i < 60; i++) {
        const where = await site.evaluate(() => {
          const el = document.activeElement;
          return el && el.closest('[data-page-section="layout"]') ? `${el.tagName}:${el.closest("[data-widget]")?.getAttribute("data-widget") ?? ""}` : null;
        });
        if (where) reached.add(where);
        await site.keyboard.press("Tab");
      }
      ok([...reached].some((x) => x.startsWith("SUMMARY")) && [...reached].some((x) => x.endsWith(":button")), `Tab reaches the question and the button (${[...reached].join(", ")})`);
    }
    if (width === 1280) {
      // Nothing from YouTube or Google until the press; then the privacy-enhanced frame.
      const hosts = [];
      const watch = (req) => { if (/(youtube|ytimg|youtu.be|google|gstatic)/i.test(new URL(req.url()).hostname)) hosts.push(new URL(req.url()).hostname); };
      site.on("request", watch);
      await site.goto(`${BASE}/${slug}`, { waitUntil: "load", timeout: T });
      await site.waitForSelector("html[data-aos-ready]", { timeout: T });
      const video = site.locator('[data-widget="video"]').first();
      await video.scrollIntoViewIfNeeded();
      await site.waitForTimeout(1500);
      ok(await video.locator("iframe").count() === 0 && hosts.length === 0, `the video widget loads nothing from YouTube before a press (${hosts.join(", ") || "no requests"})`);
      await video.locator("button").first().click();
      await video.locator('iframe[src*="youtube-nocookie.com"]').waitFor({ timeout: 15000 });
      ok(true, "pressing play mounts the youtube-nocookie frame");
      site.off("request", watch);
    }
    if (SHOTS && (width === 390 || width === 1280)) await site.screenshot({ path: `${SHOTS}/layout-${width}.png`, fullPage: true });
  }
  await site.close();
} finally {
  if (process.env.KEEP === "1") {
    console.log(`kept: ${BASE}/admin/pages/${pageId} and ${BASE}/${slug}`);
  } else if (pageId) {
    // The edit form's own Delete, confirmed in its dialog.
    try {
      // The builder session left a form draft in this browser; a fresh form deletes cleanly.
      await page.evaluate(() => { try { localStorage.clear(); } catch { /* none */ } });
      await page.goto(`${BASE}/admin/pages/${pageId}`, { waitUntil: "load", timeout: T });
      await page.waitForTimeout(2000);
      // The form's Delete asks through `window.confirm`, which Playwright cancels unless told otherwise.
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
