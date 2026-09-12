/**
 * Warm the image optimiser: fetch every `/_next/image` variant the given
 * routes reference, one at a time.
 *
 *   npm run warm-images                        # the perf route list
 *   npm run warm-images -- /,/store,/blog      # specific routes
 *   BASE=https://www.technoware.in npm run warm-images
 *
 * Two reasons to run it. After a deploy, so the first visitor to each page
 * does not pay the encode for every width of every picture on it — the
 * optimiser caches a variant for `minimumCacheTTL` once it exists, and until
 * then each is a fetch from the API and a WebP encode on this box. And
 * before `npm run audit` or `npm run perf` against a development API: PHP's
 * built-in server answers one request at a time, so a page that asks for
 * seventy cold variants at once queues them behind each other until the
 * optimiser's seven-second upstream timeout fires and reports 504 — which is
 * the dev server, not the site, and which warming sequentially avoids.
 *
 * Sequential on purpose: the point is not to be fast, it is to never be the
 * burst this exists to prevent.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";

const DEFAULT_ROUTES = [
  "/", "/solutions", "/solutions/networking", "/services", "/industries",
  "/products", "/products/switches", "/blog", "/case-studies", "/knowledge-base",
  "/about", "/team", "/clients", "/certifications", "/store", "/careers", "/contact",
];

const arg = process.argv[2];
const routes = arg ? arg.split(",").map((r) => r.trim()).filter(Boolean) : DEFAULT_ROUTES;

const seen = new Set();
let ok = 0;
let failed = 0;

for (const route of routes) {
  let html;
  try {
    html = await (await fetch(BASE + route, { headers: { Accept: "text/html" } })).text();
  } catch (e) {
    console.log(`${route}: could not load (${e.message})`);
    continue;
  }

  // Every optimiser URL on the page: `src` and each `srcset` candidate, and
  // the preload links. HTML-escaped ampersands are unescaped.
  const urls = [...html.matchAll(/\/_next\/image\?[^"'\s,]+/g)]
    .map((m) => m[0].replace(/&amp;/g, "&"))
    .filter((u) => !seen.has(u) && seen.add(u));

  process.stdout.write(`${route}: ${urls.length} variants … `);

  for (const u of urls) {
    try {
      const res = await fetch(BASE + u, { headers: { Accept: "image/webp,image/*,*/*" } });
      await res.arrayBuffer();
      if (res.ok) ok++;
      else { failed++; console.log(`\n  ${res.status} ${decodeURIComponent(u).slice(0, 120)}`); }
    } catch (e) {
      failed++;
      console.log(`\n  failed ${decodeURIComponent(u).slice(0, 120)}: ${e.message}`);
    }
  }

  console.log("done");
}

console.log(`\n${ok} variants warmed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
