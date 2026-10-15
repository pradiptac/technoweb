import { chromium } from "playwright";

/**
 * Measures the console's help drawer (docs/help-and-tours.md).
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/help-drawer.mjs
 *
 * (1) /api/admin/help answers 401 without a session and sections with one.
 * (2) "?" opens the drawer; focus moves into it; /admin/tickets shows "The
 * ticket queue". (3) Search finds a section. (4) A link to another manual
 * section opens in place; Back returns. (5) Escape closes it and focus
 * returns to the button. (6) The "?" key opens it; typed into a field it
 * does not. (7) Nothing logged. Tours are marked seen first, so none starts.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
process.env.BASE = BASE; // shared.mjs signs in on 127.0.0.1 unless told
const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const anon = await browser.newContext();
const r401 = await anon.request.get(`${BASE}/api/admin/help?path=/admin/tickets`);
ok(r401.status() === 401, `help route refuses a visitor without a session (${r401.status()})`);
await anon.close();

const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.addInitScript(() => {
  for (const t of ["dashboard", "tickets", "builder", "media", "settings", "portal"]) localStorage.setItem(`tw_tour:${t}`, "done");
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)); });
const { signInAsStaff } = await import("../shared.mjs");
await signInAsStaff(page);

const api = await page.request.get(`${BASE}/api/admin/help?path=/admin/tickets`);
const body = api.ok() ? await api.json() : null;
ok(Boolean(body?.sections?.length), `help route answers sections for /admin/tickets (${body?.sections?.length ?? 0})`);
const q = await page.request.get(`${BASE}/api/admin/help?q=backup`);
ok(Boolean((q.ok() ? await q.json() : null)?.results?.length), "help route searches");

await page.goto(`${BASE}/admin/tickets`, { waitUntil: "load", timeout: 180000 });
await page.waitForTimeout(1500);
const button = page.getByRole("button", { name: "Help for this screen" });
ok(await button.count() === 1, "the help button is in the top bar");
if (await button.count() === 1) {
  await button.click();
  const drawer = page.locator("dialog[open][data-help-drawer]");
  await drawer.waitFor({ timeout: 30000 }).catch(() => {});
  ok(await drawer.count() === 1, "the drawer opens");
  await drawer.getByRole("heading", { name: /The ticket queue/i }).first().waitFor({ timeout: 30000 }).catch(() => {});
  ok(await page.evaluate(() => Boolean(document.activeElement?.closest("[data-help-drawer]"))), "focus moves into the drawer");
  ok(await drawer.getByRole("heading", { name: /The ticket queue/i }).count() >= 1, "it shows this screen's section");

  await drawer.getByRole("searchbox").fill("backup");
  await drawer.locator("[data-help-result]").first().waitFor({ timeout: 15000 }).catch(() => {});
  ok(await drawer.locator("[data-help-result]").count() >= 1, "search finds sections");
  await drawer.getByRole("searchbox").fill("");
  await page.waitForTimeout(800);

  // "Open the chapter" lists the chapter in place, with Back.
  await drawer.getByRole("button", { name: /^Open the chapter/ }).click();
  await drawer.getByRole("button", { name: "Back" }).waitFor({ timeout: 15000 }).catch(() => {});
  ok(await drawer.locator("section").count() > 2, `Open the chapter lists the chapter (${await drawer.locator("section").count()} sections)`);
  await drawer.getByRole("button", { name: "Back" }).click().catch(() => {});
  await page.waitForTimeout(500);

  // A section that links to another chapter: the link opens in place.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("tw:help", { detail: { section: "04-first-steps#7-staff" } })));
  await drawer.locator("a[data-help-link]").first().waitFor({ timeout: 15000 }).catch(() => {});
  const inner = drawer.locator("a[data-help-link]").first();
  ok(await inner.count() === 1, "tw:help opens a named section");
  if (await inner.count()) {
    const before = await drawer.locator("section h3").first().textContent();
    await inner.click();
    await page.waitForFunction((b) => document.querySelector("[data-help-drawer] section h3")?.textContent !== b, before, { timeout: 15000 }).catch(() => {});
    const after = await drawer.locator("section h3").first().textContent();
    ok(after !== before, `a manual link opens its section in place (${before} → ${after})`);
    await drawer.getByRole("button", { name: "Back" }).click().catch(() => {});
    await page.waitForTimeout(500);
    ok((await drawer.locator("section h3").first().textContent()) === before, "Back returns");
  }

  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  ok(await page.locator("dialog[open][data-help-drawer]").count() === 0, "Escape closes it");
  ok(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Help for this screen"), "focus returns to the help button");
}

await page.locator("main").click({ position: { x: 5, y: 5 } }).catch(() => {});
await page.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur());
await page.keyboard.press("Shift+Slash");
await page.waitForTimeout(800);
ok(await page.locator("dialog[open][data-help-drawer]").count() === 1, "the ? key opens the drawer");
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
const field = page.locator("input[name=q]").first();
if (await field.count()) {
  await field.click();
  await page.keyboard.press("Shift+Slash");
  await page.waitForTimeout(500);
  ok(await page.locator("dialog[open][data-help-drawer]").count() === 0, "typing ? into a field does not open the drawer");
  ok((await field.inputValue()).includes("?"), "the field received the question mark");
}

ok(errors.length === 0, `nothing logged${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await browser.close();
process.exit(failed ? 1 : 0);
