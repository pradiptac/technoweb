import { chromium } from "playwright";

/**
 * Measures the installable website (docs/pwa.md).
 *
 *   node scripts/probes/pwa.mjs              against `npm run start`
 *   PWA_IN_DEV=1 npm run dev, then the same  against a dev server
 *   SHOTS=<dir> saves the install card at 360 and 1280 and the offline page.
 *
 * Checks: (1) the manifest is linked, parses, and names 192/512 and a
 * maskable icon that answer as PNGs; (2) `/sw.js?pwa=1` registers at scope
 * "/" and controls the page after a reload; (3) offline, a page already
 * opened is served from the cache and one never opened gets the offline
 * page; (4) `/admin` is never answered by the worker; (5) the install card
 * appears from the second page once the browser offers an install, never at
 * the first, keeps clear of the assistant's launcher, causes no horizontal
 * scroll at 360px, and stays dismissed. Carries no credential.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const SHOTS = process.env.SHOTS;
const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 180000 });

// (1) manifest
const href = await page.locator('link[rel="manifest"]').getAttribute("href");
ok(Boolean(href), `manifest linked (${href})`);
const manifest = await (await page.request.get(new URL(href, BASE).href)).json();
ok(manifest.display === "standalone" && manifest.start_url.startsWith("/"), "manifest is standalone with a start URL");
for (const icon of manifest.icons) {
  const res = await page.request.get(new URL(icon.src, BASE).href);
  ok(res.ok() && res.headers()["content-type"].includes("image/png"), `icon ${icon.sizes} ${icon.purpose} is a PNG`);
}
ok(manifest.icons.some((i) => i.purpose === "maskable"), "a maskable icon is offered");
ok(await page.locator('link[rel="apple-touch-icon"]').count() > 0, "Apple touch icon linked");

// (2) worker
const scope = await page.evaluate(async () => {
  for (let i = 0; i < 240; i++) {
    const reg = await navigator.serviceWorker.getRegistration("/");
    if (reg?.active) return { scope: reg.scope, script: reg.active.scriptURL };
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
});
ok(scope && scope.script.includes("/sw.js?pwa=1"), `worker registered: ${scope?.script ?? "none"}`);
await page.reload({ waitUntil: "load" });
ok(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), "worker controls the page after a reload");

// visit a second page while online, so it is cached
await page.goto(`${BASE}/about`, { waitUntil: "load", timeout: 180000 });

// (3) offline
await ctx.setOffline(true);
await page.goto(`${BASE}/about`, { waitUntil: "load" }).catch(() => undefined);
ok((await page.locator("h1").first().innerText().catch(() => "")).length > 0 && !(await page.content()).includes("You are offline"), "an opened page is served offline");
await page.goto(`${BASE}/careers?never=${Date.now()}`, { waitUntil: "load" }).catch(() => undefined);
ok((await page.locator("h1").first().innerText().catch(() => "")).includes("You are offline"), "an unopened page gets the offline page");
if (SHOTS) await page.screenshot({ path: `${SHOTS}/pwa-offline.png` });
await ctx.setOffline(false);

// (4) console untouched
const viaWorker = await page.evaluate(async (base) => {
  const res = await fetch(`${base}/admin/login`, { redirect: "manual" });
  return performance.getEntriesByName(`${base}/admin/login`).pop()?.deliveryType ?? res.type;
}, BASE);
ok(viaWorker !== "cache-storage", `the console is not answered from a cache (${viaWorker})`);

// (5) install card, at a phone and at a desktop
for (const [w, h] of [[360, 760], [1280, 900]]) {
  const c = await browser.newContext({ viewport: { width: w, height: h } });
  await c.addInitScript(() => {
    // Headless Chromium never offers an install; stand one in, as Chrome would.
    window.addEventListener("load", () => setTimeout(() => {
      const e = new Event("beforeinstallprompt");
      e.prompt = async () => undefined;
      e.userChoice = Promise.resolve({ outcome: "dismissed" });
      window.dispatchEvent(e);
    }, 2500));
  });
  const p = await c.newPage();
  await p.goto(`${BASE}/`, { waitUntil: "load", timeout: 180000 });
  await p.waitForTimeout(6000);
  ok(await p.locator("[data-install-prompt]").count() === 0, `${w}px: no card on the first page`);
  await p.locator('a[href="/about"]').first().click().catch(() => p.goto(`${BASE}/about`));
  await p.waitForURL(/\/about/, { timeout: 120000 }).catch(() => undefined);
  const card = p.locator("[data-install-prompt]");
  await card.waitFor({ timeout: 30000 }).catch(() => undefined);
  ok(await card.isVisible(), `${w}px: card appears on the second page`);
  if (await card.isVisible()) {
    const cb = await card.boundingBox();
    const launcher = p.locator(".assistant-launcher").first();
    if (await launcher.count()) {
      const lb = await launcher.boundingBox();
      const overlap = lb && !(cb.x + cb.width <= lb.x || lb.x + lb.width <= cb.x || cb.y + cb.height <= lb.y || lb.y + lb.height <= cb.y);
      ok(!overlap, `${w}px: card clear of the assistant's launcher`);
    }
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(over <= 0, `${w}px: no horizontal scroll (${over})`);
    ok(cb.x >= 0 && cb.x + cb.width <= w, `${w}px: card inside the viewport`);
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/pwa-card-${w}.png` });
    await p.getByRole("button", { name: "Dismiss" }).click();
    await p.waitForTimeout(400);
    ok(await card.count() === 0, `${w}px: dismiss closes it`);
    await p.goto(`${BASE}/contact`, { waitUntil: "load", timeout: 180000 });
    await p.waitForTimeout(6000);
    ok(await p.locator("[data-install-prompt]").count() === 0, `${w}px: stays dismissed`);
  }
  await c.close();
}

await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
