import { chromium } from "playwright";

/**
 * The "AI Powered" badge in the console's version chip (0.169.0,
 * docs/console-portal.md).
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/ai-badge.mjs
 *
 * (1) The badge is drawn from `sm` and (2) not below it. (3) Its sweep is
 * running shortly after load (sampled mid-flight, not read from a class) and
 * (4) does not run under reduced motion. (5) Its words are gradient ink.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
process.env.BASE = BASE;
const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const { signInAsStaff } = await import("../shared.mjs");

const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
await signInAsStaff(page);

const sweep = () => page.evaluate(() => {
  const el = document.querySelector("[data-ai-badge]");
  if (!el) return null;
  const run = el.getAnimations({ subtree: true }).find((a) => a.animationName === "ai-sweep" || a.animationName === "ai-sweep-again");
  return run ? { state: run.playState, t: Number(run.currentTime) } : "none";
});

await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded", timeout: 180000 });
await page.locator("[data-ai-badge]").waitFor({ timeout: 120000 });
ok(await page.locator("[data-ai-badge]").isVisible(), "the badge is drawn at 1280");
ok((await page.locator("[data-ai-badge]").textContent())?.includes("AI Powered"), "it says AI Powered");
const fill = await page.locator(".ai-badge-text").evaluate((e) => getComputedStyle(e).webkitTextFillColor);
ok(/rgba?\(0, 0, 0, 0\)|transparent/.test(fill), "its words are gradient ink");

await page.reload({ waitUntil: "domcontentloaded" });
await page.locator("[data-ai-badge]").waitFor({ timeout: 120000 });
let seen = null;
for (let i = 0; i < 40 && !(seen && typeof seen === "object" && seen.state === "running" && seen.t > 0); i++) {
  seen = await sweep();
  await page.waitForTimeout(100);
}
ok(seen && typeof seen === "object" && seen.state === "running", `the sweep runs after load (${JSON.stringify(seen)})`);

await page.setViewportSize({ width: 390, height: 800 });
await page.waitForTimeout(300);
ok(!(await page.locator("[data-ai-badge]").isVisible()), "not drawn at 390");

const reduced = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce", storageState: await context.storageState() });
const p2 = await reduced.newPage();
await p2.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded", timeout: 180000 });
await p2.locator("[data-ai-badge]").waitFor({ timeout: 120000 });
await p2.waitForTimeout(1200);
const still = await p2.evaluate(() => document.querySelector("[data-ai-badge]")?.getAnimations({ subtree: true }).length ?? -1);
ok(still === 0, `no sweep under reduced motion (${still} running)`);

await browser.close();
process.exit(failed ? 1 : 0);
