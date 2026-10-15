import { chromium } from "playwright";
import { join } from "node:path";

/**
 * "Continue with Google" for customers (0.133.0, docs/auth.md "Signing in
 * with Google"), as far as it can be driven without a Google account.
 *
 *   node scripts/probes/google-signin.mjs
 *   SHOTS=<dir> saves the sign-in and registration screens at 360 and 1280.
 *
 * **It needs the feature switched on with a client saved** (System →
 * Settings → Sign-in; any client ID of the right shape will do) — with it
 * off the button is not drawn and this exits 2, saying so. It signs nobody
 * in and never reaches Google: the redirect to `accounts.google.com` is read
 * and not followed.
 *
 * What it checks:
 *   - the button is on the sign-in screen and on the registration screen,
 *     and is a plain `<a>` — loading either screen asks the handler nothing
 *     (a `next/link` would prefetch it, minting an attempt per render);
 *   - following it sends the browser to Google with this site's own callback
 *     address, the `openid email profile` scope, a state and a nonce, and
 *     leaves an httpOnly cookie scoped to the two handlers;
 *   - a callback that cannot be believed ends on the sign-in form with a
 *     notice: cancelled at Google, a made-up code and state, and a callback
 *     arriving in a browser that never started one;
 *   - the notice is a lookup: `?google=` with anything else draws nothing;
 *   - one `h1`, no horizontal overflow at 360, nothing logged.
 *
 * Carries no credential and changes nothing.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const SHOTS = process.env.SHOTS;
const T = 180000;

const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const problems = [];
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()} at ${page.url().replace(BASE, "")}: ${m.text().slice(0, 600)}`); });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`));

// Every request to the first handler, so a prefetch would show.
const handlerHits = [];
page.on("request", (r) => { if (new URL(r.url()).pathname === "/portal/auth/google") handlerHits.push(r.url()); });

const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/* ---- The sign-in screen ---- */

await page.goto(`${BASE}/portal/login`, { waitUntil: "networkidle", timeout: T });
const button = page.locator("[data-google-signin] a");

if (await button.count() === 0) {
  console.error("The Google button is not drawn: switch it on and save a client under System → Settings → Sign-in, then run this again.");
  await browser.close();
  process.exit(2);
}

ok(await page.locator("h1").count() === 1, "one h1 on the sign-in screen");
ok((await button.innerText()).trim() === "Continue with Google", "the button reads Continue with Google");
ok((await button.getAttribute("href")) === "/portal/auth/google", "it is a plain link to the site's own handler");
ok(handlerHits.length === 0, "loading the screen asked the handler nothing (no prefetch)");

await page.setViewportSize({ width: 360, height: 800 });
await page.waitForTimeout(300);
ok(await overflow() <= 0, "no horizontal overflow on the sign-in screen at 360");
if (SHOTS) await page.screenshot({ path: join(SHOTS, "google-login-360.png"), fullPage: true, caret: "initial" });
await page.setViewportSize({ width: 1280, height: 900 });
await page.waitForTimeout(200);
if (SHOTS) await page.screenshot({ path: join(SHOTS, "google-login-1280.png"), fullPage: true, caret: "initial" });

/* ---- Following it ---- */

// The link is followed with the context's own request client and the
// redirect is *read*, not followed: a route handler cannot intercept a
// redirect's target, and this probe has no business loading Google. The
// client shares the context's cookie jar, so the cookie lands where a
// press would put it.
const start = () => context.request.get(`${BASE}/portal/auth/google`, { maxRedirects: 0 });
const started = await start();
const location = started.headers().location ?? "";
const consent = location.startsWith("https://accounts.google.com/") ? new URL(location) : null;

ok(started.status() === 303 && consent !== null, `following the button answers a redirect to accounts.google.com (${started.status()})`);
if (consent) {
  const q = consent.searchParams;
  ok(consent.pathname === "/o/oauth2/v2/auth", "…to its consent screen");
  ok(/\.apps\.googleusercontent\.com$/.test(q.get("client_id") ?? ""), "…with the saved client ID");
  ok(q.get("redirect_uri") === `${BASE}/portal/auth/google/callback`, `…and this site's own callback (${q.get("redirect_uri")})`);
  ok(q.get("response_type") === "code" && q.get("scope") === "openid email profile", "…asking for a code and the openid, email and profile scopes");
  ok((q.get("state") ?? "").length === 48 && (q.get("nonce") ?? "").length >= 16, "…with a state and a nonce");
}

const cookie = (await context.cookies(`${BASE}/portal/auth/google`)).find((c) => c.name === "tw_google_signin");
ok(Boolean(cookie), "a cookie binds the attempt to this browser");
ok(cookie?.httpOnly === true && cookie?.path === "/portal/auth/google" && cookie?.sameSite === "Lax", "…httpOnly, lax, and scoped to the two handlers");
ok((await context.cookies(BASE)).every((c) => c.name !== "tw_session"), "nobody is signed in yet");

/* ---- Callbacks that cannot be believed ---- */

const lands = async (path, title, label) => {
  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: T });
  await page.waitForSelector("#email", { timeout: T });
  const url = new URL(page.url());
  ok(url.pathname === "/portal/login" && await page.getByText(title, { exact: true }).count() === 1, label);
};

await lands("/portal/auth/google/callback?error=access_denied&state=x", "Google sign-in was cancelled", "cancelling at Google lands on the form with a notice");

// The cancel retired the cookie, so start again for one that carries it.
await start();
await lands("/portal/auth/google/callback?code=made-up&state=made-up", "That sign-in attempt expired", "a made-up code and state are refused");
ok((await context.cookies(BASE)).every((c) => c.name !== "tw_session"), "…and no session was made");

const stranger = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const other = await stranger.newPage();
await other.goto(`${BASE}/portal/auth/google/callback?code=x&state=${consent?.searchParams.get("state") ?? "y"}`, { waitUntil: "load", timeout: T });
ok(new URL(other.url()).search === "?google=expired", "a callback in a browser that never started one is refused");
await stranger.close();

await page.goto(`${BASE}/portal/login?google=${encodeURIComponent("<b>you won</b>")}`, { waitUntil: "load", timeout: T });
await page.waitForSelector("#email", { timeout: T });
ok(await page.getByText("you won").count() === 0 && await page.locator("[role=alert], [role=status]").filter({ hasText: /Google/ }).count() === 0, "an unknown notice key draws nothing");

/* ---- The registration screen ---- */

const registration = await page.goto(`${BASE}/portal/register`, { waitUntil: "load", timeout: T });
if (registration?.status() === 404) {
  console.log("skip the registration screen: registration is closed on this install");
} else {
  const signUp = page.locator("[data-google-signin] a");
  ok(await signUp.count() === 1 && (await signUp.innerText()).trim() === "Sign up with Google", "the registration screen offers Sign up with Google");
  ok(await page.locator("h1").count() === 1, "one h1 on the registration screen");
  await page.setViewportSize({ width: 360, height: 800 });
  await page.waitForTimeout(300);
  ok(await overflow() <= 0, "no horizontal overflow on the registration screen at 360");
  if (SHOTS) await page.screenshot({ path: join(SHOTS, "google-register-360.png"), fullPage: true, caret: "initial" });
}

ok(problems.length === 0, `nothing logged an error or a warning (${problems.length})`);
problems.forEach((p) => console.log(`     ${p}`));

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
