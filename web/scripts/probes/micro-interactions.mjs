import { chromium } from "playwright";
import { BASE, signInAsStaff } from "../shared.mjs";

/**
 * Small interactions (0.171.0, docs/motion.md "Small interactions").
 *
 *   node scripts/probes/micro-interactions.mjs                       # the site half
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/micro-interactions.mjs   # and the console's
 *
 * Site: a button's arrow nudges forward under the pointer (sampled, and
 * still under reduced motion); a link in a post's body thickens its
 * underline; Copy link's tick arrives through its starting style. Console:
 * a real save turns the Save button into "Saved ✓" and back (on a throwaway
 * draft post, deleted after); Subtle drops the switch's spring.
 */
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const browser = await chromium.launch();

async function arrowTranslate(reduced) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: reduced ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 240000 });
  const btn = page.locator('main a:has(svg[data-icon="arrow-right"]):visible, main .btn:has(svg[data-icon="arrow-right"]):visible').first();
  await btn.scrollIntoViewIfNeeded();
  await btn.hover();
  await page.waitForTimeout(400);
  const t = await btn.locator('svg[data-icon="arrow-right"]').first().evaluate((s) => getComputedStyle(s).translate);
  await ctx.close();
  return t;
}

try {
  const lively = await arrowTranslate(false);
  ok(lively === "3px" || lively === "3px 0px", `an arrow nudges forward under the pointer (${lively})`);
  const still = await arrowTranslate(true);
  ok(still === "none", `and stays put under reduced motion (${still})`);

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/blog`, { waitUntil: "load", timeout: 240000 });
  const href = await page.locator('a[href^="/blog/"]:not([href^="/blog/category"]):not([href^="/blog/archive"])').first().getAttribute("href");
  await page.goto(`${BASE}${href}`, { waitUntil: "load", timeout: 240000 });
  const link = page.locator("[data-prose] a").first();
  if (await link.count()) {
    await link.scrollIntoViewIfNeeded();
    const rest = await link.evaluate((a) => getComputedStyle(a).textDecorationThickness);
    await link.hover();
    await page.waitForTimeout(300);
    const hover = await link.evaluate((a) => getComputedStyle(a).textDecorationThickness);
    ok(rest === "1px" && hover === "2px", `a body link's underline thickens under the pointer (${rest} → ${hover})`);
  } else {
    console.log(`skip a body link (none in ${href})`);
  }
  const copy = page.locator('button[aria-label="Copy link"]').first();
  if (await copy.count()) {
    await copy.scrollIntoViewIfNeeded();
    await copy.click();
    const arrived = await page.waitForSelector("[data-copied]", { timeout: 1500 }).then(() => true, () => false);
    ok(arrived, "Copy link's tick arrives");
  } else {
    console.log("skip Copy link (no share row)");
  }
  await ctx.close();

  if (process.env.ADMIN_LOGIN_EMAIL) {
    // A body link: nothing seeded carries one, so a throwaway page does.
    const API = `${process.env.API_BASE_URL ?? "http://127.0.0.1:8000"}/api/v1`;
    const H = await fetch(`${API}/admin/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ email: process.env.ADMIN_LOGIN_EMAIL, password: process.env.ADMIN_LOGIN_PASSWORD }) })
      .then((r) => r.json()).then((l) => ({ "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${l.token}` }));
    const slug = `micro-probe-${Date.now()}`;
    const made = await fetch(`${API}/admin/pages`, { method: "POST", headers: H, body: JSON.stringify({ title: "Micro probe", slug, template: "builder", status: "published", blocks: [{ id: crypto.randomUUID(), type: "rich_text", hidden: false, background: null, data: { body: '<p>Read the <a href="/about">about page</a> first.</p>' } }] }) }).then((r) => r.json());
    try {
      const lc = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const lp = await lc.newPage();
      await lp.goto(`${BASE}/${slug}`, { waitUntil: "load", timeout: 240000 });
      const link = lp.locator("[data-prose] a").first();
      await link.scrollIntoViewIfNeeded();
      const rest = await link.evaluate((a) => getComputedStyle(a).textDecorationThickness);
      // A site popup or the cookie banner can take the pointer; close it, then poll.
      let hover = rest;
      for (let i = 0; i < 6 && hover !== "2px"; i++) {
        await lp.keyboard.press("Escape");
        await link.hover();
        await lp.waitForTimeout(250);
        hover = await link.evaluate((a) => getComputedStyle(a).textDecorationThickness);
      }
      ok(rest === "1px" && hover === "2px", `a body link's underline thickens under the pointer (${rest} → ${hover})`);
      await lc.close();
    } finally {
      if (made.data?.id) await fetch(`${API}/admin/pages/${made.data.id}`, { method: "DELETE", headers: H });
    }

    const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await c.newPage();
    await signInAsStaff(p);
    await p.goto(`${BASE}/admin/blog/new`, { waitUntil: "load", timeout: 240000 });
    const title = `micro-probe-${Date.now()}`;
    await p.locator('input[name="title"]').fill(title);
    await p.locator('[data-form-actions] button[type="submit"]').first().click();
    const saved = await p.waitForSelector("[data-form-actions] [data-saved]", { timeout: 60000 }).then(() => true, () => false);
    ok(saved, 'a real save turns the Save button into "Saved ✓"');
    if (saved) {
      await p.waitForTimeout(2500);
      ok(await p.locator("[data-form-actions] [data-saved]").count() === 0, "and it turns back");
    }
    // Delete the throwaway post through the API, by the id in the edit screen's address.
    await p.waitForURL(/\/admin\/blog\/\d+/, { timeout: 60000 }).catch(() => {});
    const postId = p.url().match(/\/admin\/blog\/(\d+)/)?.[1];
    const H2 = await fetch(`${API}/admin/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ email: process.env.ADMIN_LOGIN_EMAIL, password: process.env.ADMIN_LOGIN_PASSWORD }) })
      .then((r) => r.json()).then((l) => ({ Accept: "application/json", Authorization: `Bearer ${l.token}` }));
    const gone = postId ? (await fetch(`${API}/admin/blog-posts/${postId}`, { method: "DELETE", headers: H2 })).ok : false;
    console.log(gone ? `deleted ${title}` : `NOTE could not delete ${title}; remove it by hand`);
    // The API sign-in revoked the browser's admin token; sign in again.
    await signInAsStaff(p);

    await p.evaluate(() => localStorage.setItem("tw_console_motion", "subtle"));
    await p.goto(`${BASE}/admin/blog/new`, { waitUntil: "load", timeout: 240000 });
    const tf = await p.locator("[data-switch]").first().evaluate((el) => getComputedStyle(el, "::after").transitionTimingFunction).catch(() => "none");
    ok(!tf.includes("1.56"), `Subtle drops the switch's spring (${tf})`);
    await p.evaluate(() => localStorage.removeItem("tw_console_motion"));
    await c.close();
  }
} finally {
  await browser.close();
}
if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
