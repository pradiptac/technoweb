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
  "/careers",
  // The programmatic landing pages. The two indexes render an empty
  // state with nothing published, so they are safe to audit on any install;
  // /brands/cisco exists only when a landing page has been published for it,
  // which is why it is not in the default list.
  "/brands", "/locations",
  "/portal/login", "/portal/register", "/portal/register/check-your-email",
  "/portal/verify-email", "/admin/login",
  // The shop. `/checkout` needs a basket, which PREPARE fills first.
  "/store", "/cart", "/checkout",
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
  "/admin/jobs", "/admin/jobs/new", "/admin/jobs/reference", "/admin/applications",
  "/admin/knowledge-base", "/admin/case-studies", "/admin/pages", "/admin/faqs",
  "/admin/media", "/admin/products", "/admin/products/new", "/admin/product-categories",
  "/admin/brands", "/admin/solutions", "/admin/services", "/admin/industries",
  "/admin/sliders", "/admin/forms", "/admin/seo", "/admin/redirects",
  "/admin/landing-pages", "/admin/landing-pages/opportunities",
  "/admin/locations", "/admin/locations/new",
  "/admin/users", "/admin/settings", "/admin/profile",
  // The store, which is its own catalogue and its own role.
  "/admin/store/products", "/admin/store/products/new",
  "/admin/store/categories", "/admin/store/categories/new",
  "/admin/store/orders", "/admin/store/coupons", "/admin/store/coupons/new",
  // The rest of the create screens. Eight were missing, so two thirds of the
  // "new record" forms were never looked at.
  "/admin/knowledge-base/new", "/admin/case-studies/new", "/admin/pages/new",
  "/admin/product-categories/new", "/admin/brands/new", "/admin/solutions/new",
  "/admin/services/new", "/admin/industries/new", "/admin/sliders/new",
  "/admin/forms/new", "/admin/faqs/new", "/admin/redirects/new", "/admin/users/new",
];

/*
 * Screens that only exist for a record, found by opening the index and taking
 * the first row.
 *
 * They cannot be hard-coded: ids and slugs come from the seeder and change
 * with every `migrate:fresh`, so a fixed list rots into a wall of 404s that
 * everyone learns to ignore. Discovery keeps them honest.
 *
 * This is the biggest hole the audit had. Every CMS *edit* form was
 * unaudited — the tallest, most complex screens in the console, with tabbed
 * panels and repeaters — as was the ticket detail, which is the heart of the
 * product. A missing index page is obvious; a missing detail page is not.
 */
const DISCOVER = [
  { from: "/blog", match: /^\/blog\/[^/]+$/ },
  { from: "/careers", match: /^\/careers\/[^/]+$/ },
  { from: "/case-studies", match: /^\/case-studies\/[^/]+$/ },
  { from: "/knowledge-base", match: /^\/knowledge-base\/[^/]+$/ },
  { from: "/admin/tickets", match: /^\/admin\/tickets\/[^/]+$/, admin: true },
  { from: "/admin/customers", match: /^\/admin\/customers\/\d+$/, admin: true },
  { from: "/admin/blog", match: /^\/admin\/blog\/\d+$/, admin: true },
  { from: "/admin/jobs", match: /^\/admin\/jobs\/\d+$/, admin: true },
  { from: "/admin/applications", match: /^\/admin\/applications\/\d+$/, admin: true },
  { from: "/admin/knowledge-base", match: /^\/admin\/knowledge-base\/\d+$/, admin: true },
  { from: "/admin/case-studies", match: /^\/admin\/case-studies\/\d+$/, admin: true },
  { from: "/admin/pages", match: /^\/admin\/pages\/\d+$/, admin: true },
  { from: "/admin/products", match: /^\/admin\/products\/\d+$/, admin: true },
  { from: "/admin/product-categories", match: /^\/admin\/product-categories\/\d+$/, admin: true },
  { from: "/admin/brands", match: /^\/admin\/brands\/\d+$/, admin: true },
  { from: "/admin/solutions", match: /^\/admin\/solutions\/\d+$/, admin: true },
  { from: "/admin/services", match: /^\/admin\/services\/\d+$/, admin: true },
  { from: "/admin/industries", match: /^\/admin\/industries\/\d+$/, admin: true },
  { from: "/admin/sliders", match: /^\/admin\/sliders\/\d+$/, admin: true },
  { from: "/admin/forms", match: /^\/admin\/forms\/\d+$/, admin: true },
  { from: "/admin/forms", match: /^\/admin\/forms\/\d+\/submissions$/, admin: true },
  { from: "/admin/faqs", match: /^\/admin\/faqs\/\d+$/, admin: true },
  { from: "/admin/redirects", match: /^\/admin\/redirects\/\d+$/, admin: true },
  // The edit form is where the quality gate is read and acted on, so it is
  // the screen of this pair most worth auditing — and its id comes from the
  // seeder, so it has to be discovered rather than named.
  { from: "/admin/landing-pages", match: /^\/admin\/landing-pages\/\d+$/, admin: true },
  { from: "/admin/locations", match: /^\/admin\/locations\/\d+$/, admin: true },
  { from: "/admin/users", match: /^\/admin\/users\/\d+$/, admin: true },
  { from: "/admin/store/products", match: /^\/admin\/store\/products\/\d+$/, admin: true },
  { from: "/admin/store/categories", match: /^\/admin\/store\/categories\/\d+$/, admin: true },
  { from: "/admin/store/orders", match: /^\/admin\/store\/orders\/[A-Z0-9-]+$/, admin: true },
  { from: "/admin/store/coupons", match: /^\/admin\/store\/coupons\/\d+$/, admin: true },
  // The code inventory hangs off a product, so it is reached the way a person
  // reaches it: open the first product, then its codes.
  { from: "/admin/store/products", match: /^\/admin\/store\/products\/\d+$/, admin: true, suffix: "/codes" },
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

const routes = process.argv.slice(2).length ? process.argv.slice(2) : [...DEFAULT_ROUTES];

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
    // The page's own canvas, not white. body carries
    // background: var(--color-page), which inverts, so hard-coding white here
    // measured every alpha-composited element against the wrong backdrop the
    // moment the dark scheme existed. No backticks in this comment: the whole
    // probe is a template literal.
    const root = getComputedStyle(document.body).backgroundColor;
    return isOpaque(root) ? parse(root) : [255, 255, 255];
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
/*
 * What the Content-Security-Policy would have blocked, per document.
 *
 * The policy in `next.config.ts` ships mostly as Report-Only, which protects
 * nobody on its own — a header nothing checks is one that drifts the first
 * time an integration is added. Collecting the violations turns it into a
 * claim: 91 routes reporting nothing is evidence it can be enforced, and a
 * newly added script host shows up as a failing route rather than as a line in
 * a log nobody reads.
 *
 * A Report-Only violation is a `securitypolicyviolation` event on the
 * document, not a console error, so it has to be listened for. Registered on
 * the *context* and therefore exactly once: `addInitScript` accumulates, so
 * the same registration inside the route loop would install a fresh listener
 * per route and report each violation as many times as routes already visited.
 */
await context.addInitScript(() => {
  globalThis.__cspSeen = [];
  document.addEventListener("securitypolicyviolation", (e) => {
    globalThis.__cspSeen.push(`${e.effectiveDirective} blocked ${String(e.blockedURI).slice(0, 80)}`);
  });
});

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

/**
 * Switch a sign-in screen to its password form.
 *
 * A one-time code is the default way in now, so the first thing on both login
 * screens is an address field and a "email me a code" button -- and a run that
 * simply filled `#password` timed out for three minutes against a field that
 * was not there, then reported the failure as "discovery failed" on an
 * unrelated route.
 *
 * A browser check cannot use the code path: reading the code means reading the
 * mailbox. So it presses the switch and signs in the way it always did, which
 * still exercises the screen it lands on. If the button is absent -- an
 * install with `password_login_enabled` off -- there is nothing to press and
 * nothing this can do about it, so it says so rather than timing out.
 */
async function switchToPasswordForm(page) {
  const toPassword = page.locator('button:has-text("Use your password instead")');

  if (await toPassword.count()) {
    await toPassword.first().click();
    await page.waitForSelector("#password", { timeout: 15000 });

    return true;
  }

  return (await page.locator("#password").count()) > 0;
}

/**
 * Drive the real sign-in form, once.
 *
 * Deliberately the form rather than an injected cookie: it means the login
 * screen is exercised on every run, and a broken one fails here instead of
 * showing up as two dozen unrelated route failures.
 */
/**
 * Routes that need something to exist before they can be looked at.
 *
 * `/checkout` redirects to an empty basket, which is correct behaviour and
 * makes the most important form on the site unauditable — a checkout is where
 * a contrast failure or a 360px overflow costs a sale rather than a
 * compliment. So the audit fills a basket first, the way a person would: open
 * the shop, open the first product, press Add to basket.
 *
 * Done through the real screens rather than by writing a cookie, because that
 * exercises the add-to-basket path on every run as a side effect — the same
 * argument the sign-in is driven through its own form rather than injected.
 *
 * A shop with nothing in it simply cannot prepare, and says so rather than
 * failing: an install with no products is a real state, not a broken one.
 */
const PREPARE = {
  "/checkout": async (page) => {
    await page.goto(`${BASE}/store`, { waitUntil: "load", timeout: 180000 });

    const card = page.locator("article a").first();

    if (await card.count() === 0) return "the store has nothing in it";

    await card.click();
    await page.waitForURL(/\/store\/products\//, { timeout: 60000 });

    const add = page.locator('button:has-text("Add to basket")');

    if (await add.count() === 0 || await add.isDisabled()) return "nothing in the store is in stock";

    await add.click();
    await page.waitForTimeout(1500);

    /*
      Confirmed rather than assumed.

      `/checkout` redirects to `/cart` when the basket is empty, so a prepare
      step that quietly failed would leave the audit reporting "ok /checkout"
      about a page it never saw — the exact shape of a check that stages its own
      trigger and proves nothing. So the basket is read back, and a failure
      skips the route loudly instead.
    */
    await page.goto(`${BASE}/cart`, { waitUntil: "load", timeout: 60000 });

    if (await page.locator("text=/basket is empty/i").count() > 0) {
      return "the basket would not fill";
    }

    return null;
  },
};

async function signIn() {
  if (staffLoggedIn) return;

  await desktop.goto(`${BASE}/admin/login`, { waitUntil: "load", timeout: 180000 });
  await switchToPasswordForm(desktop);
  await desktop.fill("#email", ADMIN_EMAIL);
  await desktop.fill("#password", ADMIN_PASSWORD);
  await Promise.all([
    desktop.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 180000 }),
    desktop.click('button[type="submit"]'),
  ]);

  staffLoggedIn = true;
}

/**
 * Wait until the page has stopped restyling itself.
 *
 * Against `next dev` a route's CSS can arrive well after first paint, so a
 * computed style read too early is the *previous* stylesheet's answer. The 404
 * page's cards measured pure white 300ms in -- while `data-scheme` already
 * said "dark" and the canvas behind them was already correct -- and the audit
 * duly reported fourteen contrast failures against a page that is flawless in
 * a production build. Every one was a lie, and an audit that cries wolf is one
 * whose real findings get waved away. Two earlier "intermittent dark
 * failures", on /about and /search, were the same thing.
 *
 * Watching one token was not enough, precisely because the canvas settles
 * before the route chunk does. So this samples the computed background of a
 * spread of real elements and waits for two consecutive identical readings:
 * whatever is still arriving, it has stopped changing anything visible.
 *
 * Bounded, and a timeout is not fatal -- a page that never settles is still
 * audited, because calling it unmeasurable would hide whatever else is wrong
 * with it.
 */
async function settle(page) {
  // In dev the stylesheets are injected as route chunks arrive, so the thing
  // to wait for is the network going quiet. Bounded and best-effort: a page
  // with a long-poll open never reaches idle, and that must not stall a run.
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  try {
    await page.waitForFunction(() => {
      const sample = [].slice
        .call(document.querySelectorAll("body *"), 0, 400)
        .map((el) => {
          const cs = getComputedStyle(el);
          return cs.backgroundColor + "|" + cs.color;
        })
        .join(",");

      const settled = window.__auditLastSample === sample;
      window.__auditLastSample = sample;

      return settled;
    }, { timeout: 6000, polling: 150 });
  } catch {
    // Fall through and measure anyway.
  } finally {
    await page.evaluate(() => { delete window.__auditLastSample; }).catch(() => {});
  }
}


/**
 * Turn each entry in DISCOVER into one real route, by opening the index and
 * taking the first link that looks like a record.
 *
 * A discovery that finds nothing is announced rather than skipped quietly. An
 * empty index is a legitimate answer -- a fresh install has no redirects --
 * but so is "this index stopped rendering links", and from a route list that
 * simply gets shorter the two are indistinguishable.
 */
async function discover() {
  const found = [];

  for (const { from, match, admin, suffix } of DISCOVER) {
    try {
      if (admin) await signIn();
      await desktop.goto(BASE + from, { waitUntil: "load", timeout: 180000 });
      await desktop.waitForTimeout(250);

      const href = await desktop.evaluate((pattern) => {
        const re = new RegExp(pattern);
        for (const a of document.querySelectorAll("a[href]")) {
          const path = a.getAttribute("href").split("?")[0].split("#")[0];
          if (re.test(path)) return path;
        }
        return null;
      }, match.source);

      if (href) {
        /*
          `suffix` reaches a screen that hangs off a record rather than being
          the record — the code inventory under a product. Discovered the way a
          person reaches it: find the product, then append.
        */
        const route = suffix ? href + suffix : href;

        if (!found.includes(route)) found.push(route);
      } else {
        console.log(`note  ${from.padEnd(38)} nothing to audit (index has no record links)`);
      }
    } catch (e) {
      console.log(`note  ${from.padEnd(38)} discovery failed: ${e.message.split("\n")[0]}`);
    }
  }

  return found;
}

// Only when running the default list. Naming routes on the command line means
// asking for those routes and nothing else.
if (!process.argv.slice(2).length) {
  const discovered = await discover();
  if (discovered.length) {
    console.log(`note  ${String(discovered.length).padStart(2)} record route(s) discovered\n`);
    routes.push(...discovered);
  }
}

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
      await signIn();
    } catch (e) {
      problems.push(`${route}: admin login failed — ${e.message.split("\n")[0]}`);
      failures++;
      continue;
    }
  }

  if (PREPARE[route]) {
    const why = await PREPARE[route](desktop).catch((e) => e.message.split("\n")[0]);

    if (why) {
      console.log(`skip  ${route.padEnd(38)} ${why}`);
      continue;
    }
  }

  try {
    const res = await desktop.goto(url, { waitUntil: "load", timeout: 180000 });
    status = res?.status() ?? 0;
    await desktop.waitForTimeout(300);
    await settle(desktop);
  } catch (e) {
    problems.push(`${route}: could not load — ${e.message.split("\n")[0]}`);
    failures++;
    continue;
  }

  const r = await desktop.evaluate(AUDIT);

  await mobile.goto(url, { waitUntil: "load", timeout: 180000 });
  await mobile.waitForTimeout(200);
  await settle(mobile);
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

  const csp = [...new Set(await desktop.evaluate("globalThis.__cspSeen || []"))];
  if (csp.length) issues.push(`CSP would block: ${csp.slice(0, 3).join("; ")}`);

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
