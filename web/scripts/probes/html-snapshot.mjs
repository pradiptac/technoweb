import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { BASE } from "../shared.mjs";

/**
 * Snapshots the served HTML of the public site so two builds can be diffed.
 *
 *   npm run build && npm run start          # never against `next dev`
 *   node scripts/probes/html-snapshot.mjs <out-dir>
 *   diff -r <before> <after>
 *
 * Written for the site-themes work (2026-09-16), whose first step moves the
 * marketing chrome, the homepage and two primitives into a `classic` theme
 * and must change nothing a visitor receives. An audit measures what is on
 * the page; only a diff of the markup itself proves the page is the same
 * markup. Each route's HTML is normalised — anything that differs between two
 * builds of identical source is stripped — and written to one file, so
 * `diff -r` names the route and the line.
 *
 * What is normalised, and why each is noise rather than a change:
 * - `<script>` bodies: the RSC payload carries hashed chunk ids.
 * - `/_next/static/<hash>/` and `?v=<n>`: build ids and media versions.
 * - `<link rel="preload">`/`modulepreload` with hashed hrefs, for the same
 *   reason; the order of those links is also build-dependent.
 * - `data-theme="…"`: the one attribute step 1 is allowed to add.
 * - The CSRF-free `<input type="hidden" name="$ACTION_…">` ids that Server
 *   Actions stamp, which hash the action's source location.
 * - Whitespace runs, so a reformatted attribute list does not read as a
 *   change.
 *
 * Routes: `perf.mjs`'s list plus one discovered detail per index, plus the
 * CMS page, the company pages, search, and both not-found shapes (the
 * marketing group's and the root's).
 */
const out = process.argv[2];
if (!out) {
  console.error("usage: node scripts/probes/html-snapshot.mjs <out-dir>");
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const ROUTES = [
  "/", "/solutions", "/solutions/networking", "/services", "/services/web-hosting",
  "/industries", "/industries/manufacturing", "/products", "/products/switches",
  "/blog", "/case-studies", "/knowledge-base", "/about", "/contact", "/careers",
  "/brands", "/locations", "/store", "/cart", "/search?q=switch", "/privacy",
  "/team", "/clients", "/certifications", "/support", "/resources",
  "/no-such-page", "/a/b/c",
];
const DISCOVER = [
  { from: "/blog", match: /^\/blog\/[^/]+$/ },
  { from: "/products/switches", match: /^\/products\/(?!switches$)[^/]+$/ },
  { from: "/case-studies", match: /^\/case-studies\/[^/]+$/ },
  { from: "/knowledge-base", match: /^\/knowledge-base\/[^/]+$/ },
  { from: "/careers", match: /^\/careers\/[^/]+$/ },
  { from: "/store", match: /^\/store\/products\/[^/]+$/ },
  { from: "/store", match: /^\/store\/categories\/[^/]+$/ },
];

const normalise = (html) => html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "<script/>")
  .replace(/<link[^>]*rel="(?:module)?preload"[^>]*>/g, "")
  .replace(/\/_next\/static\/[^/"]+\//g, "/_next/static/BUILD/")
  .replace(/\?v=\d+/g, "?v=N")
  .replace(/ data-theme="[^"]*"/g, "")
  .replace(/\$ACTION_[A-Za-z0-9_:]+/g, "$ACTION")
  .replace(/\s+/g, " ")
  .replace(/>\s*</g, ">\n<");

const browser = await chromium.launch();
const page = await browser.newPage();
const routes = [...ROUTES];
for (const { from, match } of DISCOVER) {
  await page.goto(BASE + from, { waitUntil: "load", timeout: 120000 });
  const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
  const hit = hrefs.find((h) => h && match.test(h));
  if (hit) routes.push(hit);
  else console.log(`  (nothing to discover under ${from} for ${match})`);
}
await browser.close();

let n = 0;
for (const route of routes) {
  const res = await fetch(BASE + route, { headers: { Accept: "text/html" } });
  const html = await res.text();
  const name = route === "/" ? "index" : route.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "_");
  writeFileSync(join(out, `${name}.html`), `<!-- ${route} ${res.status} -->\n${normalise(html)}`);
  n++;
}
console.log(`${n} routes written to ${out}`);
