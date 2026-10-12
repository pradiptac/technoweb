import { chromium } from "playwright";

/**
 * Measures the guided tours (docs/help-and-tours.md).
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/tours.mjs
 *
 * (1) The dashboard tour starts on a first visit, not on the second.
 * (2) Next and Back move through its steps; the step count changes.
 * (3) Skip stores it as done. (4) "Take the tour" in the help drawer replays
 * it; Escape ends it. (5) A step whose target is missing is skipped.
 * (6) The tickets tour starts on its screen. (7) Nothing starts at 390px.
 * (8) Nothing logged. (9) Without tw_tour_force an automated browser gets
 * no tour. Leaves every tour marked seen.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
process.env.BASE = BASE; // shared.mjs signs in on 127.0.0.1 unless told
const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
// Tours never start by themselves in an automated browser unless asked.
await context.addInitScript(() => localStorage.setItem("tw_tour_force", "1"));
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)); });
const { signInAsStaff } = await import("../shared.mjs");
await signInAsStaff(page);
const card = page.locator("[data-tour-card]");
const step = () => card.locator("[data-tour-step]").textContent().catch(() => "");
const go = async (p) => { await page.goto(`${BASE}${p}`, { waitUntil: "load", timeout: 180000 }); await page.waitForTimeout(3000); };
const forget = () => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("tw_tour:")).forEach((k) => localStorage.removeItem(k)));

await forget();
await go("/admin");
await card.waitFor({ timeout: 10000 }).catch(() => {});
ok(await card.count() === 1, "the dashboard tour starts on a first visit");
if (await card.count() === 1) {
  const s1 = await step();
  await card.getByRole("button", { name: "Next" }).click();
  await page.waitForTimeout(400);
  const s2 = await step();
  ok(s1 !== s2, `Next moves on (${s1} → ${s2})`);
  await card.getByRole("button", { name: "Back" }).click();
  await page.waitForTimeout(400);
  ok((await step()) === s1, "Back returns");
  await card.getByRole("button", { name: "Skip tour" }).click();
  await page.waitForTimeout(400);
  ok(await card.count() === 0, "Skip closes it");
  ok(await page.evaluate(() => localStorage.getItem("tw_tour:dashboard")) === "done", "Skip stores it as done");
}
await go("/admin");
ok(await card.count() === 0, "it does not start on the second visit");

await page.getByRole("button", { name: "Help for this screen" }).click();
const take = page.getByRole("button", { name: "Take the tour" });
await take.waitFor({ timeout: 20000 }).catch(() => {});
ok(await take.count() === 1, "the help drawer offers the tour");
if (await take.count() === 1) {
  await take.click();
  await card.waitFor({ timeout: 5000 }).catch(() => {});
  ok(await card.count() === 1, "Take the tour replays it");
  const full = await step();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  ok(await card.count() === 0, "Escape ends it");

  // A missing target: hide the palette trigger, replay, and the count drops by one.
  await page.evaluate(() => document.querySelectorAll('[aria-keyshortcuts="Control+K Meta+K"]').forEach((el) => { el.style.display = "none"; }));
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("tw:tour-start", { detail: { id: "dashboard" } })));
  await card.waitFor({ timeout: 5000 }).catch(() => {});
  const fewer = await step();
  const n = (s) => Number((s ?? "").match(/of (\d+)/)?.[1] ?? 0);
  ok(n(fewer) === n(full) - 1, `a missing target is skipped (${full} → ${fewer})`);
  await page.keyboard.press("Escape");
}

await go("/admin/tickets");
await card.waitFor({ timeout: 10000 }).catch(() => {});
ok(await card.count() === 1, "the tickets tour starts on its screen");
await page.keyboard.press("Escape");

await page.setViewportSize({ width: 390, height: 800 });
await page.evaluate(() => localStorage.removeItem("tw_tour:dashboard"));
await go("/admin");
ok(await card.count() === 0, "nothing starts at 390px");

await page.evaluate(() => ["dashboard", "tickets", "builder", "media", "settings", "portal"].forEach((t) => localStorage.setItem(`tw_tour:${t}`, "done")));

// Last, because a second sign-in ends the first session: a fresh browser
// with no tours seen and no tw_tour_force gets none laid over the screen.
const plain = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const p2 = await plain.newPage();
await signInAsStaff(p2);
await p2.goto(`${BASE}/admin`, { waitUntil: "load", timeout: 180000 });
await p2.waitForTimeout(7000);
ok(await p2.locator("[data-tour-card]").count() === 0, "an automated browser without tw_tour_force gets no tour");
await plain.close();
ok(errors.length === 0, `nothing logged${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await browser.close();
process.exit(failed ? 1 : 0);
