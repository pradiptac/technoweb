import { chromium } from "playwright";

/**
 * Measures the popup's exit-intent trigger (`components/layout/site-popup.tsx`,
 * `App\Enums\PopupTrigger`, the "What opens it" select on the popup form).
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/popup-exit.mjs
 *
 * Creates a published popup targeting `/about` alone with `trigger: exit`
 * through the API — one page nothing else is likely to target, because only
 * the first matching popup ever opens and a real one on `/` would hide it —
 * then: (1) the console form reads the stored trigger and the delay's hint
 * says what the wait does on a phone; (2) saving through the real form keeps
 * it; (3) on a fine-pointer context the delay does NOT open it, a `mouseleave`
 * through the side does not, and one through the top edge (`clientY <= 0`)
 * does, and — closed with Escape — a second exit does not reopen it; (4) a touch context (no hover, coarse pointer) opens it after the
 * delay instead. The popup is deleted afterwards whatever happens. Needs the
 * real API and a signed-in staff account — the mock has no popup CRUD.
 *
 * Two things it learned: signing in again revokes the previous "admin"
 * token, so the API token is minted after the browser has signed in and
 * again before the cleanup; and the listener is attached by an effect, so a
 * dev server has to finish hydrating (`html[data-aos-ready]`) before the
 * synthetic `mouseleave` means anything.
 */
import { BASE, signInAsStaff } from "../shared.mjs";
const API = process.env.API_BASE ?? "http://127.0.0.1:8000/api/v1";
const EMAIL = process.env.ADMIN_LOGIN_EMAIL, PASSWORD = process.env.ADMIN_LOGIN_PASSWORD;
const j = (r) => r.json();
// Signing in again revokes the previous "admin" token, so the API token is
// minted after the browser has signed in and minted again before the cleanup.
const apiLogin = async () => { const l = await fetch(`${API}/admin/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) }).then(j); return { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${l.token}` }; };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("pageerror:", e.message));
let H = await apiLogin();
const created = await fetch(`${API}/admin/popups`, { method: "POST", headers: H, body: JSON.stringify({ name: "Exit probe", body: "<p>Exit probe body</p>", paths: ["/about"], status: "published", trigger: "exit", delay_ms: 800, frequency: "every" }) }).then(j);
const id = created.data.id;
console.log("created popup", id, "trigger", created.data.trigger);
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
try {
  await signInAsStaff(page);
  await page.goto(`${BASE}/admin/popups/${id}`, { waitUntil: "load", timeout: 120000 });
  const sel = page.locator("#trigger");
  await sel.waitFor({ timeout: 30000 });
  ok((await sel.inputValue()) === "exit", "the form reads the stored trigger");
  ok((await page.locator("#delay_ms-hint").innerText()).includes("phone"), "the delay hint says what the wait does on a phone");
  // The browser's session token is the live one now; the form's save must use it.
  await page.getByRole("button", { name: "Save popup" }).click();
  await page.waitForTimeout(3000);
  H = await apiLogin();
  const stored = await fetch(`${API}/admin/popups/${id}`, { headers: H }).then(j);
  ok(stored.data.trigger === "exit", "saving the form keeps trigger=exit");

  // Public, fine pointer: nothing after the delay; the pointer leaving through the top opens it.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pub = await ctx.newPage();
  await pub.goto(`${BASE}/about`, { waitUntil: "domcontentloaded", timeout: 120000 });
  // Hydration on a dev server can take seconds; the listener is attached by an effect.
  await pub.waitForSelector("html[data-aos-ready]", { timeout: 30000 });
  await pub.waitForTimeout(3000);
  const mine = pub.locator('dialog[open]:has-text("Exit probe body")');
  ok((await mine.count()) === 0, "fine pointer: the delay does not open it");
  await pub.mouse.move(600, 400);
  await pub.mouse.move(600, 200);
  await pub.evaluate(() => document.documentElement.dispatchEvent(new MouseEvent("mouseleave", { clientY: 300 })));
  await pub.waitForTimeout(300);
  ok((await mine.count()) === 0, "leaving through the side does not open it");
  await pub.evaluate(() => document.documentElement.dispatchEvent(new MouseEvent("mouseleave", { clientY: -2 })));
  await mine.waitFor({ timeout: 5000 }).catch(() => {});
  ok((await mine.count()) === 1, "leaving through the top opens it");
  // Closed, it must stay closed: a second exit is not a second visit.
  await pub.keyboard.press("Escape");
  await pub.waitForTimeout(400);
  ok((await mine.count()) === 0, "Escape closes it");
  await pub.evaluate(() => document.documentElement.dispatchEvent(new MouseEvent("mouseleave", { clientY: -2 })));
  await pub.waitForTimeout(1500);
  ok((await mine.count()) === 0, "a second exit does not reopen it");
  await ctx.close();

  // Touch: no pointer, so the delay opens it.
  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const tp = await touch.newPage();
  await tp.goto(`${BASE}/about`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const tm = tp.locator('dialog[open]:has-text("Exit probe body")');
  await tm.waitFor({ timeout: 10000 }).catch(() => {});
  ok((await tm.count()) === 1, "touch: the delay opens it instead");
  await touch.close();
} finally {
  await browser.close();
  H = await apiLogin();
  const del = await fetch(`${API}/admin/popups/${id}`, { method: "DELETE", headers: H });
  console.log("deleted popup", id, del.status);
  await fetch(`${API}/admin/auth/logout`, { method: "POST", headers: H });
}
console.log(failed ? `${failed} failed` : "All checks passed");
process.exit(failed ? 1 : 0);
