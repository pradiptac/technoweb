import { chromium } from "playwright";

/**
 * Measures the media CDN setting and the CDN card on System → Status
 * (0.124.0, docs/cdn.md), through the real Media settings form.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/media-cdn.mjs
 *   RESTORE=1 only switches the CDN off and clears its address.
 *
 * There is no CDN on a development machine, so one is stood in: the address
 * saved is `https://cdn.example.com`, and the browser's requests to it are
 * answered from the API's own `/storage` — which is exactly what a pull zone
 * does. Checks: (1) switched on, a vector logo on the homepage is addressed
 * at the CDN, and no photograph is — every `/_next/image` still names the
 * API as its upstream; (2) the Report-Only policy names the CDN (the proxy
 * learns it within a minute) and the page reports no violation for it; (3)
 * "Test the CDN" reports its outcome in a notice that stays on screen; (4)
 * switched off, the very next load addresses nothing at the CDN — the save
 * purges every cached page; (5) System → Status says no CDN is in front,
 * and, sent Cloudflare's header, says the visitor-address setting is
 * missing. Carries no credential; saves one settings tab — a development
 * database only — and always switches it off again.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const API = process.env.API_ORIGIN ?? "http://127.0.0.1:8000";
const CDN = "https://cdn.example.com";
const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const { signInAsStaff } = await import("../shared.mjs");
const staff = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const admin = await staff.newPage();
await signInAsStaff(admin);

async function cdn(on) {
  await admin.goto(`${BASE}/admin/media/settings?tab=media_cdn`, { waitUntil: "load", timeout: 180000 });
  await admin.waitForSelector("#setting__media_cdn_enabled", { state: "visible", timeout: 60000 });
  await admin.fill("#setting__media_cdn_url", on ? CDN : "");
  await admin.locator("#setting__media_cdn_enabled").setChecked(on);
  await admin.getByRole("button", { name: /Save media settings/ }).click();
  await admin.waitForTimeout(5000);
}

/** An anonymous visitor whose requests to the stand-in CDN are served from the API's storage. */
async function visit(path) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.effectiveDirective} ${e.blockedURI}`));
  });
  const page = await context.newPage();
  // What the stand-in CDN answered: a lazy picture below the fold is never asked for, so it is the answers that are counted.
  const answers = { ok: 0, bad: 0 };
  page.on("response", (r) => {
    if (!r.url().startsWith(CDN)) return;
    if (r.status() < 400) answers.ok++;
    else answers.bad++;
  });
  page.on("requestfailed", (r) => { if (r.url().startsWith(CDN)) answers.bad++; });
  await page.route(`${CDN}/**`, async (route) => {
    const url = new URL(route.request().url());
    const upstream = await fetch(`${API}${url.pathname}${url.search}`);
    await route.fulfill({ status: upstream.status, contentType: upstream.headers.get("content-type") ?? undefined, body: Buffer.from(await upstream.arrayBuffer()) });
  });
  const response = await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 180000 });
  await page.waitForTimeout(2500);
  const read = await page.evaluate((cdnOrigin) => {
    const imgs = [...document.querySelectorAll(".public-site img")].map((img) => img.currentSrc || img.src);
    const upstreams = imgs.filter((s) => s.includes("/_next/image")).map((s) => new URL(s).searchParams.get("url") ?? "");
    return {
      atCdn: imgs.filter((s) => s.startsWith(cdnOrigin)),
      optimisedThroughCdn: upstreams.filter((u) => u.startsWith(cdnOrigin)).length,
      optimised: upstreams.length,
      csp: window.__csp.filter((v) => v.includes("cdn.example.com")),
    };
  }, CDN);
  const policy = response?.headers()["content-security-policy-report-only"] ?? "";
  await context.close();
  return { ...read, policy, answers };
}

async function restore() {
  await cdn(false);
}

if (process.env.RESTORE === "1") {
  await restore();
  await browser.close();
  console.log("restored");
  process.exit(0);
}

try {
  await cdn(true);

  // The proxy's copy of the address is up to a minute old; wait for the policy to name it.
  let seen = await visit("/");
  for (let waited = 0; waited < 90 && !seen.policy.includes("cdn.example.com"); waited += 6) {
    await new Promise((r) => setTimeout(r, 6000));
    seen = await visit("/");
  }

  ok(seen.atCdn.length >= 1 && seen.atCdn.every((s) => /\.svg(\?|$)/.test(s)), `switched on, ${seen.atCdn.length} vector picture(s) on the homepage are addressed at the CDN`);
  ok(seen.answers.ok >= 1 && seen.answers.bad === 0, `and every one the browser asked it for was served (${seen.answers.ok} served, ${seen.answers.bad} failed)`);
  ok(seen.optimised >= 1 && seen.optimisedThroughCdn === 0, `no photograph is: ${seen.optimised} optimised picture(s), none with the CDN as its upstream`);
  ok(seen.policy.includes("cdn.example.com"), "the Report-Only policy names the CDN");
  ok(seen.csp.length === 0, `and the page reports no violation for it (${seen.csp.length})`);

  // "Test the CDN": the stand-in is not a real pull zone, so the outcome is a refusal — what matters is that it is said, and stays.
  await admin.goto(`${BASE}/admin/media/settings?tab=media_cdn`, { waitUntil: "load", timeout: 180000 });
  await admin.getByRole("button", { name: "Test the CDN" }).click();
  const told = await admin.waitForSelector("text=/The CDN (did not serve the file|is working)/", { timeout: 60000 }).then(() => true, () => false);
  await admin.waitForTimeout(12000);
  const stays = await admin.locator("text=/The CDN (did not serve the file|is working)/").count();
  ok(told && stays === 1, "Test the CDN says what happened, and the notice is still there twelve seconds later");

  await cdn(false);
  const off = await visit("/");
  ok(off.atCdn.length === 0, `switched off, the next load addresses nothing at the CDN (${off.atCdn.length})`);

  // System → Status.
  await admin.goto(`${BASE}/admin/system/status`, { waitUntil: "load", timeout: 180000 });
  ok(/None in front of the website/.test(await admin.locator("[data-cdn-status]").innerText()), "System status says no CDN is in front of the website");
  const edge = await staff.newPage();
  await edge.setExtraHTTPHeaders({ "cf-ray": "probe-0000" });
  await edge.goto(`${BASE}/admin/system/status`, { waitUntil: "load", timeout: 180000 });
  const card = await edge.locator("section", { has: edge.locator("[data-cdn-status]") }).innerText();
  ok(/Behind Cloudflare/.test(card) && /CLIENT_IP_HEADER=cf-connecting-ip/.test(card), "and, sent Cloudflare's header, that the visitor-address setting is missing");
  await edge.close();
} finally {
  await restore().catch((e) => { console.log(`FAIL could not restore: ${e.message}`); failed++; });
}

await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
