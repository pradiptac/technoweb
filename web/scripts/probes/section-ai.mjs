import { chromium } from "playwright";

/**
 * Drives the assistant on a builder section (0.127.0, docs/page-builder.md
 * "The assistant on a section") through the real screen and the real model.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… PAGE_ID=<builder page id> \
 *     node scripts/probes/section-ai.mjs
 *   SHOTS=<dir> saves the assistant's panel at 1400 and 390.
 *
 * The page needs, as the seeded sample builder page has: a hero first with a
 * heading and a button; a Text section whose body holds a list or a link; a
 * "Picture or video with text" section whose body is plain paragraphs; and a
 * Testimonial. It **never saves** — every change stays in the form — and it
 * spends three of the day's AI requests.
 *
 * With the assistant switched off it checks only that the card says why.
 * Otherwise: (1) Reword on the hero changes its words and nothing else — the
 * layout, the picture and where the button goes are what they were — and the
 * panel's own Undo puts the heading back; (2) Write with no brief is refused
 * under the brief, with no request; (3) a body with a list is refused in
 * words, unchanged; (4) Shorten on a plain body changes what the rich-text
 * editor shows, and the builder's Undo puts the editor's text back (the
 * editor is re-mounted on the old words — it used to keep showing the new
 * ones); (5) a testimonial has no assistant; (6) at 390 the panel does not
 * widen the page; (7) the page logs no error or warning. Carries no credential.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS;
const PAGE_ID = process.env.PAGE_ID;
if (!PAGE_ID) { console.error("PAGE_ID is required: a builder page (see the docblock)."); process.exit(2); }

const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const { signInAsStaff } = await import("../shared.mjs");
const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await context.newPage();
const problems = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`));
await signInAsStaff(page);
await page.goto(`${BASE}/admin/pages/${PAGE_ID}?tab=builder`, { waitUntil: "load", timeout: 180000 });
await page.locator("li[data-section-card]").first().waitFor({ timeout: 120000 });
await page.waitForTimeout(2500);

const blocks = () => page.locator('input[name="blocks"]').evaluate((el) => JSON.parse(el.value));
const card = (type) => page.locator(`li[data-section-card="${type}"]`).first();
/** Open a card and its assistant; answers the assistant's root. */
const assistant = async (type) => {
  const c = card(type);
  const toggle = c.locator("button[aria-expanded]").first();
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  const a = c.locator("[data-section-assistant]");
  await a.waitFor({ timeout: 30000 });
  const open = a.locator("> button[aria-expanded]");
  if ((await open.getAttribute("aria-expanded")) !== "true") await open.click();
  return a;
};
const done = (a) => a.locator('[role="status"]', { hasText: /done\.|Written\./ }).waitFor({ timeout: 120000 }).then(() => true, () => false);

// ---- the hero
const hero = await assistant("hero");
const off = await hero.locator('[role="group"]').count() === 0;

if (off) {
  const reason = (await hero.locator("p").first().innerText()).trim();
  ok(reason.length > 20, `the assistant is unavailable and the card says why: "${reason}"`);
} else {
  const before = (await blocks())[0].data;
  const heading = card("hero").locator('input[id$="-heading"]').first();
  const headingBefore = await heading.inputValue();

  await hero.getByRole("button", { name: "Reword", exact: true }).click();
  await hero.locator("button.btn", { hasText: /^Reword$/ }).click();
  ok(await done(hero), "Reword on the hero answers");
  const after = (await blocks())[0].data;
  const words = ["kicker", "heading", "lede"].filter((k) => before[k] !== after[k]);
  ok(words.length > 0, `its words changed (${words.join(", ")}): "${after.heading}"`);
  ok(after.layout === before.layout && after.image_path === before.image_path && after.video_path === before.video_path
    && after.primary?.href === before.primary?.href && after.secondary?.href === before.secondary?.href,
  "its layout, picture and where its buttons go did not");
  ok(await heading.inputValue() === after.heading, "the heading field shows the new words");
  if (SHOTS) await card("hero").locator("[data-section-assistant]").screenshot({ path: `${SHOTS}/assistant-1400.png` });

  await hero.getByRole("button", { name: "Undo", exact: true }).click();
  await page.waitForTimeout(400);
  ok(await heading.inputValue() === headingBefore && (await blocks())[0].data.heading === before.heading, "the panel's Undo puts the old heading back");

  // ---- write with no brief: refused here, before any request
  await hero.getByRole("button", { name: "Write", exact: true }).click();
  await hero.locator("button.btn", { hasText: /^Write$/ }).click();
  const refused = await hero.locator("p", { hasText: /Say what this section should be about/ }).first().waitFor({ timeout: 15000 }).then(() => true, () => false);
  ok(refused && (await blocks())[0].data.heading === before.heading, "Write with no brief is refused under the brief, and nothing changed");

  // ---- a body with a list is not reworded
  const text = await assistant("rich_text");
  const textBefore = (await blocks()).find((b) => b.type === "rich_text").data.body;
  await text.getByRole("button", { name: "Reword", exact: true }).click();
  await text.locator("button.btn", { hasText: /^Reword$/ }).click();
  const structured = await text.locator('[role="alert"]', { hasText: /formatting the assistant would lose/ }).waitFor({ timeout: 60000 }).then(() => true, () => false);
  ok(structured && (await blocks()).find((b) => b.type === "rich_text").data.body === textBefore, "a body with a list or a link is refused in words, unchanged");

  // ---- a plain body: the editor shows the new words, and Undo the old
  const media = await assistant("media_text");
  const editable = card("media_text").locator(".note-editable").first();
  await editable.waitFor({ timeout: 60000 });
  const shownBefore = (await editable.innerText()).trim();
  await media.getByRole("button", { name: "Expand", exact: true }).click();
  await media.locator("button.btn", { hasText: /^Expand$/ }).click();
  ok(await done(media), "Expand on a picture-and-text section answers");
  await editable.waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
  const shownAfter = (await editable.innerText()).trim();
  const mediaAfter = (await blocks()).find((b) => b.type === "media_text").data;
  ok(shownAfter !== shownBefore && shownAfter.length > shownBefore.length, `the editor shows the longer text (${shownBefore.length} → ${shownAfter.length} characters)`);
  ok(!/<(?!\/?p\b)[a-z]/i.test(mediaAfter.body) && mediaAfter.image_path !== undefined, "the new body is plain paragraphs and the picture is still there");

  await page.getByRole("button", { name: "Undo", exact: true }).first().click();
  await editable.waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
  ok((await editable.innerText()).trim() === shownBefore, "the builder's Undo puts the editor's own text back");
}

// ---- a testimonial is somebody's words
const quote = card("testimonial");
if (await quote.count()) {
  const toggle = quote.locator("button[aria-expanded]").first();
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await quote.locator("input, textarea").first().waitFor({ timeout: 30000 });
  ok(await quote.locator("[data-section-assistant]").count() === 0, "a testimonial has no assistant");
}

// ---- a phone
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(800);
await card("hero").locator("[data-section-assistant]").scrollIntoViewIfNeeded();
const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
ok(over <= 0, `at 390 the open panel does not widen the page (${over})`);
if (SHOTS) await card("hero").locator("[data-section-assistant]").screenshot({ path: `${SHOTS}/assistant-390.png` });

await page.waitForTimeout(1000);
ok(problems.length === 0, `no console errors or warnings${problems.length ? ":\n  " + problems.join("\n  ") : ""}`);
await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
