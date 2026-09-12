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
 *
 * Two kinds of URL are collected from each page. The `/_next/image` URLs in
 * the markup are exactly what the browser will ask for. The raw asset URLs
 * in the RSC payload cover what the markup cannot show: a `fade` or `zoom`
 * slider renders only its current slide, so slides two onwards are on the
 * page as data and not as `<img>`, and the first pass of this script warmed
 * nothing for them — `/store`'s fourth slide answered 504 under the audit
 * with the rest of the site warm. For those, every device width is fetched,
 * which is the whole srcset a `fill` image carries.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";

const DEFAULT_ROUTES = [
  "/", "/solutions", "/solutions/networking", "/services", "/industries",
  "/products", "/products/switches", "/blog", "/case-studies", "/knowledge-base",
  "/about", "/team", "/clients", "/certifications", "/store", "/careers", "/contact",
];

// Mirrors `images.deviceSizes` in next.config.ts — the widths a `fill`
// image's srcset offers, and so the only ones a raw URL can be asked for at.
const DEVICE_SIZES = [640, 828, 1200, 1920, 2560];
const RASTER = /\.(?:jpe?g|png|webp|gif|avif)(?:\?v=\d+)?$/i;

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
    .map((m) => m[0].replace(/&amp;/g, "&"));

  // Raw raster URLs in the serialised props (JSON-escaped, so a `\"` ends
  // one), for the pictures the page holds but has not drawn yet.
  const raw = [...html.matchAll(/https?:\/\/[^"'\s\\]+\/storage\/[^"'\s\\]+/g)]
    .map((m) => m[0].replace(/\\u0026/g, "&"))
    .filter((u) => RASTER.test(u));
  for (const src of new Set(raw)) {
    for (const w of DEVICE_SIZES) urls.push(`/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=75`);
  }

  const fresh = urls.filter((u) => !seen.has(u) && seen.add(u));

  process.stdout.write(`${route}: ${fresh.length} variants … `);

  for (const u of fresh) {
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
