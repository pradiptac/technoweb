/**
 * Speed measurement — the numbers `audit.mjs` deliberately does not collect.
 *
 *   npm run build && npm run start          # never `next dev`: it serves
 *                                           # unbundled chunks and every
 *                                           # number below lies
 *   npm run perf                            # the default route list
 *   npm run perf -- --routes=/,/blog        # specific routes
 *   npm run perf -- --json                  # machine-readable to stdout
 *   npm run perf -- --admin                 # add the console (needs creds)
 *   BASE=http://localhost:3001 npm run perf
 *
 * Per route it navigates twice on one browser context — **cold** (first hit,
 * which for an ISR route is the render that fills the cache) and **warm**
 * (second hit, which should be served from it) — and records, for each:
 *
 *   status        HTTP status of the document
 *   cache         the `x-nextjs-cache` header: HIT / MISS / STALE, or `-` when
 *                 Next did not send one. **That header is the ISR proof.** A
 *                 route that never sends it is rendered on every request,
 *                 whatever the fetches inside it are cached as.
 *   ttfb          navigation `responseStart`, ms — the server's share
 *   fcp / lcp     first and largest contentful paint, ms
 *   cls           cumulative layout shift, unitless
 *   lcpEl         what the LCP element was (tag, and the image URL if it was
 *                 one, with its encoded size), because "LCP 2.4s" is a number
 *                 and "a 3.6MB JPEG" is a cause
 *   req / kb      requests finished and encoded bytes received, total and by
 *                 type — script bytes are the client bundle, image bytes are
 *                 what the optimiser is (or is not) doing
 *
 * It writes `perf-<timestamp>.json` beside the table so two runs can be
 * diffed, and prints a table. It does not fail on anything: it is a ruler,
 * not a gate. Turn a figure into a gate here once there is a baseline to gate
 * against.
 *
 * Detail pages are discovered rather than hard-coded, the way `audit.mjs`
 * does it — ids and slugs come from the seeder and change with every
 * `migrate:fresh`.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { BASE, signInAsStaff } from "./shared.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

/*
 * The public routes that matter for speed: the landing page, one index and one
 * detail per content type, the shop, and the two deliberately-dynamic screens
 * (search, and a filtered listing) so the cost of "dynamic" is visible beside
 * the cost of "cached".
 */
const DEFAULT_ROUTES = [
  "/", "/solutions", "/solutions/networking", "/services/web-hosting",
  "/industries/manufacturing", "/products", "/products/switches",
  "/blog", "/case-studies", "/knowledge-base", "/about", "/contact",
  "/careers", "/brands", "/store", "/search?q=switch",
];

/** One record per index, found by opening the index and taking the first link. */
const DISCOVER = [
  { from: "/blog", match: /^\/blog\/[^/]+$/ },
  { from: "/products/switches", match: /^\/products\/(?!switches$)[^/]+$/ },
  { from: "/case-studies", match: /^\/case-studies\/[^/]+$/ },
  { from: "/knowledge-base", match: /^\/knowledge-base\/[^/]+$/ },
  { from: "/store", match: /^\/store\/products\/[^/]+$/ },
  { from: "/store", match: /^\/store\/categories\/[^/]+$/ },
];

const ADMIN_ROUTES = ["/admin", "/admin/tickets", "/admin/blog", "/admin/media", "/admin/settings"];

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
/**
 * A fresh context per route, so "cold" means cold.
 *
 * The first cut shared one context across the run, and the discovery
 * navigations that ran before any measurement had already put every
 * `_next/static` chunk into the browser cache — so the homepage reported
 * 0KB of JavaScript. A per-route context has an empty HTTP cache; the warm
 * hit on the same context is then the honest "second visit" figure.
 */
async function newContext() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });

  /*
   * An audit is not a first visit: the first-visit splash and the consent
   * banner would otherwise sit in front of the LCP element. Same keys
   * `audit.mjs` sets.
   */
  await context.addInitScript(() => {
    try {
      sessionStorage.setItem("tw_splash", "1");
      localStorage.setItem("tw_scheme_site", "light");
      localStorage.setItem("tw_scheme_console", "light");
    } catch {}
  });

  /*
   * The paint observers have to exist before the page starts painting, so they
   * are installed from an init script and read back after the page settles.
   * `buffered: true` catches entries emitted before `observe()` ran, but the
   * script still has to run before the first `largest-contentful-paint` entry
   * is *dropped* — the buffer is bounded — hence the init script.
   */
  await context.addInitScript(() => {
    const m = (window.__perf = { lcp: null, lcpEl: null, cls: 0, fcp: null });

    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          m.lcp = e.startTime;
          const el = e.element;
          m.lcpEl = el
            ? {
                tag: el.tagName.toLowerCase(),
                src: el.currentSrc || el.src || null,
                text: el.tagName === "IMG" ? null : (el.textContent || "").trim().slice(0, 60),
              }
            : null;
        }
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {}

    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) m.cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    } catch {}

    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (e.name === "first-contentful-paint") m.fcp = e.startTime;
      }).observe({ type: "paint", buffered: true });
    } catch {}
  });

  const page = await context.newPage();
  page.setDefaultTimeout(120000);

  return { context, page };
}

/** Bucket a Playwright resourceType into the handful worth reporting. */
function bucket(type) {
  switch (type) {
    case "document": return "html";
    case "script": return "js";
    case "stylesheet": return "css";
    case "image": return "img";
    case "font": return "font";
    case "fetch": case "xhr": return "fetch";
    default: return "other";
  }
}

/**
 * One navigation, measured.
 *
 * Request sizes are summed from `requestfinished` rather than from the
 * resource timing API because the latter reports `transferSize` as 0 for
 * anything cross-origin without `Timing-Allow-Origin` — which is every image
 * the API serves.
 */
async function measure(page, url) {
  const sizes = {};
  const counts = {};
  let total = 0;
  let count = 0;
  const imageSizes = new Map();

  const onFinished = async (req) => {
    try {
      const s = await req.sizes();
      const bytes = s.responseBodySize + s.responseHeadersSize;
      const b = bucket(req.resourceType());
      sizes[b] = (sizes[b] ?? 0) + bytes;
      counts[b] = (counts[b] ?? 0) + 1;
      total += bytes;
      count += 1;
      if (b === "img") imageSizes.set(req.url(), s.responseBodySize);
    } catch {
      // A request whose sizes cannot be read (aborted, cached in a way the
      // protocol will not account for) is counted as nothing rather than
      // ending the run.
    }
  };

  page.on("requestfinished", onFinished);

  const started = Date.now();
  const response = await page.goto(url, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  // LCP is final once the page stops changing; give lazy work a beat to land.
  await page.waitForTimeout(500);
  const wall = Date.now() - started;

  page.off("requestfinished", onFinished);

  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0];
    return n
      ? { ttfb: n.responseStart, dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd }
      : { ttfb: null, dcl: null, load: null };
  });
  const paint = await page.evaluate(() => window.__perf);

  const lcpEl = paint.lcpEl
    ? { ...paint.lcpEl, bytes: paint.lcpEl.src ? imageSizes.get(paint.lcpEl.src) ?? null : null }
    : null;

  return {
    status: response?.status() ?? null,
    cache: response?.headers()["x-nextjs-cache"] ?? "-",
    ttfb: round(nav.ttfb),
    fcp: round(paint.fcp),
    lcp: round(paint.lcp),
    cls: paint.cls == null ? null : Math.round(paint.cls * 1000) / 1000,
    dcl: round(nav.dcl),
    load: round(nav.load),
    wall,
    lcpEl,
    requests: count,
    bytes: total,
    byType: Object.fromEntries(
      Object.keys(sizes).sort().map((k) => [k, { requests: counts[k], bytes: sizes[k] }]),
    ),
  };
}

function round(n) {
  return n == null ? null : Math.round(n);
}

async function discover(page) {
  const found = [];

  for (const { from, match } of DISCOVER) {
    try {
      await page.goto(BASE + from, { waitUntil: "load" });
      const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
      const hit = hrefs.find((h) => h && match.test(h));

      if (hit) found.push(hit);
      else console.log(`  (nothing to discover under ${from} for ${match})`);
    } catch (e) {
      console.log(`  (discovery failed for ${from}: ${e.message.split("\n")[0]})`);
    }
  }

  return found;
}

const explicit = value("routes");
let routes;
let staffCookies = null;

{
  const { context, page } = await newContext();

  if (explicit) {
    routes = explicit.split(",").map((r) => r.trim()).filter(Boolean);
  } else {
    console.log("Discovering detail routes…");
    routes = [...DEFAULT_ROUTES, ...(await discover(page))];
  }

  if (flag("admin")) {
    if (!process.env.ADMIN_LOGIN_EMAIL) {
      console.log("--admin needs ADMIN_LOGIN_EMAIL / ADMIN_LOGIN_PASSWORD; skipping the console.");
    } else {
      // Signed in once; the session cookie is copied into each route's context.
      await signInAsStaff(page);
      staffCookies = await context.cookies();
      routes.push(...ADMIN_ROUTES);
    }
  }

  await context.close();
}

const results = [];

for (const route of routes) {
  const url = BASE + route;
  process.stdout.write(`${route} … `);

  const { context, page } = await newContext();
  if (staffCookies) await context.addCookies(staffCookies);

  try {
    const cold = await measure(page, url);
    const warm = await measure(page, url);
    results.push({ route, cold, warm });
    console.log(`${cold.status} ${cold.cache}/${warm.cache}  ttfb ${cold.ttfb}/${warm.ttfb}ms  lcp ${cold.lcp ?? "-"}/${warm.lcp ?? "-"}ms  ${kb(cold.bytes)}  js ${kb(cold.byType.js?.bytes)}`);
  } catch (e) {
    results.push({ route, error: e.message.split("\n")[0] });
    console.log(`FAILED: ${e.message.split("\n")[0]}`);
  } finally {
    await context.close();
  }
}

await browser.close();

function kb(n) {
  return n == null ? "-" : `${Math.round(n / 1024)}KB`;
}

/* ---- Report ------------------------------------------------------------ */

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = value("out") ?? `perf-${stamp}.json`;
const report = { base: BASE, at: new Date().toISOString(), results };

writeFileSync(out, JSON.stringify(report, null, 2));

if (flag("json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const pad = (s, n, right = false) => {
    s = String(s ?? "-");
    return right ? s.padStart(n) : s.padEnd(n);
  };
  const header = [
    pad("route", 34), pad("st", 3), pad("cache c/w", 11),
    pad("ttfb c", 7, true), pad("ttfb w", 7, true),
    pad("lcp c", 7, true), pad("lcp w", 7, true), pad("cls", 6, true),
    pad("req", 4, true), pad("total", 8, true), pad("js", 7, true), pad("img", 8, true),
    "  lcp element",
  ].join(" ");

  console.log("");
  console.log(`Measured against ${BASE}`);
  console.log(header);
  console.log("-".repeat(header.length));

  for (const r of results) {
    if (r.error) {
      console.log(`${pad(r.route, 34)} FAILED ${r.error}`);
      continue;
    }
    const { cold: c, warm: w } = r;
    const el = c.lcpEl
      ? `${c.lcpEl.tag}${c.lcpEl.src ? ` ${shortUrl(c.lcpEl.src)}${c.lcpEl.bytes != null ? ` (${kb(c.lcpEl.bytes)})` : ""}` : c.lcpEl.text ? ` "${c.lcpEl.text}"` : ""}`
      : "-";
    console.log([
      pad(r.route, 34), pad(c.status, 3), pad(`${c.cache}/${w.cache}`, 11),
      pad(c.ttfb, 7, true), pad(w.ttfb, 7, true),
      pad(c.lcp, 7, true), pad(w.lcp, 7, true), pad(c.cls, 6, true),
      pad(c.requests, 4, true), pad(kb(c.bytes), 8, true),
      pad(kb(c.byType.js?.bytes), 7, true), pad(kb(c.byType.img?.bytes), 8, true),
      `  ${el}`,
    ].join(" "));
  }

  console.log("");
  console.log(`Written to ${out}. Times in ms; sizes are encoded bytes received on the cold hit.`);
  console.log("cache: the x-nextjs-cache header on the cold/warm document — a route that never sends one is rendered on every request.");
}

function shortUrl(u) {
  try {
    const x = new URL(u);
    if (x.pathname === "/_next/image") {
      const inner = x.searchParams.get("url") ?? "";
      return `/_next/image(${inner.split("/").pop()?.split("?")[0]} w=${x.searchParams.get("w")})`;
    }
    return x.pathname.split("/").pop()?.split("?")[0] ?? u;
  } catch {
    return u;
  }
}
