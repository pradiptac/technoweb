import { chromium } from "playwright";

/**
 * System → Status, "Speed" (docs/distribution.md "Speed suggestions"), through
 * the real screen.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/speed-status.mjs
 *   BASE=http://localhost:3000 node …   picks the site; the default is the shared one.
 *
 * Opens `/admin/system/status#speed` signed in as staff and checks, at 1280
 * and 360:
 *   - the Speed card is there under an `h2`, with the page still holding one
 *     `h1`, and the `#speed` anchor exists;
 *   - the summary line's arithmetic: "N of T checks are good — A need
 *     attention, U could not be checked" against the rows actually drawn, state
 *     by state, and the three measured figures are there;
 *   - every Needs-attention row carries a "What to do" sentence;
 *   - a row's snippet is in a scroll box of its own and its Copy button puts
 *     exactly that text on the clipboard (1280 only: the clipboard is the
 *     browser's, not the width's);
 *   - no sideways scroll, and the card no wider than the screen;
 *   - nothing logged to the console.
 *
 * Then the command palette: Ctrl+K and "slow" offers "Speed suggestions".
 *
 * Read-only: it changes nothing, and carries no credential.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const T = 180000;

// The helper signs in on its own default origin (127.0.0.1); a cookie set
// there is not sent to localhost, so both must use one.
process.env.BASE = BASE;
const { signInAsStaff } = await import("../shared.mjs");

const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const note = (l) => console.log(`skip ${l}`);

const problems = [];
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"] });
const page = await context.newPage();
page.on("console", (m) => {
  if (m.type() !== "error" && m.type() !== "warning") return;
  // Dev only (CLAUDE.md, "How the audits behave"): a lazy chunk outliving Chrome's preload grace period.
  if (m.text().includes("was preloaded using link preload but not used")) return;
  problems.push(`${m.type()} at ${page.url().replace(BASE, "")}: ${m.text().slice(0, 400)}`);
});
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`));

const settle = async () => { await page.waitForLoadState("load", { timeout: T }); await page.waitForTimeout(1500); };

try {
  await signInAsStaff(page);

  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${BASE}/admin/system/status#speed`, { waitUntil: "load", timeout: T });
    await page.waitForSelector("h1", { timeout: T });
    await settle();
    const at = (l) => `@${width}: ${l}`;

    ok((await page.locator("h1").count()) === 1, at("the page still has exactly one h1"));
    const card = page.locator("section", { has: page.locator("h2#speed") });
    ok((await card.count()) === 1, at("the Speed card is there"));
    ok((await page.locator("#speed").evaluate((e) => e.tagName)) === "H2", at("the #speed anchor is the card's h2"));

    // The summary line against the rows.
    const line = (await page.locator("[data-speed-summary] .font-semibold").first().innerText()).replace(/\s+/g, " ");
    const rows = await page.locator("[data-speed-check]").evaluateAll((els) => els.map((e) => e.getAttribute("data-state")));
    const count = (s) => rows.filter((r) => r === s).length;
    const m = line.match(/^(\d+) of (\d+) checks are good(?: — (\d+) needs? attention)?(?: — (\d+) could not be checked)?$/);
    ok(Boolean(m), at(`the summary line reads as expected ("${line}")`));
    if (m) {
      const [good, total, attention, unknown] = [m[1], m[2], m[3] ?? 0, m[4] ?? 0].map(Number);
      ok(good === count("good"), at(`good: line says ${good}, ${count("good")} rows drawn`));
      ok(attention === count("attention"), at(`attention: line says ${attention}, ${count("attention")} rows drawn`));
      ok(unknown === count("unknown"), at(`could not check: line says ${unknown}, ${count("unknown")} rows drawn`));
      ok(total === good + attention + unknown, at(`the total ${total} is the three added up`));
    }
    ok(rows.length >= 10, at(`a real server is checked on at least ten things (${rows.length})`));

    // The three measured figures.
    const tiles = await page.locator("[data-speed-measured] > *").count();
    ok(tiles === 3, at(`three measured figures (${tiles})`));

    // Every row that needs attention says what to do.
    const bare = await page.locator('[data-speed-check][data-state="attention"]')
      .evaluateAll((els) => els.filter((e) => !(e.querySelector("[data-speed-fix]")?.textContent ?? "").replace("What to do:", "").trim()).map((e) => e.getAttribute("data-speed-check")));
    ok(bare.length === 0, at(`every attention row has a fix sentence${bare.length ? ` (missing: ${bare.join(", ")})` : ""}`));

    // A snippet scrolls inside its own box.
    const snippet = page.locator("[data-speed-snippet]").first();
    if ((await snippet.count()) === 0) {
      note(at("no row carries a snippet on this install"));
    } else {
      await snippet.scrollIntoViewIfNeeded();
      const box = await snippet.locator("pre").evaluate((pre) => ({ client: pre.clientWidth, scroll: pre.scrollWidth, overflowX: getComputedStyle(pre).overflowX }));
      ok(box.overflowX === "auto", at(`a snippet is its own scroll box (${box.overflowX})`));

      if (width === 1280) {
        const text = (await snippet.locator("code").innerText()).trim();
        await snippet.getByRole("button", { name: /^Copy$/ }).click();
        await page.waitForTimeout(400);
        const copied = (await page.evaluate(() => navigator.clipboard.readText())).trim();
        ok(copied === text, at(`Copy puts the snippet on the clipboard ("${text.slice(0, 40)}")`));
        ok((await snippet.getByRole("status").innerText().catch(() => "")).includes("copied"), at("…and says so in a live region"));
      }
    }

    // No sideways scroll, and the card fits.
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(over <= 0, at(`no horizontal overflow (${over}px)`));
    const cardRight = await card.evaluate((e) => e.getBoundingClientRect().right);
    ok(cardRight <= width + 0.5, at(`the card ends inside the screen (${Math.round(cardRight)}px)`));
  }

  // The command palette finds it.
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(`${BASE}/admin`, { waitUntil: "load", timeout: T });
  await settle();
  await page.keyboard.press("Control+K");
  await page.keyboard.type("slow");
  await page.waitForTimeout(600);
  ok((await page.getByText("Speed suggestions").count()) > 0, "Ctrl+K and “slow” offers Speed suggestions");

  ok(problems.length === 0, `nothing logged (${problems.length})`);
  for (const line of problems.slice(0, 10)) console.log(`     ${line}`);
} finally {
  await browser.close();
}

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log("\nall checks passed");
