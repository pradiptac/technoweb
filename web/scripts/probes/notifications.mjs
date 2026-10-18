import { chromium } from "playwright";

/**
 * The Notifications card on Your account (0.185.0, docs/digest-alerts.md).
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/notifications.mjs
 *
 * Sign in as a **throwaway administrator**: it saves that account's own
 * digest choices twice (changed, then put back).
 *
 * What it checks:
 *   - the card is drawn under a "Notifications" heading;
 *   - "Skip a day when everything is zero" and the digest hour are saved and
 *     survive React's form reset and a reload;
 *   - with browser push not set up, "Get alerts in this browser" is absent
 *     and the "not set up" line is present;
 *   - nothing logged.
 * It **never** presses "Send me today's digest" or "Send a test alert".
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const T = 180000;

const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const { signInAsStaff } = await import("../shared.mjs");

const problems = [];
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text().slice(0, 400)}`); });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`));

const open = async () => {
  await page.goto(`${BASE}/admin/profile`, { waitUntil: "load", timeout: T });
  await page.getByRole("heading", { name: "Notifications" }).waitFor({ timeout: T });
  await page.waitForTimeout(1200);
};
const skip = () => page.locator('input[type="checkbox"][name="digest_skip_quiet"]');
const hour = () => page.locator('select[name="digest_hour"]');
const save = async () => {
  await page.getByRole("button", { name: "Save notification settings" }).click();
  await page.getByText("Your notification settings are saved.").waitFor({ timeout: T });
};

try {
  await signInAsStaff(page);
  await open();
  ok(true, "the Notifications card is drawn");

  const wasSkip = await skip().isChecked();
  const wasHour = await hour().inputValue();
  const newHour = wasHour === "9" ? "10" : "9";

  await skip().setChecked(!wasSkip, { force: true });
  await hour().selectOption(newHour);
  await save();
  ok(await skip().isChecked() === !wasSkip, "the switch still reads as saved after the form reset");
  ok(await hour().inputValue() === newHour, "the hour still reads as saved after the form reset");

  await open();
  ok(await skip().isChecked() === !wasSkip, "the switch survives a reload");
  ok(await hour().inputValue() === newHour, "the hour survives a reload");

  ok(await page.getByRole("button", { name: "Get alerts in this browser" }).count() === 0, "no subscribe button while push is not set up");
  ok(await page.getByText("Browser notifications are not set up on this site.").count() === 1, "the not-set-up line is shown");

  // Put it back.
  await skip().setChecked(wasSkip, { force: true });
  await hour().selectOption(wasHour);
  await save();
} catch (e) {
  ok(false, `probe stopped: ${e.message}`);
}

ok(problems.length === 0, `nothing logged${problems.length ? `:\n  ${problems.join("\n  ")}` : ""}`);
await browser.close();
process.exit(failed ? 1 : 0);
