import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * On/off settings as sliding switches (0.135.0, docs/admin-console.md).
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/setting-switch.mjs
 *   SHOTS=<dir> saves Store → Settings at 360, 768, 1280 and 1920.
 *
 * Sign in as a **throwaway administrator**. It saves one setting twice —
 * basket reminders, switched over and then back — so the install ends as it
 * began; if it stops half way, that row is the one to check.
 *
 * What it checks:
 *   - on every settings screen (the paths are read from `settings-copy.ts`,
 *     so a new screen is covered by being declared): no `<select>` whose
 *     choices are exactly 0 and 1, no bare tick box posting a `setting__`
 *     key, and every switch beside a hidden input carrying `1` or `0` that
 *     agrees with it; no horizontal overflow at 360;
 *   - a row the API describes as Off/On shows the sentence for the state it
 *     is in, and the sentence changes when the switch is pressed;
 *   - the thumb **slides**: its computed `translate` is sampled part-way
 *     (reading it on the same tick is the start state, after the transition
 *     the end state, and neither says anything animated);
 *   - Space toggles it from the keyboard and the track shows a focus ring;
 *   - saving stores `1`, the switch still shows on after React's form reset
 *     and after a reload, and saving it back stores `0`;
 *   - a way of paying (the payments tab) is a switch too;
 *   - nothing logged.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const SHOTS = process.env.SHOTS;
const T = 180000;
const KEY = "setting__store_cart_reminders_enabled";

const copy = readFileSync(join(import.meta.dirname, "../../src/app/admin/(app)/settings/settings-copy.ts"), "utf8");
const SCREENS = [...copy.matchAll(/^\s+path: "(\/admin[^"]*)"/gm)].map((m) => m[1]);

const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const { signInAsStaff } = await import("../shared.mjs");

const problems = [];
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()} at ${page.url().replace(BASE, "")}: ${m.text().slice(0, 600)}`); });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`));

const go = async (path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: T });
  await page.waitForSelector("h1", { timeout: T });
  await page.waitForTimeout(1500);
};

await signInAsStaff(page);

ok(SCREENS.length >= 10, `${SCREENS.length} settings screens are declared`);

/* ── Every settings screen ────────────────────────────────────────────── */

let switches = 0;
for (const path of SCREENS) {
  await go(path);
  const found = await page.evaluate(() => {
    const onOff = [...document.querySelectorAll("main select")].filter((s) => {
      const v = [...s.options].map((o) => o.value).sort().join(",");
      return v === "0,1";
    }).map((s) => s.name || s.id);
    const boxes = [...document.querySelectorAll('main input[type="checkbox"]:not([role="switch"])')]
      .filter((b) => (b.name || "").startsWith("setting__")).map((b) => b.name);
    const sw = [...document.querySelectorAll('main input[role="switch"]')];
    const disagree = sw.filter((s) => {
      const hidden = s.closest("label")?.querySelector('input[type="hidden"]');
      return hidden && hidden.value !== (s.checked ? "1" : "0");
    }).map((s) => s.id);
    const untracked = sw.filter((s) => !s.nextElementSibling?.hasAttribute("data-switch")).map((s) => s.id || s.name);
    return { onOff, boxes, count: sw.length, disagree, untracked };
  });
  switches += found.count;
  ok(found.onOff.length === 0, `${path}: no Off/On dropdown${found.onOff.length ? ` — ${found.onOff.join(", ")}` : ""}`);
  ok(found.boxes.length === 0, `${path}: no bare tick box posts a setting${found.boxes.length ? ` — ${found.boxes.join(", ")}` : ""}`);
  ok(found.disagree.length === 0 && found.untracked.length === 0, `${path}: ${found.count} switch(es), each with its track and a hidden value that agrees`);
}
ok(switches >= 40, `${switches} switches across the settings screens`);

/* ── Narrow screens ───────────────────────────────────────────────────── */

await page.setViewportSize({ width: 360, height: 800 });
for (const path of SCREENS) {
  await go(path);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(over <= 0, `${path}: no horizontal overflow at 360${over > 0 ? ` (${over}px)` : ""}`);
}
await page.setViewportSize({ width: 1280, height: 1000 });

/* ── One switch, closely ──────────────────────────────────────────────── */

await go("/admin/store/settings?tab=store_reminders");
const sw = page.locator(`input[role="switch"][id="${KEY}"]`);
ok(await sw.count() === 1, "basket reminders is a switch");
const label = page.locator(`label[for="${KEY}"]`);
const noteOf = async () => (await label.locator("span.text-muted").first().textContent() ?? "").trim();
const hidden = label.locator('input[type="hidden"]');
const was = await sw.isChecked();
const noteBefore = await noteOf();
ok(noteBefore.length > 10, `the note says what the state means: "${noteBefore.slice(0, 60)}…"`);

// The slide, sampled part-way.
const mid = await page.evaluate(async (key) => {
  const input = document.getElementById(key);
  const track = input.nextElementSibling;
  const read = () => getComputedStyle(track, "::after").translate;
  const start = read();
  input.click();
  await new Promise((r) => setTimeout(r, 60));
  const during = read();
  await new Promise((r) => setTimeout(r, 400));
  return { start, during, end: read(), bg: getComputedStyle(track).backgroundColor };
}, KEY);
const px = (v) => (v === "none" ? 0 : parseFloat(v));
ok(px(mid.during) > 0.2 && px(mid.during) < 15.8, `the thumb is caught part-way: ${mid.start} → ${mid.during} → ${mid.end}`);
ok(Math.abs(px(mid.end) - px(mid.start)) > 15, "and ends a full step along");
ok(await sw.isChecked() === !was, "pressing it flips it");
ok(await hidden.inputValue() === (!was ? "1" : "0"), "the hidden value follows");
const noteAfter = await noteOf();
ok(noteAfter !== noteBefore && noteAfter.length > 10, `the note changes with the state: "${noteAfter.slice(0, 60)}…"`);

// Keyboard.
await sw.focus();
await page.keyboard.press("Space");
ok(await sw.isChecked() === was, "Space toggles it back");
await page.keyboard.press("Tab");
await page.keyboard.press("Shift+Tab");
await page.waitForTimeout(300);
const ring = await page.evaluate((key) => {
  const t = document.getElementById(key).nextElementSibling;
  const s = getComputedStyle(t);
  return { style: s.outlineStyle, width: s.outlineWidth };
}, KEY);
ok(ring.style !== "none" && parseFloat(ring.width) >= 2, `focused from the keyboard, the track has a ring (${ring.style} ${ring.width})`);

// Save it switched over, then back.
const save = async () => {
  await page.locator('main form button[type="submit"]').first().click();
  await page.waitForFunction(() => !document.querySelector('main form button[type="submit"][aria-busy="true"]'), null, { timeout: T });
  await page.waitForTimeout(1500);
};
await page.keyboard.press("Space");
ok(await sw.isChecked() === !was, "switched over, ready to save");
await save();
ok(await sw.isChecked() === !was, "after the save the switch still shows what was saved");
await go("/admin/store/settings?tab=store_reminders");
ok(await sw.isChecked() === !was, "and after a reload");
await label.click();
ok(await sw.isChecked() === was, "pressing the label toggles it");
await save();
await go("/admin/store/settings?tab=store_reminders");
ok(await sw.isChecked() === was, "saved back to where it began");

// A way of paying.
await go("/admin/store/settings?tab=payments");
ok(await page.locator('input[role="switch"][id="setting__cod_enabled"]').count() === 1, "cash on delivery is a switch");
ok(await page.locator('select[id="setting__cod_enabled"]').count() === 0, "and not a dropdown");

if (SHOTS) {
  for (const width of [360, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const tab of ["store", "store_reminders", "payments"]) {
      await go(`/admin/store/settings?tab=${tab}`);
      await page.screenshot({ path: join(SHOTS, `switch-${tab}-${width}.png`), fullPage: true, caret: "initial" });
    }
  }
}

ok(problems.length === 0, `nothing logged${problems.length ? `:\n  ${problems.slice(0, 6).join("\n  ")}` : ""}`);

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
