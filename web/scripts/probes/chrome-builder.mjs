import { chromium } from "playwright";

/**
 * Site → Header & footer (0.160.0), end to end through the real screen.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/chrome-builder.mjs
 *   THEMES="classic launch" is the default; any theme ids may be named.
 *   RESTORE=1 only puts the named themes' header and footer back to their defaults.
 *
 * For each theme: (1) untouched, the header holds a phone number and a search
 * field and the button has the theme's own words; (2) with Search and Phone
 * number switched off and the main button's words changed, saved from the
 * screen, `/theme-preview/<theme>` has neither part in its header — at 1280
 * and at 360 — shows the new words in the button, and does not scroll
 * sideways; (3) "Restore defaults", saved, brings both parts back and the
 * theme's own words with them. The mobile drawer is left out of every count:
 * it carries the same number and the same field by design.
 *
 * Also proves the default output is unchanged by the build — that is
 * `scripts/probes/html-snapshot.mjs`, run against a build from before this
 * release and one from after (see its docblock); this probe covers the parts
 * that change, that one the markup that must not.
 *
 * Carries no credential; saves `site_theme_options` — a development database only.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const THEMES = (process.env.THEMES ?? "classic launch").split(/\s+/).filter(Boolean);
const WORDS = "Book a survey";
const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const { signInAsStaff } = await import("../shared.mjs");
const admin = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
await signInAsStaff(admin);

async function openScreen(theme) {
  await admin.goto(`${BASE}/admin/site/chrome`, { waitUntil: "load", timeout: 180000 });
  await admin.waitForSelector("#chrome-theme", { timeout: 60000 });
  await admin.selectOption("#chrome-theme", theme);
}

async function save() {
  await admin.getByRole("button", { name: /Save header & footer/ }).click();
  await admin.getByText("The site shows it on its next request.").waitFor({ timeout: 60000 });
}

async function restore(theme) {
  await openScreen(theme);
  const button = admin.getByRole("button", { name: /Restore .* defaults/ });
  if (await button.isEnabled()) {
    await button.click();
    await save();
  }
}

/** What the header holds, outside the mobile drawer, on the theme's own preview. */
async function read(theme, width) {
  const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
  // The preview is for signed-in staff: reuse the admin session's cookies.
  await page.context().addCookies(await admin.context().cookies());
  await page.goto(`${BASE}/theme-preview/${theme}`, { waitUntil: "load", timeout: 180000 });
  await page.waitForTimeout(1500);
  const out = await page.evaluate(() => {
    const main = document.getElementById("main");
    const before = (el) => !el.closest("#mobile-menu") && !!(el.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING);
    const all = (sel) => [...document.querySelectorAll(sel)].filter(before);
    const ctas = all('a[href="/contact"], a[href="/support"], a[href="/quote"]');
    return {
      phone: all('a[href^="tel:"]').length,
      search: all('form[action="/search"]').length,
      ctaText: ctas.map((a) => a.textContent.trim()),
      over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      // What sticks out, when something does: an element past the edge with no clipping ancestor.
      culprits: [...document.querySelectorAll("body *")].filter((el) => {
        if (!el.getClientRects().length || el.getBoundingClientRect().right <= document.documentElement.clientWidth + 1) return false;
        for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) if (/hidden|clip|auto|scroll/.test(getComputedStyle(up).overflowX)) return false;
        return true;
      }).slice(0, 3).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 4).join(".")} "${(el.textContent ?? "").trim().slice(0, 20)}"`),
    };
  });
  await page.context().close();
  return out;
}

if (process.env.RESTORE === "1") {
  for (const t of THEMES) await restore(t);
  await browser.close();
  console.log("restored");
  process.exit(0);
}

for (const theme of THEMES) {
  console.log(`\n-- ${theme}`);
  await restore(theme);

  const before = await read(theme, 1280);
  ok(before.phone > 0, `${theme}: untouched, the header has a phone number`);
  ok(before.search > 0, `${theme}: untouched, the header has a search field`);
  ok(!before.ctaText.some((t) => t.includes(WORDS)), `${theme}: untouched, the button keeps the theme's own words`);

  await openScreen(theme);
  await admin.getByRole("switch", { name: /^Search/ }).first().setChecked(false);
  await admin.getByRole("switch", { name: /^Phone number/ }).first().setChecked(false);
  const row = admin.locator("li", { hasText: "Main button" }).first();
  await row.getByLabel("Words").fill(WORDS);
  await save();

  for (const width of [1280, 360]) {
    const after = await read(theme, width);
    ok(after.phone === 0, `${theme} @${width}: no phone number in the header`);
    ok(after.search === 0, `${theme} @${width}: no search field in the header`);
    // Terminal sets every label lower-case in brackets ("[ book a survey ]"): its idiom, not a different word.
    ok(after.ctaText.some((t) => t.toLowerCase().includes(WORDS.toLowerCase())), `${theme} @${width}: the button says "${WORDS}" (${JSON.stringify(after.ctaText)})`);
    ok(after.over <= 0, `${theme} @${width}: nothing scrolls sideways (${after.over}px${after.over > 0 ? `: ${after.culprits.join(", ")}` : ""})`);
  }

  await restore(theme);
  const back = await read(theme, 1280);
  ok(back.phone > 0 && back.search > 0, `${theme}: restored, the phone number and the search field are back`);
  ok(!back.ctaText.some((t) => t.includes(WORDS)), `${theme}: restored, the button has the theme's own words again`);
}

await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall ok");
process.exit(failed ? 1 : 0);
