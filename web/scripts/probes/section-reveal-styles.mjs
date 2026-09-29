/**
 * The four section reveal styles added on 2026-09-27 — assemble, cascade,
 * focus, unfold — measured mid-flight, at rest, under reduced motion, and as
 * the site-wide "Sections arriving" style.
 *
 * What it does:
 *  1. Signs in to the API with ADMIN_LOGIN_EMAIL / ADMIN_LOGIN_PASSWORD and
 *     creates a throwaway *published* builder page: a tall opening text
 *     section, then one section per style (a features grid for the piece
 *     styles, a hero with a button for the hover check), spaced apart.
 *  2. Scrolls each section into view and samples it at ~150ms and ~400ms
 *     (should be mid-flight: pieces part-transparent and transformed, the
 *     unfold clip still an inset, the focus blur still on) and at ~1.6s
 *     (at rest: opacity 1, transform none, no running animation, clip-path
 *     and filter none).
 *  3. Hovers the assembled hero's button and checks its own `translate`
 *     still moves — the pieces animate by `animation`, never by a lasting
 *     transition or a `translate`, so a tile's hover must survive.
 *  4. Re-opens the page with reduced motion and checks nothing is hidden.
 *  5. Signs in through the real login form, picks each site-wide style on
 *     the Motion tab (/admin/site/settings), saves, and samples a lower
 *     section of /about; then puts the stored choice back.
 *  6. Deletes the page.
 *
 * Run from web/ against `npm run dev` (or a build), with the API up:
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/section-reveal-styles.mjs
 * Use a throwaway staff account with the admin role — step 5 writes a
 * setting (and restores it).
 */
import { chromium } from "playwright";
import { BASE, ADMIN_EMAIL, ADMIN_PASSWORD, signInAsStaff } from "../shared.mjs";

const API = (process.env.API_BASE_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "") + "/api/v1";

// The CSS's piece list (globals.css, "reveals: pieces and wipes").
const PIECES = 'h1,h2,h3,h4,h5,h6,p,li,figure,img,video,iframe,blockquote,table,form,.btn,[data-tile],[data-card],[data-strip-mode],[data-marquee],[aria-roledescription="carousel"]';

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

async function api(method, path, token, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Accept: "application/json", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 400)}`);
  return json;
}

const filler = Array.from({ length: 14 }, (_, i) => `<p>Filler paragraph ${i + 1}, here only to push the sections under test below the first screen so that each one is revealed by scrolling rather than on load.</p>`).join("");
const features = (heading, reveal) => ({
  id: crypto.randomUUID(), type: "features", hidden: false, reveal,
  data: { heading, items: [1, 2, 3, 4, 5, 6].map((n) => ({ title: `Piece ${n}`, body: `The body of piece ${n}.` })) },
});
const spacer = () => ({ id: crypto.randomUUID(), type: "rich_text", hidden: false, reveal: "none", data: { body: filler } });

/** Everything the reveal decides about one section, read in the page. */
function sampleIn(el, pieces) {
  // `:scope`, or the root itself counts as the "nested" [data-aos].
  const nested = el.querySelectorAll(`:scope :is(${pieces}, [data-aos]) *`);
  const skip = new Set(nested);
  const list = [...el.querySelectorAll(pieces)].filter((p) => !skip.has(p) && !p.hasAttribute("data-aos"));
  const cs = getComputedStyle(el);
  return {
    animated: el.hasAttribute("data-aos-animate"),
    root: { opacity: +cs.opacity, clip: cs.clipPath, filter: cs.filter, running: el.getAnimations().length },
    pieces: list.slice(0, 8).map((p) => {
      const s = getComputedStyle(p);
      return { tag: p.tagName.toLowerCase(), opacity: +(+s.opacity).toFixed(3), transform: s.transform, running: p.getAnimations().length };
    }),
    total: list.length,
  };
}

async function sampleOverTime(page, selector) {
  const loc = page.locator(selector).first();
  await loc.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
  const t0 = Date.now();
  const at = async (ms) => {
    await page.waitForTimeout(Math.max(0, ms - (Date.now() - t0)));
    return loc.evaluate(sampleIn, PIECES);
  };
  return { early: await at(150), mid: await at(400), end: await at(1600) };
}

function judgePieces(name, s) {
  check(s.end.animated, `${name}: stamped data-aos-animate`);
  check(s.early.pieces.some((p) => p.opacity < 0.95 || p.transform !== "none"), `${name}: pieces mid-flight at ~150ms`, JSON.stringify(s.early.pieces.slice(0, 4).map((p) => [p.tag, p.opacity])));
  const firstVsLast = s.early.pieces.length > 1 ? `${s.early.pieces[0].opacity} → ${s.early.pieces.at(-1).opacity}` : "";
  console.log(`         stagger at ~150ms (first → eighth piece opacity): ${firstVsLast}`);
  check(s.end.pieces.every((p) => p.opacity === 1 && p.transform === "none" && p.running === 0), `${name}: pieces at rest by ~1.6s`, `${s.end.total} pieces`);
}

const browser = await chromium.launch();
let token = null;
let pageId = null;
let originalReveal = null;

try {
  // --- 1. the page -------------------------------------------------------
  token = (await api("POST", "/admin/auth/login", null, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD })).token;
  const slug = `reveal-probe-${Date.now()}`;
  const blocks = [
    { id: crypto.randomUUID(), type: "rich_text", hidden: false, reveal: "none", data: { heading: "Reveal probe", body: filler } },
    features("Assembles", "assemble"), spacer(),
    features("Cascades", "cascade"), spacer(),
    features("Focuses", "focus"), spacer(),
    features("Unfolds", "unfold"), spacer(),
    { id: crypto.randomUUID(), type: "hero", hidden: false, reveal: "assemble", data: { heading: "Assembled hero", lede: "With a button to hover.", layout: "centered", primary: { label: "Hover me", href: "/contact" } } },
    spacer(),
  ];
  const created = await api("POST", "/admin/pages", token, { title: "Reveal probe", slug, status: "published", template: "builder", blocks });
  pageId = created.data.id;
  console.log(`page ${pageId} at /${slug}`);

  // --- 2 & 3. mid-flight, at rest, hover -----------------------------------
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/${slug}`, { waitUntil: "networkidle", timeout: 180000 });
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-aos-ready"));

  judgePieces("assemble", await sampleOverTime(page, '[data-aos="assemble"][data-page-section="features"]'));
  judgePieces("cascade", await sampleOverTime(page, '[data-aos="cascade"]'));

  const focus = await sampleOverTime(page, '[data-aos="focus"]');
  check(/blur/.test(focus.early.root.filter), "focus: blurred at ~150ms", focus.early.root.filter);
  check(focus.end.root.filter === "none" && focus.end.root.opacity === 1, "focus: sharp and opaque by ~1.6s", focus.end.root.filter);

  const unfold = await sampleOverTime(page, '[data-aos="unfold"]');
  check(/inset/.test(unfold.early.root.clip), "unfold: clipped at ~150ms", unfold.early.root.clip);
  check(unfold.end.root.clip === "none" && unfold.end.root.running === 0, "unfold: clip gone by ~1.6s", unfold.end.root.clip);

  const hero = '[data-page-section="hero"][data-aos="assemble"]';
  judgePieces("assembled hero", await sampleOverTime(page, hero));
  const btn = page.locator(`${hero} .btn`).first();
  const before = await btn.evaluate((e) => getComputedStyle(e).translate);
  await btn.hover();
  await page.waitForTimeout(400);
  const after = await btn.evaluate((e) => getComputedStyle(e).translate);
  check(before !== after, "hover lift survives assembling", `${before} → ${after}`);
  check(errors.length === 0, "no page errors", errors.join(" | "));
  await ctx.close();

  // --- 4. reduced motion ---------------------------------------------------
  const rctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  const rpage = await rctx.newPage();
  await rpage.goto(`${BASE}/${slug}`, { waitUntil: "networkidle", timeout: 180000 });
  const hidden = await rpage.evaluate((pieces) => [...document.querySelectorAll("[data-aos]")].flatMap((el) =>
    [el, ...el.querySelectorAll(pieces)].filter((n) => { const s = getComputedStyle(n); return +s.opacity < 1 || s.clipPath !== "none" || s.filter !== "none"; }).map((n) => n.tagName)), PIECES);
  check(hidden.length === 0, "reduced motion: nothing hidden, clipped or blurred", hidden.slice(0, 5).join(","));
  await rctx.close();

  // --- 5. site-wide, through the Motion tab --------------------------------
  const sctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const spage = await sctx.newPage();
  await signInAsStaff(spage);
  const setReveal = async (id) => {
    // "load", not "networkidle": the console polls (new-since, the queue),
    // so it is never idle.
    await spage.goto(`${BASE}/admin/site/settings?tab=motion`, { waitUntil: "load", timeout: 180000 });
    await spage.locator('input[name="setting__motion_reveal"]').first().waitFor({ state: "attached", timeout: 120000 });
    const radio = spage.locator(`input[name="setting__motion_reveal"][value="${id}"]`);
    if (originalReveal === null) originalReveal = await spage.locator('input[name="setting__motion_reveal"]:checked').getAttribute("value");
    await radio.check({ force: true });
    await Promise.all([
      spage.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/site/settings"), { timeout: 60000 }),
      spage.getByRole("button", { name: "Save site settings" }).click(),
    ]);
  };
  for (const id of ["assemble", "cascade", "unfold"]) {
    await setReveal(id);
    await spage.goto(`${BASE}/about`, { waitUntil: "networkidle", timeout: 180000 });
    const stamped = await spage.locator(`[data-motion-reveal="${id}"]`).count();
    check(stamped > 0, `site-wide ${id}: stamped on the wrapper`);
    // The last fade-up section on the page is below the first screen.
    const sel = '[data-aos="fade-up"]:not([data-aos-animate])';
    if (await spage.locator(sel).count() === 0) { check(false, `site-wide ${id}: a section left to reveal on /about`); continue; }
    await spage.locator(sel).last().evaluate((el) => el.setAttribute("data-probe", ""));
    const s = await sampleOverTime(spage, "[data-probe]");
    if (id === "unfold") {
      check(/inset/.test(s.early.root.clip) && s.end.root.clip === "none", `site-wide unfold: clipped then clear`, `${s.early.root.clip} → ${s.end.root.clip}`);
    } else {
      judgePieces(`site-wide ${id}`, s);
    }
  }
} finally {
  // --- 6. put everything back ----------------------------------------------
  if (originalReveal !== null) {
    try {
      const rctx = await browser.newContext();
      const p = await rctx.newPage();
      await signInAsStaff(p);
      await p.goto(`${BASE}/admin/site/settings?tab=motion`, { waitUntil: "load", timeout: 180000 });
      await p.locator('input[name="setting__motion_reveal"]').first().waitFor({ state: "attached", timeout: 120000 });
      await p.locator(`input[name="setting__motion_reveal"][value="${originalReveal}"]`).check({ force: true });
      await Promise.all([
        p.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/site/settings"), { timeout: 60000 }),
        p.getByRole("button", { name: "Save site settings" }).click(),
      ]);
      console.log(`restored motion_reveal = ${originalReveal}`);
    } catch (e) { console.log(`COULD NOT RESTORE motion_reveal (${originalReveal}): ${e.message}`); failures++; }
  }
  // A sign-in through the form revokes the API token taken in step 1 (one
  // `admin` token per account), so the delete signs in again.
  if (pageId) token = (await api("POST", "/admin/auth/login", null, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }).catch(() => ({}))).token ?? token;
  if (pageId && token) await api("DELETE", `/admin/pages/${pageId}`, token).then(() => console.log(`deleted page ${pageId}`)).catch((e) => console.log(`could not delete page ${pageId}: ${e.message}`));
  await browser.close();
}

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
