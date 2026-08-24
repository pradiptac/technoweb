/**
 * Strict mobile audit.
 *
 *   node scripts/mobile-audit.mjs                 # every route
 *   node scripts/mobile-audit.mjs /admin /contact # specific routes
 *
 * The main audit already fails on horizontal overflow at 360px. This goes
 * further and, crucially, names the *element* responsible — "the page
 * overflows by 42px" is not actionable, "this table is 402px wide inside a
 * 360px viewport" is.
 *
 * Checks, per route, at 320 / 360 / 390 / 414:
 *   - document-level horizontal overflow
 *   - any element wider than the viewport, with a selector for it
 *   - content clipped off the right edge
 *   - text below 12px
 *   - tap targets under 24px that also fail the WCAG 2.2 spacing exception
 *   - inputs under 16px, which makes iOS Safari zoom on focus
 *   - fixed/sticky elements covering more than half the screen
 *
 * Exits non-zero if anything fails, so it can gate a deploy like the other one.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_LOGIN_EMAIL ?? "admin@technoware.in";
const ADMIN_PASSWORD = process.env.ADMIN_LOGIN_PASSWORD ?? "";
const PORTAL_EMAIL = process.env.PORTAL_LOGIN_EMAIL ?? "";
const PORTAL_PASSWORD = process.env.PORTAL_LOGIN_PASSWORD ?? "";
/** A ticket reference the portal account owns, for the conversation view. */
const PORTAL_TICKET = process.env.PORTAL_TICKET ?? "";

/** 320 is the narrowest phone still in use; 414 a large one. */
const WIDTHS = [320, 360, 390, 414];

const PUBLIC_ROUTES = [
  "/", "/solutions", "/solutions/networking", "/services", "/services/web-hosting",
  "/industries", "/industries/manufacturing", "/products", "/products/switches",
  "/products/cisco-cbs350-24t-4g", "/resources", "/blog", "/case-studies",
  "/knowledge-base", "/about", "/contact", "/support", "/privacy", "/terms",
  "/search", "/search?q=switch",
  "/this-page-does-not-exist",   // the 404
  "/downloads", "/portal/login", "/portal/forgot-password", "/admin/login",
  "/admin/forgot-password",
];

/*
 * The signed-in customer portal. Skipped unless PORTAL_LOGIN_EMAIL and
 * PORTAL_LOGIN_PASSWORD are set, because there is no seeded portal account —
 * one is created with `php artisan technoware:customer`.
 */
const PORTAL_ROUTES = [
  "/portal", "/portal/tickets", "/portal/tickets/new", "/portal/profile",
  ...(PORTAL_TICKET ? [`/portal/tickets/${PORTAL_TICKET}`] : []),
];

const ADMIN_ROUTES = [
  "/admin", "/admin/tickets", "/admin/blog", "/admin/blog/new",
  "/admin/knowledge-base", "/admin/case-studies", "/admin/pages", "/admin/faqs",
  "/admin/faqs/new", "/admin/media", "/admin/products", "/admin/products/new",
  "/admin/product-categories", "/admin/brands", "/admin/solutions",
  "/admin/services", "/admin/industries", "/admin/seo", "/admin/redirects",
  "/admin/redirects/new", "/admin/users", "/admin/users/new", "/admin/settings",
  "/admin/profile",
];

const requested = process.argv.slice(2);
const portalConfigured = Boolean(PORTAL_EMAIL && PORTAL_PASSWORD);
const routes = requested.length
  ? requested
  : [...PUBLIC_ROUTES, ...(portalConfigured ? PORTAL_ROUTES : []), ...ADMIN_ROUTES];
if (!requested.length && !portalConfigured) {
  console.log("note: PORTAL_LOGIN_EMAIL/PORTAL_LOGIN_PASSWORD unset — skipping the signed-in portal" + String.fromCharCode(10));
}
const needsAuth = (r) =>
  r.startsWith("/admin") &&
  !["/admin/login", "/admin/forgot-password", "/admin/reset-password"].includes(r);
const needsPortalAuth = (r) =>
  r.startsWith("/portal") &&
  !["/portal/login", "/portal/forgot-password", "/portal/reset-password"].includes(r);

/* Runs in the page. Returns findings, not raw numbers. */
const PROBE = `(function () {
  const vw = document.documentElement.clientWidth;
  const out = { overflow: 0, wide: [], smallText: [], tinyTargets: [], zoomInputs: [], hogs: [] };

  out.overflow = document.documentElement.scrollWidth - vw;

  const describe = (el) => {
    const id = el.id ? '#' + el.id : '';
    const cls = typeof el.className === 'string' && el.className
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.')
      : '';
    return el.tagName.toLowerCase() + id + cls;
  };

  // An element wider than the viewport, or sticking out past its right edge.
  //
  // Skipped when an ancestor contains it. That means scroll containers — a
  // wide table inside overflow-x-auto is a deliberate choice — but also
  // overflow:hidden and clip, which is how every decorative background blob on
  // this site is kept inside its section. Checking only for auto/scroll
  // reported all of those as bugs.
  const contained = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const o = getComputedStyle(n).overflowX;
      if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true;
    }
    return false;
  };

  document.querySelectorAll('body *').forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;

    if (!contained(el)) {
      if (r.width > vw + 1) out.wide.push({ sel: describe(el), width: Math.round(r.width), vw });
      else if (r.right > vw + 1) out.wide.push({ sel: describe(el), right: Math.round(r.right), vw });
    }

    // Text smaller than 12px is unreadable on a phone.
    //
    // Inside an SVG, getComputedStyle reports the font-size in *user units*,
    // which is not what the reader sees — a viewBox scales it. So multiply by
    // the element's on-screen scale factor. Without this, a diagram labelled
    // fontSize="8.5" reads as 8.5px whether it is rendered at half size or
    // triple, and both the failure and the fix would be measured wrong.
    const hasText = [].slice.call(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
    if (hasText) {
      let size = parseFloat(cs.fontSize);
      let scaled = false;
      if (el.namespaceURI === 'http://www.w3.org/2000/svg' && el.getScreenCTM) {
        const m = el.getScreenCTM();
        if (m) {
          const k = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
          if (Math.abs(k - 1) > 0.01) { size = size * k; scaled = true; }
        }
      }
      if (size && size < 12) {
        out.smallText.push({
          sel: describe(el),
          size: Math.round(size * 10) / 10,
          text: el.textContent.trim().slice(0, 30),
          note: scaled ? ' (after viewBox scaling)' : '',
        });
      }
    }

    // A form control under 16px makes iOS Safari zoom the whole page on focus.
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (!['checkbox', 'radio', 'hidden', 'submit', 'button', 'file'].includes(type)) {
        const size = parseFloat(cs.fontSize);
        if (size && size < 16) out.zoomInputs.push({ sel: describe(el), size });
      }
    }

    // Something fixed covering most of the screen with no way past it.
    if ((cs.position === 'fixed' || cs.position === 'sticky') && r.height > window.innerHeight * 0.5) {
      if (cs.visibility !== 'hidden' && cs.opacity !== '0') {
        out.hogs.push({ sel: describe(el), height: Math.round(r.height), vh: window.innerHeight });
      }
    }
  });

  // WCAG 2.2 target size, implemented as in the main audit: undersized is only
  // a failure when another target sits within 24px of its centre.
  const targets = [].slice.call(document.querySelectorAll('a,button,input[type=checkbox],input[type=radio],select'))
    .map((el) => ({ el, r: el.getBoundingClientRect(), cs: getComputedStyle(el) }))
    .filter((t) => t.r.width > 0 && t.r.height > 0 && t.cs.visibility !== 'hidden');

  const centre = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

  targets.forEach((t) => {
    if (t.r.width <= 1 && t.r.height <= 1) return;
    if (t.cs.clipPath !== 'none' && t.r.width < 2) return;
    if (t.r.height >= 24 && t.r.width >= 24) return;
    const inline = t.cs.display === 'inline' && t.el.parentElement &&
      t.el.parentElement.textContent.trim() !== t.el.textContent.trim();
    if (inline) return;
    const c = centre(t.r);
    const crowded = targets.some((o) => {
      if (o.el === t.el) return false;
      const oc = centre(o.r);
      return Math.hypot(c.x - oc.x, c.y - oc.y) < 24;
    });
    if (crowded) {
      out.tinyTargets.push({
        sel: describe(t.el),
        size: Math.round(t.r.width) + 'x' + Math.round(t.r.height),
        label: (t.el.textContent || '').trim().slice(0, 24) || t.el.getAttribute('aria-label') || '?',
      });
    }
  });

  return out;
})()`;

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
page.setDefaultNavigationTimeout(180_000);

let loggedIn = false;
let loginFailure = null;
async function ensureLogin() {
  if (loggedIn) return;
  // One failure means every remaining admin route would fail the same way.
  // Retrying 24 times at a 4-minute timeout each is how this run turned into
  // half an hour of nothing.
  if (loginFailure) throw loginFailure;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/admin/login`, { waitUntil: "load" });
  await page.fill("#email", ADMIN_EMAIL);
  await page.fill("#password", ADMIN_PASSWORD);
  await Promise.all([
    // Generous, because in dev the first authenticated hit compiles the whole
    // admin tree before it can redirect. Against a build this is instant.
    page.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 240_000 }),
    page.click('button[type="submit"]'),
  ]);
  loggedIn = true;
}

let portalLoggedIn = false;
let portalFailure = null;
async function ensurePortalLogin() {
  if (portalLoggedIn) return;
  if (portalFailure) throw portalFailure;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/portal/login`, { waitUntil: "load" });
  await page.fill("#email", PORTAL_EMAIL);
  await page.fill("#password", PORTAL_PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/portal/login"), { timeout: 240_000 }),
    page.click('button[type="submit"]'),
  ]);
  portalLoggedIn = true;
}

const problems = [];

for (const route of routes) {
  if (needsPortalAuth(route)) {
    try {
      await ensurePortalLogin();
    } catch (e) {
      portalFailure ??= e;
      problems.push({ route, issues: [`portal login failed: ${String(e).split(String.fromCharCode(10))[0]}`] });
      console.log(`SKIP  ${route}  (not signed in)`);
      continue;
    }
  }

  if (needsAuth(route)) {
    try {
      await ensureLogin();
    } catch (e) {
      loginFailure ??= e;
      problems.push({ route, issues: [`admin login failed: ${String(e).split(String.fromCharCode(10))[0]}`] });
      console.log(`SKIP  ${route}  (not signed in)`);
      continue;
    }
  }

  const routeIssues = [];

  // Compile it once before measuring. Otherwise the 320px pass pays for the
  // route's first build and its numbers are taken from a half-rendered page.
  try {
    await page.goto(BASE + route, { waitUntil: "load" });
  } catch { /* the per-width loop reports it properly */ }

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 780 });
    try {
      await page.goto(BASE + route, { waitUntil: "load" });
    } catch (e) {
      routeIssues.push(`${width}px: did not load — ${String(e).split("\n")[0]}`);
      continue;
    }
    // Let sticky/flex settle.
    await page.waitForTimeout(120);

    const r = await page.evaluate(PROBE);
    const at = `${width}px`;

    if (r.overflow > 0) routeIssues.push(`${at}: page scrolls horizontally by ${r.overflow}px`);

    // Deduplicate: one offending element reported once per route, not per width.
    for (const w of r.wide.slice(0, 4)) {
      const how = w.width ? `is ${w.width}px wide in a ${w.vw}px viewport` : `extends ${w.right - w.vw}px past the right edge`;
      routeIssues.push(`${at}: ${w.sel} ${how}`);
    }
    for (const t of r.smallText.slice(0, 3)) {
      routeIssues.push(`${at}: ${t.size}px text${t.note} — "${t.text}" (${t.sel})`);
    }
    for (const z of r.zoomInputs.slice(0, 3)) {
      routeIssues.push(`${at}: ${z.sel} font is ${z.size}px — iOS Safari zooms on focus below 16px`);
    }
    for (const t of r.tinyTargets.slice(0, 3)) {
      routeIssues.push(`${at}: tap target ${t.size} — "${t.label}" (${t.sel})`);
    }
    for (const h of r.hogs.slice(0, 2)) {
      routeIssues.push(`${at}: ${h.sel} is fixed and ${h.height}px tall in a ${h.vh}px viewport`);
    }
  }

  if (routeIssues.length) problems.push({ route, issues: routeIssues });
  console.log(`${routeIssues.length ? "FAIL" : "ok  "}  ${route}${routeIssues.length ? `  (${routeIssues.length})` : ""}`);
}

console.log("\n" + "─".repeat(72));
if (!problems.length) {
  console.log(`All ${routes.length} routes clean at ${WIDTHS.join(", ")}px.`);
  process.exit(0);
}

console.log(`${problems.length} of ${routes.length} route(s) with problems:\n`);
for (const p of problems) {
  console.log(`  ${p.route}`);
  for (const i of p.issues) console.log(`    - ${i}`);
  console.log("");
}
process.exit(1);
