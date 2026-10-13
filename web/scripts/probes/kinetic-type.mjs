import { chromium } from "playwright";

/**
 * Kinetic hero headings (0.171.0, docs/motion.md "Kinetic headings").
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/kinetic-type.mjs
 *
 * Makes three published builder pages through the API — rotating words plus
 * a highlight hero, a typewriter hero, a decode hero — and checks on each:
 * the server HTML carries the whole heading in the h1; the h1's box does not
 * move while the effect plays; each effect runs and ends (sampled
 * mid-flight); rotate's Pause button holds it and the heading's accessible
 * name is the words alone; reduced motion never runs anything; a failed
 * island is revealed by the CSS failsafe; nothing overflows at 320px; and
 * nothing is logged. Every page is deleted at the end.
 *
 * Automated browsers get the final state (the audit rule), so every context
 * sets `tw_kinetic_force` first.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const API = `${process.env.API_BASE_URL ?? "http://127.0.0.1:8000"}/api/v1`;
const EMAIL = process.env.ADMIN_LOGIN_EMAIL;
const PASSWORD = process.env.ADMIN_LOGIN_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error("Set ADMIN_LOGIN_EMAIL and ADMIN_LOGIN_PASSWORD."); process.exit(2); }

const j = (r) => r.json();
const apiLogin = async () => {
  const l = await fetch(`${API}/admin/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) }).then(j);
  return { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${l.token}` };
};
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const stamp = Date.now();
const uuid = () => crypto.randomUUID();
const hero = (heading, kinetic, words) => ({ id: uuid(), type: "hero", hidden: false, background: null, data: { heading, layout: "centered", kinetic, ...(words ? { kinetic_words: words } : {}) } });
const filler = () => ({ id: uuid(), type: "rich_text", hidden: false, background: null, data: { body: `<p>${"Spacer paragraph so the next hero sits below the fold. ".repeat(40)}</p>` } });

let H = await apiLogin();
const pages = [];
async function make(slug, blocks) {
  const res = await fetch(`${API}/admin/pages`, { method: "POST", headers: H, body: JSON.stringify({ title: `Kinetic probe ${slug}`, slug, template: "builder", status: "published", blocks }) }).then(j);
  if (!res.data?.id) throw new Error(`could not make ${slug}: ${JSON.stringify(res).slice(0, 300)}`);
  pages.push(res.data.id);
  return `/${slug}`;
}

const browser = await chromium.launch();
const errors = [];
async function ctx(opts = {}) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
  await c.addInitScript(() => { try { localStorage.setItem("tw_kinetic_force", "1"); } catch {} });
  return c;
}
const watch = (page) => {
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
};
const box = (page) => page.locator("h1").first().boundingBox();
async function stableBox(page, ms, label) {
  const first = await box(page);
  let worst = 0;
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(ms / 10);
    const b = await box(page);
    worst = Math.max(worst, Math.abs(b.width - first.width), Math.abs(b.height - first.height));
  }
  ok(worst <= 1, `${label}: the heading's box does not move while it plays (worst ${worst.toFixed(1)}px)`);
}

try {
  const rotateUrl = await make(`kinetic-probe-rotate-${stamp}`, [
    hero("We keep networks running", "rotate", "servers\nstorage and security"),
    filler(),
    hero("Support that answers fast and properly every time", "highlight", "answers fast and properly"),
  ]);
  const typeUrl = await make(`kinetic-probe-type-${stamp}`, [hero("Telecommunications infrastructure engineered properly", "type")]);
  const decodeUrl = await make(`kinetic-probe-decode-${stamp}`, [hero("Infrastructure engineered properly", "decode")]);

  // Server HTML: the whole heading inside the h1.
  const html = await fetch(`${BASE}${rotateUrl}`).then((r) => r.text());
  ok(/<h1[^>]*>[\s\S]*?We keep networks running[\s\S]*?<\/h1>/.test(html), "the server HTML carries the whole heading in the h1");

  /*
   * Warm every page before anything is timed. A builder page is rendered on
   * its first request, and against a cold server that first render plus the
   * chunk compile puts hydration past the island's own 3s mark — at which
   * point the CSS failsafe has already revealed the heading and the island
   * correctly declines to hide it again and type it. That is the designed
   * behaviour, and measured cold it reads as "the effect never ran": armed at
   * 3.4s and nothing typed, against armed at 0.7s and all fifty letters typed
   * on the same build one request later.
   */
  await Promise.all([typeUrl, decodeUrl].map((u) => fetch(`${BASE}${u}`).then((r) => r.text())));

  // Rotate.
  {
    const c = await ctx(); const page = await c.newPage(); watch(page);
    await page.goto(`${BASE}${rotateUrl}`, { waitUntil: "load", timeout: 240000 });
    const sawServers = await page.waitForFunction(() => [...document.querySelectorAll("[data-k-alt][data-cur]")].some((e) => e.textContent === "servers"), null, { timeout: 15000 }).then(() => true, () => false);
    ok(sawServers, "rotate: the last word turns into the first alternative");
    await stableBox(page, 3000, "rotate");
    const name = await page.getByRole("heading", { level: 1 }).evaluate((h) => {
      const id = h.getAttribute("aria-labelledby");
      return id ? document.getElementById(id)?.textContent : h.textContent;
    });
    ok(name === "We keep networks running", `rotate: the heading is named by its words alone (${JSON.stringify(name)})`);
    const pause = page.locator(".kinetic button[aria-label^=\"Pause\"]").first();
    ok(await pause.isVisible(), "rotate: a Pause button shows while it moves");
    await pause.click();
    await page.mouse.move(5, 890);
    const before = await page.locator("[data-k-alt][data-cur]").first().textContent();
    await page.waitForTimeout(3500);
    const after = await page.locator("[data-k-alt][data-cur]").first().textContent();
    ok(before === after, `rotate: Pause holds the word (${before} → ${after})`);
    await page.locator(".kinetic button[aria-label^=\"Play\"]").first().click();
    await page.mouse.move(5, 890);
    const ended = await page.waitForFunction(() => document.querySelector('[data-kinetic="rotate"]')?.hasAttribute("data-kinetic-done"), null, { timeout: 20000 }).then(() => true, () => false);
    const rest = await page.locator("[data-k-alt][data-cur]").first().textContent();
    ok(ended && rest === "running", `rotate: ends after one round on its own word (${rest})`);

    // Highlight, further down: drawn mid-flight, then drawn.
    await page.locator('[data-kinetic="highlight"]').scrollIntoViewIfNeeded();
    let mid = false;
    for (let i = 0; i < 24 && !mid; i++) {
      const off = await page.locator('[data-kinetic="highlight"] .k-mark path').evaluate((p) => parseFloat(getComputedStyle(p).strokeDashoffset));
      if (off > 0.05 && off < 0.95) mid = true;
      await page.waitForTimeout(50);
    }
    ok(mid, "highlight: the stroke is caught mid-draw");
    await page.waitForTimeout(2000);
    const end = await page.locator('[data-kinetic="highlight"] .k-mark path').evaluate((p) => parseFloat(getComputedStyle(p).strokeDashoffset));
    ok(end === 0, `highlight: drawn when it is done (${end})`);
    await c.close();
  }

  // Typewriter.
  {
    const c = await ctx(); const page = await c.newPage(); watch(page);
    await page.goto(`${BASE}${typeUrl}`, { waitUntil: "load", timeout: 240000 });
    await page.waitForSelector('[data-kinetic="type"][data-kinetic-armed]', { timeout: 30000 });
    const hiddenSome = await page.waitForFunction(() => document.querySelector('[data-kinetic="type"][data-kinetic-run]') && document.querySelectorAll('[data-k-char]:not([data-on])').length > 0, null, { timeout: 5000 }).then(() => true, () => false);
    // A failure here is almost always a cold render: say what the island did.
    const why = async (effect) => await page.evaluate((e) => {
      const el = document.querySelector(`[data-kinetic="${e}"]`);
      return ` — armed ${el?.hasAttribute("data-kinetic-armed")}, run ${el?.hasAttribute("data-kinetic-run")}, done ${el?.hasAttribute("data-kinetic-done")}, at ${Math.round(performance.now())}ms`;
    }, effect);
    ok(hiddenSome, `type: letters are still to come mid-flight${hiddenSome ? "" : await why("type")}`);
    await stableBox(page, 1500, "type");
    const done = await page.waitForFunction(() => document.querySelector('[data-kinetic="type"]')?.hasAttribute("data-kinetic-done"), null, { timeout: 6000 }).then(() => true, () => false);
    const left = await page.locator("[data-k-char]:not([data-on])").count();
    ok(done && left === 0, `type: every letter typed and done (${left} left)`);
    await c.close();
  }

  // Decode.
  {
    const c = await ctx(); const page = await c.newPage(); watch(page);
    await page.goto(`${BASE}${decodeUrl}`, { waitUntil: "load", timeout: 240000 });
    const scrambling = await page.waitForFunction(() => document.querySelectorAll("[data-k-char][data-s]").length > 0, null, { timeout: 8000 }).then(() => true, () => false);
    // A failure here is almost always a cold render: say what the island did.
    const why = async (effect) => await page.evaluate((e) => {
      const el = document.querySelector(`[data-kinetic="${e}"]`);
      return ` — armed ${el?.hasAttribute("data-kinetic-armed")}, run ${el?.hasAttribute("data-kinetic-run")}, done ${el?.hasAttribute("data-kinetic-done")}, at ${Math.round(performance.now())}ms`;
    }, effect);
    ok(scrambling, `decode: letters are caught scrambling${scrambling ? "" : await why("decode")}`);
    await stableBox(page, 1000, "decode");
    const done = await page.waitForFunction(() => document.querySelector('[data-kinetic="decode"]')?.hasAttribute("data-kinetic-done") && !document.querySelector("[data-k-char][data-s]"), null, { timeout: 6000 }).then(() => true, () => false);
    ok(done, "decode: settles and is done");
    await c.close();
  }

  // Reduced motion: nothing runs, everything shows, no Pause button.
  {
    const c = await ctx({ reducedMotion: "reduce" }); const page = await c.newPage(); watch(page);
    await page.goto(`${BASE}${typeUrl}`, { waitUntil: "load", timeout: 240000 });
    await page.waitForTimeout(2000);
    const ran = await page.locator("[data-kinetic-run]").count();
    const dim = await page.locator("[data-k-char]").evaluateAll((els) => els.filter((e) => getComputedStyle(e).opacity !== "1").length);
    ok(ran === 0 && dim === 0, `reduced motion: nothing runs and every letter shows (${ran} run, ${dim} hidden)`);
    await page.goto(`${BASE}${rotateUrl}`, { waitUntil: "load", timeout: 240000 });
    await page.waitForTimeout(1500);
    ok(!(await page.locator(".kinetic button[aria-label^=\"Pause\"]").first().isVisible()), "reduced motion: no Pause button");
    await c.close();
  }

  // Failsafe: an island that never arms is revealed by CSS within ~3s.
  // Method: the init script makes `IntersectionObserver` throw and strips the
  // armed attribute as React sets it, so the island cannot run or arm.
  {
    const c = await ctx(); const page = await c.newPage();
    await c.addInitScript(() => {
      new MutationObserver((records) => { for (const r of records) if (r.attributeName === "data-kinetic-armed") r.target.removeAttribute("data-kinetic-armed"); })
        .observe(document, { subtree: true, attributes: true, attributeFilter: ["data-kinetic-armed"] });
      window.IntersectionObserver = function () { throw new Error("blocked by probe"); };
    });
    await page.goto(`${BASE}${typeUrl}`, { waitUntil: "load", timeout: 240000 });
    await page.waitForTimeout(4500);
    const dim = await page.locator("[data-k-char]").evaluateAll((els) => els.filter((e) => getComputedStyle(e).opacity !== "1").length);
    ok(dim === 0, `failsafe: an island that never armed still shows every letter (${dim} hidden)`);
    await c.close();
  }

  // 320px: the long alternative wraps rather than overflowing.
  {
    const c = await ctx({ viewport: { width: 320, height: 800 } }); const page = await c.newPage();
    await page.goto(`${BASE}${rotateUrl}`, { waitUntil: "load", timeout: 240000 });
    await page.waitForTimeout(6000);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    ok(sw <= 320, `320px: no sideways scroll with a long rotating word or a long highlighted phrase (${sw})`);
    await page.goto(`${BASE}${typeUrl}`, { waitUntil: "load", timeout: 240000 });
    await page.waitForTimeout(4000);
    const sw2 = await page.evaluate(() => document.documentElement.scrollWidth);
    ok(sw2 <= 320, `320px: a long word in a typed heading wraps rather than scrolling (${sw2})`);
    await c.close();
  }

  ok(errors.length === 0, `nothing logged${errors.length ? ` — ${errors.slice(0, 3).join(" | ")}` : ""}`);
} finally {
  H = await apiLogin();
  let gone = 0;
  for (const id of pages) {
    const r = await fetch(`${API}/admin/pages/${id}`, { method: "DELETE", headers: H });
    if (r.ok) gone++;
  }
  console.log(`deleted ${gone} of ${pages.length}`);
  await browser.close();
}
if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
