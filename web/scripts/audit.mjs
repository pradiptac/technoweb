/**
 * Browser audit — the executable form of the "definition of done" in CLAUDE.md.
 *
 *   node scripts/audit.mjs                       # audit the default route list
 *   node scripts/audit.mjs /blog /products       # audit specific routes
 *   BASE=http://localhost:3001 node scripts/audit.mjs
 *
 * Requires the app running and, on first use:
 *   npx playwright install chromium
 *
 * CHROMIUM_PATH=/path/to/chrome overrides the bundled browser.
 *
 * Checks per route: WCAG AA contrast, heading order, single h1, horizontal
 * overflow at desktop and 360px, canonical URL, and emitted JSON-LD types.
 *
 * /admin/* routes other than the sign-in and password-recovery screens
 * require a session. On first
 * encountering one, the script drives the real login form once (so it also
 * gets exercised) using ADMIN_LOGIN_EMAIL / ADMIN_LOGIN_PASSWORD — defaulting
 * to values that work against mock-api.mjs, which accepts any credentials.
 * Point these at a real seeded staff account when auditing against Laravel.
 *
 * Exits non-zero if anything fails, so CI can gate on it.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const ADMIN_EMAIL = process.env.ADMIN_LOGIN_EMAIL ?? "staff@technoware.in";
const ADMIN_PASSWORD = process.env.ADMIN_LOGIN_PASSWORD ?? "mock-password";

const PUBLIC_ROUTES = [
  "/", "/solutions", "/solutions/networking", "/services", "/services/web-hosting",
  "/industries", "/industries/manufacturing", "/products", "/products/switches",
  "/resources", "/blog", "/case-studies", "/knowledge-base", "/about", "/contact",
  "/search", "/search?q=switch",
  // The 404 is a real page now, so it gets audited like one. See EXPECT_404.
  "/this-page-does-not-exist",
  "/portal/login", "/portal/register", "/portal/register/check-your-email",
  "/portal/verify-email", "/admin/login",
];

/*
 * The console, audited by default rather than on request.
 *
 * This script has always been able to sign in, but the default list was public
 * routes only — so the 25 screens behind the login were checked only when
 * somebody remembered to name them on the command line, which is to say
 * rarely. `Alert`, `Badge` and `ErrorState` shipped dark-mode text at 1.53:1
 * for months behind exactly that gap.
 *
 * Included only when credentials are set, so the command still works without
 * them; `mobile-audit.mjs` has always done it this way.
 */
const ADMIN_ROUTES = [
  "/admin", "/admin/tickets", "/admin/customers", "/admin/blog", "/admin/blog/new",
  "/admin/knowledge-base", "/admin/case-studies", "/admin/pages", "/admin/faqs",
  "/admin/media", "/admin/products", "/admin/products/new", "/admin/product-categories",
  "/admin/brands", "/admin/solutions", "/admin/services", "/admin/industries",
  "/admin/sliders", "/admin/forms", "/admin/seo", "/admin/redirects",
  "/admin/users", "/admin/settings", "/admin/profile",
];

const haveAdminCredentials = Boolean(
  process.env.ADMIN_LOGIN_EMAIL && process.env.ADMIN_LOGIN_PASSWORD,
);

const DEFAULT_ROUTES = [
  ...PUBLIC_ROUTES,
  ...(haveAdminCredentials ? ADMIN_ROUTES : []),
];

/** Routes whose correct answer is 404 rather than 200. */
const EXPECT_404 = new Set(["/this-page-does-not-exist"]);

const routes = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_ROUTES;

/* Relative luminance, then WCAG contrast ratio. Runs in the page. */
const AUDIT = `(function () {
  const lum = (rgb) => {
    const c = rgb.map((v) => v / 255).map((v) =>
      v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const parse = (s) => (s.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);

  // Only plain opaque rgb() can be used for maths. Anything with alpha — including
  // oklab(... / .85) that Tailwind emits — must be skipped, or a translucent
  // header reads as near-black and produces phantom failures.
  const isOpaque = (c) => {
    if (!c || /transparent/.test(c)) return false;
    const m = c.match(/rgba?\\(([^)]+)\\)/);
    if (m) {
      const parts = m[1].split(/[,\\/]/).map((x) => x.trim());
      if (parts.length > 3 && parseFloat(parts[3]) < 0.999) return false;
      return true;
    }
    const slash = c.match(/\\/\\s*([\\d.]+)\\s*\\)/);
    if (slash && parseFloat(slash[1]) < 0.999) return false;
    return /^rgb\\(/.test(c);
  };

  const bgOf = (el) => {
    let n = el;
    while (n) {
      const c = getComputedStyle(n).backgroundColor;
      if (isOpaque(c)) return parse(c);
      n = n.parentElement;
    }
    return [255, 255, 255];
  };

  const contrast = [];
  document.querySelectorAll("body *").forEach((el) => {
    // The element's OWN text — the only text this element's colour applies
    // to. A descendant with its own colour is visited on its own turn.
    //
    // This used to read el.textContent and skip anything over 140 characters,
    // which was meant to filter out container elements but instead exempted
    // body copy: six elements on the homepage alone, one of them the support
    // band's 194-character lede sitting at 2.55:1. The longest text on a page
    // is the text most worth being able to read, and it was the one thing the
    // check could not see. Reading own text makes the container filter
    // unnecessary, so the cap is gone.
    const ownText = [].slice.call(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join(" ")
      .trim();
    if (!ownText) return;
    const text = ownText;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return;
    if (el.closest("svg") || el.closest('[aria-hidden="true"]')) return;

    const a = lum(parse(cs.color));
    const b = lum(bgOf(el));
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const size = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    if (ratio < need) {
      contrast.push({ text: text.slice(0, 40), ratio: +ratio.toFixed(2), need });
    }
  });

  const levels = [].slice.call(document.querySelectorAll("h1,h2,h3,h4,h5,h6"));
  const jumps = [];
  let prev = 0;
  levels.forEach((h) => {
    const l = +h.tagName[1];
    if (prev && l > prev + 1) jumps.push(\`h\${prev} -> h\${l}: "\${h.textContent.trim().slice(0, 40)}"\`);
    prev = l;
  });

  /*
   * WCAG 2.2 SC 2.5.8 (Target Size, Minimum), implemented as written rather
   * than as a naive "is it 24px tall" check. An undersized target still
   * passes when any of these hold:
   *   - it is visually hidden (a skip link is 1x1 until focused)
   *   - it is a link inline within a sentence (explicit exception)
   *   - spacing: a 24px-diameter circle centred on it does not intersect the
   *     circle of any other target. Stacked footer links ~30px apart pass on
   *     this basis, which is why a height-only check produces false alarms.
   */
  const targets = [].slice.call(document.querySelectorAll("a,button"))
    .map((el) => ({ el, r: el.getBoundingClientRect(), cs: getComputedStyle(el) }))
    .filter((t) => t.r.width > 0 && t.r.height > 0);

  const centre = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

  const smallTargets = targets
    .filter((t) => {
      if (t.r.width <= 1 && t.r.height <= 1) return false;
      if (t.cs.clipPath !== "none" && t.r.width < 2) return false;
      if (t.r.height >= 24 && t.r.width >= 24) return false;

      const inline = t.cs.display === "inline" && t.el.parentElement &&
        t.el.parentElement.textContent.trim() !== t.el.textContent.trim();
      if (inline) return false;

      const c = centre(t.r);
      const crowded = targets.some((o) => {
        if (o.el === t.el) return false;
        const oc = centre(o.r);
        return Math.hypot(c.x - oc.x, c.y - oc.y) < 24;
      });
      return crowded;
    })
    .map((t) => (t.el.textContent || "").trim().slice(0, 30) ||
                t.el.getAttribute("aria-label") || "<unlabelled>");

  const ldBlocks = [].slice.call(document.querySelectorAll('script[type="application/ld+json"]'));

  const jsonld = ldBlocks.map((s) => {
    try {
      const parsed = JSON.parse(s.textContent);
      return (Array.isArray(parsed) ? parsed : [parsed]).map((x) => x["@type"]).join(",");
    } catch {
      return "INVALID-JSON";
    }
  });

  // A JSON-LD block must never contain a literal "<": lib/seo.tsx escapes
  // every one to \u003c precisely so a CMS field containing "</script>"
  // cannot close the block and turn the rest into live markup.
  //
  // Parsing is not enough to catch that. A breakout splits one block into two
  // that both parse cleanly, so the check above stays green while the page is
  // executing injected script -- which is exactly how this shipped unnoticed.
  const ldUnescaped = ldBlocks.filter((s) => (s.textContent || "").includes("<")).length;

  const d = document.documentElement;
  return {
    contrast,
    jumps,
    h1Count: levels.filter((h) => h.tagName === "H1").length,
    overflow: d.scrollWidth - d.clientWidth,
    smallTargets: [...new Set(smallTargets)],
    jsonld,
    ldUnescaped,
    title: document.title,
    canonical: (document.querySelector("link[rel=canonical]") || {}).href || null,
  };
})()`;

// CHROMIUM_PATH lets CI (or a sandbox with a pre-installed browser) point at
// an existing binary instead of downloading one.
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
// One shared context so a login on `desktop` carries its session cookie over
// to `mobile` too — two independent newPage() calls would each get their own
// cookie jar.
/*
 * The scheme under test.
 *
 * `AUDIT_SCHEME=dark npm run audit` runs every check against the dark palette.
 * Set through localStorage rather than Playwright's colorScheme option because
 * that is what the site actually keys on — emulating the OS preference would
 * test the fallback, not a visitor who chose dark.
 */
const scheme = process.env.AUDIT_SCHEME === "dark" ? "dark" : "light";
const context = await browser.newContext();
if (scheme === "dark") {
  // Both area keys. The site and the console keep separate preferences, so
  // writing one key leaves the other area in light — which is how this ran
  // green against a light page while claiming to test dark.
  await context.addInitScript(() => {
    localStorage.setItem("tw_scheme_site", "dark");
    localStorage.setItem("tw_scheme_console", "dark");
  });
}
const desktop = await context.newPage();
// Against `next dev` the first hit on a route compiles it, which can take
// well over a minute. These timeouts are about the harness, not the site.
desktop.setDefaultTimeout(180000);
await desktop.setViewportSize({ width: 1280, height: 1000 });
const mobile = await context.newPage();
await mobile.setViewportSize({ width: 360, height: 800 });

let failures = 0;
const problems = [];
let staffLoggedIn = false;

for (const route of routes) {
  const url = BASE + route;
  let status = 0;

  // Not every /admin route is behind the session. The sign-in, forgot- and
  // reset-password screens all live under it and are reachable by someone who
  // cannot log in — that is their whole purpose — so trying to authenticate
  // first fails and reports a broken page that is fine.
  const PUBLIC_ADMIN = ["/admin/login", "/admin/forgot-password", "/admin/reset-password"];

  if (route.startsWith("/admin") && !PUBLIC_ADMIN.includes(route) && !staffLoggedIn) {
    try {
      await desktop.goto(`${BASE}/admin/login`, { waitUntil: "load", timeout: 180000 });
      await desktop.fill("#email", ADMIN_EMAIL);
      await desktop.fill("#password", ADMIN_PASSWORD);
      await Promise.all([
        desktop.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 180000 }),
        desktop.click('button[type="submit"]'),
      ]);
      staffLoggedIn = true;
    } catch (e) {
      problems.push(`${route}: admin login failed — ${e.message.split("\n")[0]}`);
      failures++;
      continue;
    }
  }

  try {
    const res = await desktop.goto(url, { waitUntil: "load", timeout: 180000 });
    status = res?.status() ?? 0;
    await desktop.waitForTimeout(300);
  } catch (e) {
    problems.push(`${route}: could not load — ${e.message.split("\n")[0]}`);
    failures++;
    continue;
  }

  const r = await desktop.evaluate(AUDIT);

  await mobile.goto(url, { waitUntil: "load", timeout: 180000 });
  await mobile.waitForTimeout(200);
  const mobileOverflow = await mobile.evaluate(
    `(function(){var d=document.documentElement;return d.scrollWidth-d.clientWidth})()`
  );

  const issues = [];
  // A route that is supposed to 404 must 404. Checking it both ways matters:
  // a soft 404 — the not-found page served with a 200 — is the failure mode
  // that gets an error page indexed, and it looks identical in a browser.
  if (EXPECT_404.has(route)) {
    if (status !== 404) issues.push(`expected HTTP 404, got ${status}`);
  } else if (status >= 400) {
    issues.push(`HTTP ${status}`);
  }
  if (r.contrast.length) {
    issues.push(`${r.contrast.length} contrast (worst ${Math.min(...r.contrast.map((c) => c.ratio))}:1 — "${r.contrast[0].text}")`);
  }
  if (r.jumps.length) issues.push(`heading jump: ${r.jumps[0]}`);
  if (r.h1Count !== 1) issues.push(`${r.h1Count} h1 (expected 1)`);
  if (r.overflow > 0) issues.push(`overflow ${r.overflow}px @1280`);
  if (mobileOverflow > 0) issues.push(`overflow ${mobileOverflow}px @360`);
  if (r.smallTargets.length) issues.push(`tap target <24px: ${r.smallTargets[0]}`);
  if (!r.canonical) issues.push("no canonical");
  if (r.jsonld.includes("INVALID-JSON")) issues.push("malformed JSON-LD");
  if (r.ldUnescaped) issues.push(`unescaped < in ${r.ldUnescaped} JSON-LD block(s) — script-breakout risk`);

  const label = route.padEnd(38);
  if (issues.length) {
    failures++;
    problems.push(`${route}\n    ${issues.join("\n    ")}`);
    console.log(`FAIL  ${label} ${issues.length} issue(s)`);
  } else {
    console.log(`ok    ${label} ${r.jsonld.join(" | ") || "no structured data"}`);
  }
}

await browser.close();

console.log("");
if (failures) {
  console.log(`${failures} of ${routes.length} route(s) have problems:\n`);
  problems.forEach((p) => console.log("  " + p + "\n"));
  process.exit(1);
}
console.log(`All ${routes.length} routes clean.`);
