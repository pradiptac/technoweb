import { chromium } from "playwright";

/**
 * Drives "Edit on the page" (0.128.0, docs/page-builder.md) through the real
 * builder and its live preview.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… PAGE_ID=<builder page id> \
 *     node scripts/probes/inline-edit.mjs
 *   SHOTS=<dir> saves the pane while a heading is being edited.
 *
 * The page needs, as the seeded sample builder page has: a hero first with a
 * kicker, a heading and a button; a Text section; and a Questions section.
 * It **never saves** — every change stays in the form.
 *
 * (1) the preview makes words editable, and none inside a rich-text body, a
 * button or a FAQ's summary; (2) typing into the hero's heading on the page
 * reaches the form's data and the card's own field, keeps the caret in the
 * frame, and redraws nothing while it is being typed; (3) Enter finishes and
 * the preview redraws with the new words; (4) Escape puts back what was
 * there; (5) a button's wording changes and where it goes does not; (6) a
 * field stops at its length; (7) the builder's Undo takes the last edit
 * back; at the phone's width the words are found again; (8) a message naming a field that is not edited in place, or the
 * wrong current words, changes nothing; (9) the page logs no error or
 * warning. Carries no credential.
 *
 * **The layout section's words** (0.156.0) are checked on a second page when
 * LAYOUT_PAGE_ID names one (the probe skips them, and says so, without it): a
 * builder page whose first Layout section holds, in any order, two Heading
 * widgets in different columns with exactly the words "Same words", a Tabs
 * container whose first tab holds a Heading "Inside the tab", and a Text
 * widget (rich text). It checks that (10) the second of the identical headings
 * is edited on the page and the first is not touched — each widget is found
 * inside its own element; (11) a heading inside a tab edits; (12) a rich-text
 * widget offers no edit; (13) a wrong `was`, and a path that is a heading's
 * `text` on a widget that is not a heading, change nothing.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS;
const PAGE_ID = process.env.PAGE_ID;
const LAYOUT_PAGE_ID = process.env.LAYOUT_PAGE_ID;
if (!PAGE_ID) { console.error("PAGE_ID is required: a builder page (see the docblock)."); process.exit(2); }

const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const { signInAsStaff } = await import("../shared.mjs");
const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
const page = await context.newPage();
const problems = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`));
await signInAsStaff(page);
await page.goto(`${BASE}/admin/pages/${PAGE_ID}?tab=builder`, { waitUntil: "load", timeout: 180000 });
await page.locator("li[data-section-card]").first().waitFor({ timeout: 120000 });

const blocks = () => page.locator('input[name="blocks"]').evaluate((el) => JSON.parse(el.value));
const SHOWN = 'aside[aria-label="Live preview"] iframe.visible';
const frame = page.frameLocator(SHOWN);
const src = () => page.locator(SHOWN).getAttribute("src");
/** The preview has redrawn (a new draft is on show) and found its words again. */
const redrawn = async (from) => {
  await page.waitForFunction(([sel, old]) => {
    const el = document.querySelector(sel);
    return el && el.getAttribute("src") !== old;
  }, [SHOWN, from], { timeout: 120000 });
  await frame.locator("[data-edit]").first().waitFor({ timeout: 60000 });
};

await page.locator(SHOWN).waitFor({ timeout: 180000 });
await frame.locator("[data-edit]").first().waitFor({ timeout: 120000 });
await page.waitForTimeout(1500);

// ---- 1: what is editable, and what is not
const total = await frame.locator("[data-edit]").count();
ok(total >= 5, `the preview makes words editable (${total} places)`);
ok(await frame.locator('[data-page-section="rich_text"] p[data-edit], [data-page-section="rich_text"] li[data-edit]').count() === 0, "nothing inside a rich-text body is");
ok(await frame.locator("button [data-edit], button[data-edit], summary [data-edit], summary[data-edit]").count() === 0, "nor inside a button or a FAQ's summary");

// ---- 2: typing into the hero's heading
const hero = '[data-page-section="hero"]';
const heading = frame.locator(`${hero} .display-1[data-edit]`).first();
const before = (await blocks())[0].data;
const drawn = await src();
await heading.click();
await page.keyboard.press("Control+End");
await page.keyboard.type(" (edited)", { delay: 8 });
await page.waitForTimeout(300);
let now = (await blocks())[0].data;
ok(now.heading === `${before.heading} (edited)`, `typing on the page reaches the form: "${now.heading}"`);
const cardHeading = page.locator('li[data-section-card="hero"] input[id$="-heading"]').first();
ok(await cardHeading.count() === 1 && await cardHeading.inputValue() === now.heading, "the card opened and its own field shows the same words");
ok(await heading.evaluate((el) => el.ownerDocument.activeElement === el), "the caret is still in the words on the page");
await page.waitForTimeout(2600);
ok(await src() === drawn, "nothing is redrawn while they are being typed");
ok(await page.locator('aside[aria-label="Live preview"]').getByText(/Editing on the page/).count() === 1, "and the pane says so");
if (SHOTS) await page.locator('aside[aria-label="Live preview"]').screenshot({ path: `${SHOTS}/inline-edit.png` });

// ---- 3: Enter finishes; the preview redraws with the new words
await page.keyboard.press("Enter");
await redrawn(drawn);
ok((await frame.locator(`${hero} .display-1`).first().innerText()).replace(/\s+/g, " ").trim() === now.heading, "Enter finishes, and the preview redraws with the new heading");
ok(now.layout === before.layout && now.image_path === before.image_path && now.primary?.href === before.primary?.href, "the hero's layout, picture and link are what they were");

// ---- 4: Escape puts back what was there
const again = frame.locator(`${hero} .display-1[data-edit]`).first();
await again.click();
await page.keyboard.type("zzz", { delay: 8 });
await page.waitForTimeout(200);
const typed = (await blocks())[0].data.heading;
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
ok(typed !== now.heading && (await blocks())[0].data.heading === now.heading, "Escape puts back what was there");

// ---- 5: a button's wording, never where it goes
const button = frame.locator(`${hero} a[data-edit]`).first();
if (await button.count()) {
  const at = await src();
  await button.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" now", { delay: 8 });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  const after = (await blocks())[0].data;
  ok(after.primary.label === `${before.primary.label} now` && after.primary.href === before.primary.href, `a button's wording changes ("${after.primary.label}") and its link does not`);
  ok(page.url().includes(`/admin/pages/${PAGE_ID}`) && (await page.locator(SHOWN).count()) === 1, "pressing it went nowhere");
  await redrawn(at);
} else {
  ok(false, "the hero has no button whose wording could be edited");
}

// ---- 6: a field stops at its length
const kicker = frame.locator(`${hero} span[data-edit]`).first();
if (await kicker.count()) {
  const at = await src();
  await kicker.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText(" word".repeat(30));
  await page.waitForTimeout(300);
  const long = (await blocks())[0].data.kicker;
  ok(long.length === 80, `a kicker stops at its 80 characters (${long.length})`);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);

  // ---- 7: Undo takes the last edit back
  await page.getByRole("button", { name: "Undo", exact: true }).first().click();
  await page.waitForTimeout(300);
  ok((await blocks())[0].data.kicker === before.kicker, "the builder's Undo takes the last edit back");
  await redrawn(at);
} else {
  ok(false, "the hero has no kicker to edit");
}

// ---- the phone's width: the words are found again where that layout draws them
await page.locator('aside[aria-label="Live preview"]').getByRole("button", { name: "Phone", exact: true }).click();
await page.waitForTimeout(1500);
const onPhone = await frame.locator("[data-edit]").count();
ok(onPhone >= 5, `at the phone's width the words are still editable (${onPhone} places)`);
await page.locator('aside[aria-label="Live preview"]').getByRole("button", { name: "Desktop", exact: true }).click();
await page.waitForTimeout(800);

// ---- 8: a message is checked like anything from outside
const held = (await blocks())[0];
const forge = (message) => page.locator(SHOWN).evaluate((el, m) => {
  el.contentWindow.eval(`window.parent.postMessage(${JSON.stringify(m)}, window.location.origin)`);
}, message);
await forge({ type: "tw:builder-edit", id: held.id, path: ["layout"], value: "cover", was: held.data.layout });
await forge({ type: "tw:builder-edit", id: held.id, path: ["primary", "href"], value: "https://example.com", was: held.data.primary?.href ?? "" });
await forge({ type: "tw:builder-edit", id: held.id, path: ["heading"], value: "Forged", was: "not what it says" });
await forge({ type: "tw:builder-edit", id: held.id, path: ["heading"], value: "x".repeat(400), was: held.data.heading });
await page.waitForTimeout(500);
const still = (await blocks())[0].data;
ok(still.layout === held.data.layout && still.primary?.href === held.data.primary?.href && still.heading === held.data.heading,
  "a field not edited in place, the wrong current words and an over-long value all change nothing");

// ---- 10-13: the layout section's words, each found inside its own widget
if (!LAYOUT_PAGE_ID) {
  console.log("skip the layout section's words: LAYOUT_PAGE_ID is not set");
} else {
  await page.goto(`${BASE}/admin/pages/${LAYOUT_PAGE_ID}?tab=builder`, { waitUntil: "load", timeout: 180000 });
  await page.locator("li[data-section-card]").first().waitFor({ timeout: 120000 });
  await page.locator(SHOWN).waitFor({ timeout: 180000 });
  await frame.locator("[data-edit]").first().waitFor({ timeout: 120000 });
  await page.waitForTimeout(1500);

  /** Every widget of the first layout section with its path, a container's children included. */
  const widgets = async () => {
    const list = (await blocks()).find((b) => b.type === "layout");
    const out = [];
    const visit = (ws, at) => ws?.forEach((w, i) => {
      out.push({ path: [...at, i], w });
      w.slots?.forEach((slot, j) => visit(slot.widgets, [...at, i, "slots", j, "widgets"]));
    });
    list?.data.rows?.forEach((row, r) => row.columns?.forEach((col, c) => visit(col.widgets, ["rows", r, "columns", c, "widgets"])));
    return { id: list?.id, widgets: out };
  };
  const lay = '[data-page-section="layout"]';
  const same = (all) => all.widgets.filter((x) => x.w.type === "heading" && x.w.text.startsWith("Same words"));

  const first = await widgets();
  ok(same(first).length === 2, "the layout page holds two headings with the same words");
  const twins = frame.locator(`${lay} [data-widget="heading"][data-edit]`).filter({ hasText: /^Same words/ });
  ok(await twins.count() === 2, "both are editable on the page, though their words are identical");

  // 10: the second one changes, the first does not
  const at = await src();
  await twins.nth(1).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" two", { delay: 8 });
  await page.waitForTimeout(300);
  const [a, b] = same(await widgets());
  ok(a.w.text === "Same words" && b.w.text === "Same words two", `the second heading changes ("${b.w.text}") and the first does not ("${a.w.text}")`);
  // A folded widget card shows its words in its summary line ("Heading — Same words"); its inputs are only drawn when open.
  const cardTexts = await page.locator('li[data-section-card="layout"] [data-layout-widget-card="heading"] > div > button').evaluateAll((els) => els.map((e) => e.textContent.split("— ")[1] ?? ""));
  ok(cardTexts.includes("Same words two") && cardTexts.includes("Same words"), `the card shows the same two headings (${cardTexts.join(" | ")})`);
  await page.keyboard.press("Enter");
  await redrawn(at);

  // 11: a heading inside a tab
  const inTab = frame.locator(`${lay} [data-widget="tabs"] [data-widget="heading"][data-edit]`).first();
  ok(await inTab.count() === 1, "a heading inside the first tab is editable");
  const at2 = await src();
  await inTab.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" here", { delay: 8 });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  const child = (await widgets()).widgets.find((x) => x.w.type === "heading" && x.w.text.startsWith("Inside the tab"));
  ok(child?.w.text === "Inside the tab here" && child.path.includes("slots"), `it changes in the tab's slot ("${child?.w.text}")`);
  await redrawn(at2);

  // 12: a rich-text widget keeps its editor
  ok(await frame.locator(`${lay} [data-widget="text"][data-edit], ${lay} [data-widget="text"] [data-edit]`).count() === 0, "a rich-text widget offers no edit on the page");

  // 13: forged messages
  const now = await widgets();
  const twin = same(now)[1];
  const text = now.widgets.find((x) => x.w.type === "text");
  await forge({ type: "tw:builder-edit", id: now.id, path: [...twin.path, "text"], value: "Forged", was: "not what it says" });
  await forge({ type: "tw:builder-edit", id: now.id, path: [...text.path, "text"], value: "Forged", was: "" });
  await page.waitForTimeout(500);
  const after = await widgets();
  ok(same(after)[1].w.text === twin.w.text && after.widgets.find((x) => x.w.type === "text").w.text === undefined,
    `a wrong \`was\`, and a heading's path on a widget that is not a heading, change nothing (${same(after)[1].w.text} / ${JSON.stringify(after.widgets.find((x) => x.w.type === "text").w)})`);
}

await page.waitForTimeout(1000);
ok(problems.length === 0, `no console errors or warnings${problems.length ? ":\n  " + problems.join("\n  ") : ""}`);
await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
