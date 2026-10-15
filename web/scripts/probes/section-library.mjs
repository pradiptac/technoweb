import { chromium } from "playwright";

/**
 * The section library and page templates (0.106.0, docs/page-builder.md
 * "The library"), driven through the real buttons.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… PAGE_ID=<a throwaway builder page> \
 *     node scripts/probes/section-library.mjs
 *
 * The page needs at least two sections, the first of them not a hero. The
 * probe saves that page, so give it one made for the run.
 *
 * Checks: (1) Save to library, linked, turns the first card into a linked
 * card; (2) it survives a save and a reload; (3) Save as template lists the
 * template in the library; (4) deleting the section while it is placed linked
 * is refused with a sentence; (5) the library editor opens it with one card;
 * (6) "Make a copy here" turns the link back into an ordinary section;
 * (7) the template, saved while the link stood, still blocks the delete and
 * the refusal says so; the template deletes, then the section does; (8) no
 * console errors. Everything it makes it deletes.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const PAGE_ID = process.env.PAGE_ID;
if (!PAGE_ID) { console.error("PAGE_ID is required"); process.exit(2); }
const stamp = Date.now().toString(36);
const SECTION = `Probe section ${stamp}`;
const TEMPLATE = `Probe template ${stamp}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const problems = [];
page.on("console", (m) => { if (m.type() === "error") problems.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => problems.push(e.message.slice(0, 200)));

const { signInAsStaff } = await import("../shared.mjs");
await signInAsStaff(page);

const cards = page.locator("li[data-section-card]");
const openBuilder = async () => {
  await page.goto(`${BASE}/admin/pages/${PAGE_ID}?tab=builder`, { waitUntil: "load", timeout: 180000 });
  await cards.first().waitFor({ timeout: 120000 });
  await page.waitForTimeout(2000);
};
const savePage = async () => {
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForLoadState("load");
  await page.waitForTimeout(4000);
};
const settled = (l, state = "visible") => l.waitFor({ state, timeout: 60000 }).then(() => true, () => false);
const linkedButton = () => cards.first().getByRole("button", { name: "Make a copy here" });
const modalClosed = () => page.locator("dialog[open]").waitFor({ state: "hidden", timeout: 60000 });
const library = async () => {
  await page.goto(`${BASE}/admin/pages/library`, { waitUntil: "load", timeout: 180000 });
  await page.getByRole("heading", { name: "Section library", level: 1 }).waitFor({ timeout: 120000 });
};
const dialog = () => page.locator("dialog[open]");

// (1) Save to library, linked
await openBuilder();
await cards.first().getByRole("button", { name: /^Save section 1 to the library/ }).click();
await dialog().getByLabel("Name").fill(SECTION);
await dialog().getByRole("button", { name: "Save", exact: true }).click();
await modalClosed();
ok(await settled(linkedButton()), "Save to library turns the card into a linked one");

// (2) survives a save and reload
await savePage();
await openBuilder();
ok(await settled(linkedButton()) && (await cards.first().innerText()).includes(SECTION), "the link survives a save and a reload");

// (3) Save as template
await page.getByRole("button", { name: "Save as template" }).click();
await dialog().getByLabel("Name").fill(TEMPLATE);
await dialog().getByRole("button", { name: "Save", exact: true }).click();
await modalClosed();
await library();
ok(await settled(page.getByRole("link", { name: new RegExp(TEMPLATE) })), "the template is listed in the library");

// (4) delete refused while linked
const sectionRow = page.locator("tr", { hasText: SECTION });
await sectionRow.getByRole("button", { name: /^Delete/ }).click();
await dialog().getByRole("button", { name: "Delete", exact: true }).click();
ok(await settled(dialog().getByText(/still placed, linked/)), "deleting a section placed linked is refused, with a sentence");
await dialog().getByRole("button", { name: "Cancel" }).click();
await modalClosed();

// (5) the library editor
await page.getByRole("link", { name: new RegExp(SECTION) }).click();
await page.getByRole("heading", { name: "Edit library section" }).waitFor({ timeout: 120000 });
await cards.first().waitFor({ timeout: 60000 });
ok(await cards.count() === 1, "the library editor opens the section as one card");
ok(!(await page.getByRole("button", { name: "Save as template" }).count()), "and offers no Save as template there");

// (6) Make a copy here, then the delete goes through
await openBuilder();
await linkedButton().click();
ok(await settled(linkedButton(), "detached"), "Make a copy here turns the link back into a section");
await savePage();
await library();

// (7) the template still links it, so the section is refused until the template goes
await page.locator("tr", { hasText: SECTION }).getByRole("button", { name: /^Delete/ }).click();
await dialog().getByRole("button", { name: "Delete", exact: true }).click();
ok(await settled(dialog().getByText(/1 template/)), "a template that links it still blocks the delete, and says so");
await dialog().getByRole("button", { name: "Cancel" }).click();
await modalClosed();
await page.locator("tr", { hasText: TEMPLATE }).getByRole("button", { name: /^Delete/ }).click();
await dialog().getByRole("button", { name: "Delete", exact: true }).click();
ok(await settled(page.locator("tr", { hasText: TEMPLATE }), "detached"), "the template deletes");
await page.locator("tr", { hasText: SECTION }).getByRole("button", { name: /^Delete/ }).click();
await dialog().getByRole("button", { name: "Delete", exact: true }).click();
ok(await settled(page.locator("tr", { hasText: SECTION }), "detached"), "once nothing links it, the section deletes");

ok(problems.length === 0, `no console errors${problems.length ? ": " + problems.join(" | ") : ""}`);
await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
