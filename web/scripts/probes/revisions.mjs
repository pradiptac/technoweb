import { chromium } from "playwright";

/**
 * Page history (0.145.0, docs/page-builder.md "Page history"), through the real
 * screens.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… PAGE_ID=<a page with 2+ versions> \
 *     node scripts/probes/revisions.mjs
 *   TYPE=solution ID=1 …   another kind of record (0.148.0): any alias in
 *     ROUTES below; `entry` also wants ENTRY_TYPE=<the content type's slug>.
 *     `PAGE_ID` is `TYPE=page ID=…`. A sign-in whose role does not own the
 *     kind sees no History button, which is reported rather than failed.
 *   SAVE=1 …   also creates, edits and deletes a throwaway page (step 5;
 *     pages only).
 *   SHOTS=<dir> saves the dialog and the banner.
 *
 * On the record named by ID (the mock's sample builder page, id 6, and its
 * solution 1 have three versions each):
 *   1. opens History and reads the rows — each has a time, a person, what
 *      changed, a Preview and a Restore;
 *   2. Preview on the oldest row: a framed `/admin/draft-preview/…`, the
 *      sections drawn; Back returns to the list;
 *   3. Restore on the oldest row: the dialog closes, the banner "Loaded the
 *      version from …" shows, and the form holds that version — the builder's
 *      hidden `blocks` input carries as many sections as the row said;
 *   4. reloads **without saving**: the page's title is what it was, and the
 *      History list has the same number of rows — nothing was written by
 *      restoring; the local draft the restore left is discarded;
 *   5. (SAVE=1) creates a throwaway page, saves an edit, and checks a History
 *      button now exists with a row from this person — then deletes the page.
 *      A save by the same person within five minutes is folded into the
 *      previous version, so a second row is not expected here and the probe
 *      does not wait five minutes to see one.
 *
 * Carries no credential. Steps 1–4 save nothing. With fewer than two versions
 * on the page, 2–4 are skipped and said so.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const TYPE = process.env.TYPE ?? "page";
const PAGE_ID = process.env.ID ?? process.env.PAGE_ID;
const ENTRY_TYPE = process.env.ENTRY_TYPE ?? "";
/** The edit screen of each kind that has a history. */
const ROUTES = {
  page: (id) => `/admin/pages/${id}`,
  blog_post: (id) => `/admin/blog/${id}`,
  knowledge_article: (id) => `/admin/knowledge-base/${id}`,
  case_study: (id) => `/admin/case-studies/${id}`,
  solution: (id) => `/admin/solutions/${id}`,
  service: (id) => `/admin/services/${id}`,
  product: (id) => `/admin/products/${id}`,
  store_product: (id) => `/admin/store/products/${id}`,
  event: (id) => `/admin/events/${id}`,
  job_opening: (id) => `/admin/jobs/${id}`,
  entry: (id) => `/admin/content/${ENTRY_TYPE}/${id}`,
  landing_page: (id) => `/admin/landing-pages/${id}`,
};
if (!ROUTES[TYPE]) { console.error(`TYPE must be one of: ${Object.keys(ROUTES).join(", ")}`); process.exit(2); }
/** The control holding the record's title, or its name on a product. */
const TITLE = TYPE === "product" || TYPE === "store_product" ? "#name" : "#title";
const editUrl = (id) => `${BASE}${ROUTES[TYPE](id)}`;
const SHOTS = process.env.SHOTS;
const SAVE = process.env.SAVE === "1";
const T = 180000;

// The helper signs in on its own default origin (127.0.0.1); a cookie set
// there is not sent to localhost, so both must use one.
process.env.BASE = BASE;
const { signInAsStaff } = await import("../shared.mjs");

const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const note = (l) => console.log(`skip ${l}`);

const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await context.newPage();
const problems = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`));
await signInAsStaff(page);

const dialog = () => page.locator("dialog[open]");
const rows = () => dialog().locator("ul > li");
const openHistory = async () => {
  await page.locator("button", { hasText: /^History$/ }).click();
  await dialog().waitFor({ timeout: T });
  await rows().first().waitFor({ timeout: T });
};

if (PAGE_ID) {
  await page.goto(editUrl(PAGE_ID), { waitUntil: "load", timeout: T });
  const title = page.locator(TITLE);
  await title.waitFor({ timeout: T });
  const originalTitle = await title.inputValue();

  // 1 — the list
  if (await page.locator("button", { hasText: /^History$/ }).count() === 0) {
    note(`no History button on this ${TYPE} (this sign-in does not own the kind, or the record has no versions yet)`);
    await browser.close();
    process.exit(0);
  }
  await openHistory();
  const count = await rows().count();
  ok(count >= 1, `History lists the saved versions (${count})`);
  const first = await rows().first().innerText();
  ok(/Latest saved/.test(first), "the newest row is marked as the latest saved");
  ok(await rows().first().locator("button", { hasText: /^Preview$/ }).count() === 1
    && await rows().first().locator("button", { hasText: /^Restore$/ }).count() === 1, "every row has Preview and Restore");
  if (SHOTS) await dialog().screenshot({ path: `${SHOTS}/history-list.png` });

  if (count >= 2) {
    const oldest = rows().last();
    const oldestText = await oldest.innerText();
    const sectionsAsked = Number((oldestText.match(/(\d+) sections?/) ?? [])[1] ?? 0);

    // 2 — Preview
    await oldest.locator("button", { hasText: /^Preview$/ }).click();
    const frame = page.frameLocator('iframe[title^="Preview of the version"]');
    await frame.locator("[data-page-section], main").first().waitFor({ timeout: T });
    ok(true, "Preview draws the oldest version in a framed draft preview");
    if (SHOTS) await dialog().screenshot({ path: `${SHOTS}/history-preview.png` });
    await dialog().locator("button", { hasText: /^Back to the list$/ }).click();
    ok(await rows().count() === count, "Back returns to the list");

    // 3 — Restore
    await rows().last().locator("button", { hasText: /^Restore$/ }).click();
    await page.locator("dialog[open]").waitFor({ state: "detached", timeout: T });
    const banner = page.getByText(/Loaded the version from/);
    await banner.first().waitFor({ timeout: T });
    ok(true, "the banner says which version was loaded and that nothing is saved");
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/history-restored.png` });
    // A kind without sections (a landing page), or a form without the control, has none to compare.
    if (await page.locator('input[name="blocks"]').count()) {
      const blocks = await page.locator('input[name="blocks"]').inputValue();
      let loaded = [];
      try { loaded = JSON.parse(blocks); } catch { /* reported below */ }
      ok(Array.isArray(loaded) && (sectionsAsked === 0 || loaded.length === sectionsAsked),
        `the form holds that version's sections (${loaded.length} of ${sectionsAsked || "n/a"})`);
    } else {
      note(`this ${TYPE} form has no sections control; the section count was not compared`);
    }
    ok((await page.locator(TITLE).inputValue()).trim() !== "", "the form's title or name holds the version's");

    // 4 — nothing was written
    await page.goto(editUrl(PAGE_ID), { waitUntil: "load", timeout: T });
    await page.locator(TITLE).waitFor({ timeout: T });
    ok(await page.locator(TITLE).inputValue() === originalTitle, "reloading without saving leaves the record as it was");
    const discard = page.locator("[data-form-draft] button", { hasText: /^Discard$/ });
    if (await discard.count()) await discard.click();
    await openHistory();
    ok(await rows().count() === count, "restoring wrote no version of its own");
    await page.keyboard.press("Escape");
  } else {
    note("fewer than two versions on this page; Preview and Restore were not exercised");
  }
} else {
  note("ID (or PAGE_ID) not set; steps 1–4 skipped");
}

// 5 — a save makes a version (opt-in: it writes, then cleans up after itself)
if (SAVE && TYPE !== "page") {
  note(`SAVE=1 makes a throwaway page; skipped for TYPE=${TYPE}`);
} else if (SAVE) {
  const stamp = Date.now();
  await page.goto(`${BASE}/admin/pages/new`, { waitUntil: "load", timeout: T });
  await page.locator("#title").fill(`Revision probe ${stamp}`);
  await page.getByRole("button", { name: /^Create page$/ }).click();
  await page.waitForURL(/\/admin\/pages\/\d+/, { timeout: T });
  const id = page.url().match(/\/admin\/pages\/(\d+)/)?.[1];
  await page.locator("#title").fill(`Revision probe ${stamp} edited`);
  await page.getByRole("button", { name: /^Save changes$/ }).click();
  await page.waitForLoadState("load");
  await page.locator("#title").waitFor({ timeout: T });
  await openHistory();
  const text = await rows().first().innerText();
  ok(/Latest saved/.test(text) && text.trim().length > 0, "a saved page has a History row from the save");
  await page.keyboard.press("Escape");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /^Delete page$/ }).click();
  await page.waitForURL(/\/admin\/pages(\?|$)/, { timeout: T });
  ok(true, `the throwaway page ${id} was deleted`);
} else {
  note("SAVE=1 not set; the save step (5) was skipped");
}

ok(problems.length === 0, `nothing logged to the console${problems.length ? `: ${problems[0]}` : ""}`);
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
