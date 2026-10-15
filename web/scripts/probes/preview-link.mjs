import { chromium } from "playwright";

/**
 * Draft share links (0.138.0, docs/admin-console.md "Draft share links"), end
 * to end through the real screens, for all twelve kinds of record.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/preview-link.mjs
 *   ONLY=solutions,pages  node …   limits the run to the named lists.
 *
 * For each console list that has a row, it opens the first record's edit
 * screen, presses Share preview, creates a link, reads the address out of the
 * dialog, and opens it **signed out** (a fresh browser context, no cookies) at
 * 360 and 1280. At each width it checks:
 *   - the page answers 200;
 *   - the standing banner is there (`[data-preview-banner]`);
 *   - exactly one h1 (the child page owns it, the banner is not a heading);
 *   - `meta[name=robots]` says noindex;
 *   - no JSON-LD block of its own (a preview emits no structured data; the
 *     site-wide Organization block in the layout may race the page and is
 *     ignored);
 *   - no horizontal overflow;
 *   - nothing logged to the console.
 * Then it revokes the link from the dialog and checks the address now 404s.
 *
 * One true draft is covered by name: the seeded `sample-builder-page` is a
 * draft, so `/sample-builder-page` must be a 404 signed out while its preview
 * renders. It is skipped, and said so, on an install that does not have it.
 *
 * **It replaces any link those records already had** (making a link replaces
 * the old one, and it ends by revoking its own), so a link someone shared
 * from the first record of a list stops working when this runs. Run it on a
 * development install. It writes nothing else.
 *
 * A list with no rows is reported and skipped. Carries no credential.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const T = 180000;
const ONLY = (process.env.ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const { signInAsStaff } = await import("../shared.mjs");

const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const note = (l) => console.log(`skip ${l}`);

/** name, console list, a pattern for a row's edit link. */
const KINDS = [
  { name: "pages", list: "/admin/pages", edit: /^\/admin\/pages\/\d+$/ },
  { name: "blog", list: "/admin/blog", edit: /^\/admin\/blog\/\d+$/ },
  { name: "knowledge-base", list: "/admin/knowledge-base", edit: /^\/admin\/knowledge-base\/\d+$/ },
  { name: "case-studies", list: "/admin/case-studies", edit: /^\/admin\/case-studies\/\d+$/ },
  { name: "solutions", list: "/admin/solutions", edit: /^\/admin\/solutions\/\d+$/ },
  { name: "services", list: "/admin/services", edit: /^\/admin\/services\/\d+$/ },
  { name: "products", list: "/admin/products", edit: /^\/admin\/products\/\d+$/ },
  { name: "store-products", list: "/admin/store/products", edit: /^\/admin\/store\/products\/\d+$/ },
  { name: "events", list: "/admin/events", edit: /^\/admin\/events\/\d+$/ },
  { name: "jobs", list: "/admin/jobs", edit: /^\/admin\/jobs\/\d+$/ },
  { name: "content", list: "/admin/content", edit: /^\/admin\/content\/[a-z0-9-]+\/\d+$/, via: /^\/admin\/content\/[a-z0-9-]+$/ },
  { name: "landing-pages", list: "/admin/landing-pages", edit: /^\/admin\/landing-pages\/\d+$/ },
];

const hrefs = (page) => page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")));

const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();
const problems = [];
const watch = (p, label) => {
  p.on("console", (m) => {
    if (m.type() !== "error" && m.type() !== "warning") return;
    // Dev only (CLAUDE.md, "How the audits behave"): the entity forms' lazy
    // icon chunk can outlive Chrome's preload grace period on a busy dev server.
    if (m.text().includes("was preloaded using link preload but not used") && m.text().includes("icon-field")) return;
    // A draft's own page asks the public API about itself after mount — an
    // event's places left, a shop product's reviews — and is told 404, since
    // the record is not published. The panels swallow it; the browser logs it.
    if (label !== "staff" && m.text().startsWith("Failed to load resource") && new URL(m.location().url).pathname.startsWith("/api/")) return;
    problems.push(`${label} ${m.type()} at ${p.url().replace(BASE, "")}: ${m.text().slice(0, 600)}`);
  });
  p.on("pageerror", (e) => problems.push(`${label} pageerror: ${e.message.slice(0, 300)}`));
};
watch(page, "staff");

const settle = async (p) => { await p.waitForLoadState("load", { timeout: T }); await p.waitForTimeout(1500); };

/** Opens an edit screen and returns the link address, or null when the button is not offered. */
async function makeLink(editPath) {
  await page.goto(`${BASE}${editPath}`, { waitUntil: "load", timeout: T });
  await page.waitForSelector("h1", { timeout: T });
  await settle(page);

  const button = page.getByRole("button", { name: "Share preview" });
  if ((await button.count()) === 0) return null;
  await button.click();

  const dialog = page.locator("dialog[open]");
  await dialog.waitFor({ timeout: T });

  // Either "Create link" (no link yet) or "Make a new link" (one exists): both replace.
  const make = dialog.getByRole("button", { name: /^(Create link|Make a new link)$/ });
  const address = dialog.locator("input[readonly]");

  // A record that already had a link shows its address at once, and that
  // address dies the moment the new one is made. Reading it straight after
  // the press read the old one: the first open raced the replacement and the
  // second was a 404. Wait for the address to be a different one.
  const before = (await address.count()) > 0 ? await address.inputValue() : "";
  await make.click();

  await address.waitFor({ timeout: T });
  const deadline = Date.now() + T;
  let value = await address.inputValue();
  while (value === before && Date.now() < deadline) {
    await page.waitForTimeout(250);
    value = await address.inputValue();
  }
  return { value, dialog };
}

async function checkSignedOut(url, width, label) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const p = await ctx.newPage();
  watch(p, `${label}@${width}`);
  const res = await p.goto(url, { waitUntil: "load", timeout: T });
  await p.waitForTimeout(1500);

  ok(res?.status() === 200, `${label} @${width}: the link answers 200 signed out`);
  ok((await p.locator("[data-preview-banner]").count()) === 1, `${label} @${width}: the preview banner is there`);
  const banner = (await p.locator("[data-preview-banner]").innerText().catch(() => "")).replace(/\s+/g, " ");
  ok(/stops working on/i.test(banner), `${label} @${width}: …and says when the link stops working (${banner.slice(0, 80)})`);
  ok((await p.locator("h1").count()) === 1, `${label} @${width}: exactly one h1`);
  const robots = await p.locator('meta[name="robots"]').first().getAttribute("content").catch(() => null);
  ok(/noindex/.test(robots ?? ""), `${label} @${width}: robots says noindex (${robots})`);
  const blocks = await p.locator('script[type="application/ld+json"]').evaluateAll((s) => s.map((e) => e.textContent ?? ""));
  const own = blocks.filter((t) => !t.includes('"@type":"Organization"') && !t.includes('"@type":"WebSite"'));
  ok(own.length === 0, `${label} @${width}: no structured data of its own (${own.length} block(s))`);
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(over <= 0, `${label} @${width}: no horizontal overflow (${over}px)`);
  await ctx.close();
}

async function status(url) {
  const ctx = await browser.newContext();
  const res = await (await ctx.newPage()).goto(url, { waitUntil: "load", timeout: T });
  const code = res?.status();
  await ctx.close();
  return code;
}

async function probeRecord(label, editPath, extra) {
  let made = null;
  try {
    made = await makeLink(editPath);
    if (!made) { note(`${label}: no Share preview button on ${editPath} (this account cannot share it)`); return; }
    ok(/^https?:\/\/[^/]+\/preview\/[a-f0-9]{64}$/.test(made.value), `${label}: the dialog shows a full address`);

    if (extra?.beforeOpen) await extra.beforeOpen();
    for (const width of [360, 1280]) await checkSignedOut(made.value, width, label);

    // Revoke from the dialog and ask again.
    await made.dialog.getByRole("button", { name: "Revoke link" }).click();
    await made.dialog.getByRole("button", { name: "Create link" }).waitFor({ timeout: T });
    ok((await status(made.value)) === 404, `${label}: the address is a 404 once revoked`);
    made = null;
  } catch (error) {
    ok(false, `${label}: ${String(error?.message ?? error).split("\n")[0]}`);
  } finally {
    // A failed run must not leave a live link behind.
    if (made) {
      try {
        await made.dialog.getByRole("button", { name: "Revoke link" }).click({ timeout: 5000 });
        await page.waitForTimeout(800);
      } catch { /* the dialog is gone; the link expires by itself */ }
    }
  }
}

try {
  await signInAsStaff(page, { timeout: T });

  for (const kind of KINDS) {
    if (ONLY.length && !ONLY.includes(kind.name)) continue;

    await page.goto(`${BASE}${kind.list}`, { waitUntil: "load", timeout: T });
    await page.waitForSelector("h1", { timeout: T });
    await settle(page);

    let links = await hrefs(page);
    if (kind.via) {
      // Custom content: the list is of types; take the first type that has an entry.
      const types = [...new Set(links.filter((h) => kind.via.test(h ?? "")))];
      links = [];
      for (const typePath of types) {
        await page.goto(`${BASE}${typePath}`, { waitUntil: "load", timeout: T });
        await page.waitForSelector("h1", { timeout: T });
        await settle(page);
        links = await hrefs(page);
        if (links.some((h) => kind.edit.test(h ?? ""))) break;
      }
    }

    const records = [...new Set(links.filter((h) => kind.edit.test(h ?? "")))];
    if (records.length === 0) { note(`${kind.name}: the list has no rows`); continue; }

    await probeRecord(kind.name, records[0]);

    // The one true draft: the seeded sample builder page.
    if (kind.name === "pages") {
      await page.goto(`${BASE}${kind.list}?q=sample-builder-page`, { waitUntil: "load", timeout: T });
      await page.waitForSelector("h1", { timeout: T });
      await settle(page);
      const sample = (await hrefs(page)).filter((h) => kind.edit.test(h ?? ""));
      if (sample.length === 0) {
        note("pages: the seeded sample-builder-page is not on this install, so no true draft is covered");
      } else {
        ok((await status(`${BASE}/sample-builder-page`)) === 404, "sample-builder-page (a draft) is a 404 to the public");
        await probeRecord("sample-builder-page", sample[0]);
      }
    }
  }

  ok(problems.length === 0, `nothing logged (${problems.length})`);
  for (const line of problems.slice(0, 10)) console.log(`     ${line}`);
} finally {
  await browser.close();
}

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log("\nall checks passed");
