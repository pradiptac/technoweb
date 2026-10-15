import { chromium } from "playwright";

/**
 * Sections on a record that is not a page (0.129.0, docs/page-builder.md
 * "Sections on other records"), driven through the real form and read on
 * the real public page.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… RECORD=solutions RECORD_ID=<id> \
 *     node scripts/probes/record-sections.mjs
 *   RECORD is the console folder — solutions, services, industries,
 *   case-studies, and since 0.130.0 blog, knowledge-base, products,
 *   store/products, events, jobs and content/<type>. PUBLIC_PREFIX is the public
 *   prefix where it differs: `careers` for jobs, the type's slug for an
 *   entry. FAQ=0 for a record with no FAQPage of its own (a vacancy). The
 *   record must be published. SHOTS=<dir> saves the page at 1280 and 360.
 *
 * On the record's edit form: the Sections tab is there, and choosing Sections
 * draws the builder with no Hero and nothing "From the theme" to add. Three
 * sections are pasted in — a text section, a checklist and two typed
 * questions — and the form is saved. On the public page it then checks: one
 * `h1`; the three sections drawn as full-width bands between the heading and
 * the rest, their headings `h2`; one `FAQPage`, holding the typed questions;
 * no horizontal overflow at 1280 or 360; nothing logged to the console.
 *
 * **It saves the record twice and leaves it as it found it**: the three
 * sections are removed again and the layout put back, and the public page is
 * read once more to see the written body return. A record that already had
 * sections keeps them. Carries no credential.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const SHOTS = process.env.SHOTS;
const RECORD = process.env.RECORD ?? "solutions";
// Not `PUBLIC`: Windows sets that one itself, to C:\Users\Public.
const PUBLIC = process.env.PUBLIC_PREFIX ?? RECORD;
const WANTS_FAQ = process.env.FAQ !== "0";
const NAME = RECORD.replaceAll("/", "-");
const ID = process.env.RECORD_ID;
if (!ID) { console.error("RECORD_ID is required"); process.exit(2); }

const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const T = 180000;

const { signInAsStaff } = await import("../shared.mjs");
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();
const problems = [];
const listen = (p, where) => {
  p.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(`${where} ${m.type()}: ${m.text().slice(0, 2500)}`); });
  p.on("pageerror", (e) => problems.push(`${where} pageerror: ${e.message.slice(0, 300)}`));
};
listen(page, "console");

const uuid = () => crypto.randomUUID();
const PASTED = [
  { type: "rich_text", data: { heading: "Probe: how it works", body: "<p>A paragraph the probe laid out as a section.</p>" } },
  { type: "checklist", data: { heading: "Probe: what is included", columns: 2, items: [{ text: "A site survey" }, { text: "A written report" }, { text: "A costed plan" }] } },
  { type: "faq", data: { heading: "Probe: questions", source: "custom", items: [
    { question: "Probe question one?", answer: "Probe answer one." },
    { question: "Probe question two?", answer: "Probe answer two." },
  ] } },
];

const open = async () => {
  await page.goto(`${BASE}/admin/${RECORD}/${ID}?tab=sections`, { waitUntil: "load", timeout: T });
  await page.locator("#body_layout").waitFor({ timeout: T });
  // Hydrated: a press before React has attached its handlers does nothing,
  // and the server's markup already holds every button.
  await page.waitForFunction(() => Object.keys(document.querySelector("#body_layout") ?? {}).some((k) => k.startsWith("__reactProps")), null, { timeout: T });
};
const save = async () => {
  await Promise.all([
    // `?saved=1` on most forms; `?done=…` on the vacancy and event forms.
    page.waitForURL((u) => u.searchParams.has("saved") || u.searchParams.has("done"), { timeout: T }),
    page.getByRole("button", { name: /^Save (changes|vacancy)$/ }).click(),
  ]);
  await page.waitForLoadState("load");
};

await signInAsStaff(page);
await open();

const slug = await page.locator("#slug").inputValue();
const before = { layout: await page.locator("#body_layout").inputValue(), count: JSON.parse(await page.locator('input[name="blocks"]').inputValue()).length };
ok(await page.getByRole("tab", { name: /^Sections/ }).count() === 1, "the form has a Sections tab");

await page.locator("#body_layout").selectOption("sections");
await page.locator("[data-section-builder]").waitFor({ timeout: T });
ok(true, "choosing Sections draws the builder");

await page.getByRole("button", { name: "Add a section" }).click();
const offered = await page.locator("dialog[open] button > span:first-child").allTextContents();
ok(offered.includes("Text") && offered.length > 10, `the picker offers the section types (${offered.length})`);
ok(!offered.includes("Hero") && !offered.includes("From the theme"), "but no Hero and nothing From the theme");
await page.keyboard.press("Escape");

for (const section of PASTED) {
  await page.evaluate((s) => localStorage.setItem("tw_section_clipboard", JSON.stringify({ "tw-section": 1, section: { id: s.id, hidden: false, background: null, ...s } })), { id: uuid(), ...section });
  await page.getByRole("button", { name: "Paste a section" }).click();
  await page.waitForTimeout(400);
}
const cards = page.locator("li[data-section-card]");
ok(await cards.count() === before.count + PASTED.length, `three sections pasted (${await cards.count()} cards)`);

// The FAQ editor inside a record offers no "this page's FAQs".
await cards.last().locator("button[aria-expanded]").first().click().catch(() => undefined);
ok(await cards.last().locator("text=This page’s FAQs (the AEO tab)").count() === 0, "the FAQ section has no “this page’s FAQs” choice here");

await save();
ok(true, "the form saved");

// ---- the public page -------------------------------------------------------
const site = await context.newPage();
listen(site, "site");
const read = async (width) => {
  await site.setViewportSize({ width, height: 900 });
  await site.goto(`${BASE}/${PUBLIC}/${slug}`, { waitUntil: "load", timeout: T });
  // Hydrated — `data-aos-ready` is stamped by the reveal observer after it.
  // A screenshot taken before then hides the caret by styling every input,
  // and React reports the styled inputs as a hydration mismatch.
  await site.waitForSelector("html[data-aos-ready]", { timeout: T });
  await site.waitForTimeout(600);
};
/** Scroll the page through once, so every reveal has played before a full-page picture. */
const shoot = async (file) => {
  const height = await site.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 500) { await site.evaluate((to) => window.scrollTo(0, to), y); await site.waitForTimeout(120); }
  await site.evaluate(() => window.scrollTo(0, 0));
  await site.waitForTimeout(500);
  await site.screenshot({ path: file, fullPage: true });
};

await read(1280);
const found = await site.evaluate(() => {
  const wrap = document.querySelector("[data-record-sections]");
  const bands = wrap ? [...wrap.querySelectorAll("[data-page-section]")] : [];
  const main = document.querySelector("main");
  return {
    h1: document.querySelectorAll("h1").length,
    bands: bands.map((b) => b.getAttribute("data-page-section")),
    headings: bands.map((b) => { const h = b.querySelector("h1,h2,h3"); return h ? `${h.tagName}:${h.textContent.trim()}` : null; }),
    full: bands.length > 0 && bands.every((b) => Math.abs(b.getBoundingClientRect().width - document.documentElement.clientWidth) < 2),
    afterHero: Boolean(wrap && main && wrap.compareDocumentPosition(document.querySelector("h1")) & Node.DOCUMENT_POSITION_PRECEDING),
    faqPages: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent).filter((t) => t.includes('"FAQPage"')),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    nested: Boolean(wrap?.closest("[data-container]")),
  };
});
ok(found.h1 === 1, `one h1 (${found.h1})`);
ok(["rich_text", "checklist", "faq"].every((t) => found.bands.includes(t)), `the sections are drawn (${found.bands.join(", ")})`);
ok(found.headings.includes("H2:Probe: how it works") && found.headings.includes("H2:Probe: what is included"), `their headings are h2 (${found.headings.join(" | ")})`);
ok(found.full && !found.nested && found.afterHero, "as full-width bands under the heading, not inside the page's container");
if (WANTS_FAQ) ok(found.faqPages.length === 1 && found.faqPages[0].includes("Probe question one?"), `one FAQPage, holding the typed questions (${found.faqPages.length})`);
else ok(found.faqPages.length === 0, `no FAQPage on a record that has none (${found.faqPages.length})`);
ok(found.overflow <= 0, `no horizontal overflow at 1280 (${found.overflow}px)`);
if (SHOTS) await shoot(`${SHOTS}/record-${NAME}-1280.png`);

await read(360);
const phone = await site.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(phone <= 0, `no horizontal overflow at 360 (${phone}px)`);
if (SHOTS) await shoot(`${SHOTS}/record-${NAME}-360.png`);

// KEEP=1 stops here, leaving the sections on — for auditing the public page
// by hand. Run again without it afterwards only after removing them.
if (process.env.KEEP) {
  ok(problems.length === 0, `nothing logged to the console${problems.length ? ":\n  " + problems.join("\n  ") : ""}`);
  await browser.close();
  console.log(failed ? `\n${failed} failed (sections left on)` : "\nall passed (sections left on)");
  process.exit(failed ? 1 : 0);
}

// ---- put it back -----------------------------------------------------------
await open();
if ((await page.locator("#body_layout").inputValue()) !== "sections") await page.locator("#body_layout").selectOption("sections");
await page.locator("[data-section-builder]").waitFor({ timeout: T });
for (let i = 0; i < PASTED.length; i++) {
  // Pressed again if the card is still there: under `next dev` the form can
  // move as a late chunk lands, and a press that arrives mid-move is lost.
  const n = await cards.count();
  for (let tries = 0; tries < 3 && (await cards.count()) === n; tries++) {
    await page.getByRole("button", { name: `Remove section ${n}`, exact: true }).click();
    await page.waitForFunction((want) => document.querySelectorAll("li[data-section-card]").length === want, n - 1, { timeout: 5000 }).catch(() => undefined);
  }
}
ok(await cards.count() === before.count, `the three sections removed again (${await cards.count()} left)`);
await page.locator("#body_layout").selectOption(before.layout);
await save();

await read(1280);
const after = await site.evaluate(() => ({
  wrap: document.querySelectorAll("[data-record-sections]").length,
  probe: document.body.textContent.includes("Probe: how it works"),
}));
ok(before.count > 0 && before.layout === "sections" ? !after.probe : after.wrap === 0 && !after.probe, "the public page is back as it was");

ok(problems.length === 0, `nothing logged to the console${problems.length ? ":\n  " + problems.join("\n  ") : ""}`);
await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
