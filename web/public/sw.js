/*
 * The site's one service worker (2026-10-05, docs/pwa.md).
 *
 * One worker, because a scope has one: the push worker was registered at "/"
 * and a second script at "/" would replace it, taking every browser's push
 * subscription with it. So this imports the push handlers and adds the
 * installable-app half beside them; `lib/push-client.ts` registers this file
 * too.
 *
 * The query string is the configuration, because a static file cannot read
 * the settings and a different URL is what makes the browser install a new
 * version:
 *   pwa=1  cache and serve offline (the setting is on)
 *   pwa=0  push only; every cache this worker made is deleted
 *   v=…    the application version, so a release replaces the static cache
 *
 * What it caches, and what it never touches:
 *   /_next/static/*   cache first — the file names are content hashes
 *   /_next/image, /storage/*, fonts   served from cache, refreshed behind
 *   a page navigation network first; the copy is kept for offline, and the
 *                     offline page is the answer when there is neither
 *   anything signed in, paying or holding a secret — never (NEVER_CACHE,
 *   the same list as `lib/pwa.ts`), and never a request that is not a GET
 *   or not this origin.
 */

importScripts("/firebase-messaging-sw.js");

const params = new URL(self.location.href).searchParams;
const PWA = params.get("pwa") === "1";
const VERSION = params.get("v") || "0";

const STATIC = `tw-static-${VERSION}`;
const PAGES = `tw-pages-${VERSION}`;
const MEDIA = "tw-media-v1";
const KEEP = PWA ? [STATIC, PAGES, MEDIA] : [];
const OFFLINE = "/offline";
const PAGE_LIMIT = 40;
const MEDIA_LIMIT = 120;

const NEVER_CACHE = [
  "/admin", "/portal", "/api", "/checkout", "/order", "/store/basket", "/store/notify",
  "/newsletter/unsubscribe", "/visit", "/meeting", "/ticket-survey", "/embed", "/theme-preview", "/push",
];

const never = (path) => NEVER_CACHE.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`));

/* The offline page and everything it needs to look like the site: its HTML,
   and the stylesheets and scripts that HTML names. */
async function precacheOffline() {
  const cache = await caches.open(STATIC);
  const res = await fetch(OFFLINE, { credentials: "omit", cache: "no-store" });
  if (!res.ok) return;
  const html = await res.clone().text();
  await cache.put(OFFLINE, res);
  const assets = [...new Set([...html.matchAll(/(?:href|src)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]))];
  await Promise.all(assets.map((a) => cache.add(a).catch(() => undefined)));
}

async function trim(name, limit) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - limit)).map((k) => cache.delete(k)));
}

self.addEventListener("install", (event) => {
  if (PWA) event.waitUntil(precacheOffline().catch(() => undefined));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith("tw-") && !KEEP.includes(n)).map((n) => caches.delete(n)));
    if (PWA && self.registration.navigationPreload) await self.registration.navigationPreload.enable();
  })());
});

/* A navigation: the network first, with the preload the browser started
   while the worker woke; a good answer is kept for offline. */
async function page(event) {
  try {
    const res = (await event.preloadResponse) || (await fetch(event.request));
    const cacheable = res.ok && res.type === "basic" && !/no-store/i.test(res.headers.get("Cache-Control") || "");
    if (cacheable) {
      const copy = res.clone();
      event.waitUntil(caches.open(PAGES).then((c) => c.put(event.request, copy)).then(() => trim(PAGES, PAGE_LIMIT)));
    }
    return res;
  } catch {
    const cached = await caches.match(event.request, { ignoreSearch: false });
    if (cached) return cached;
    const offline = await caches.match(OFFLINE);
    return offline || new Response("You are offline.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) {
    const copy = res.clone();
    caches.open(STATIC).then((c) => c.put(request, copy));
  }
  return res;
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(MEDIA);
  const cached = await cache.match(event.request);
  const fresh = fetch(event.request).then((res) => {
    if (res.ok) {
      event.waitUntil(cache.put(event.request, res.clone()).then(() => trim(MEDIA, MEDIA_LIMIT)));
    }
    return res;
  });
  if (cached) {
    event.waitUntil(fresh.catch(() => undefined));
    return cached;
  }
  return fresh;
}

self.addEventListener("fetch", (event) => {
  if (!PWA) return;
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Images on the asset origin (the API's /storage) are cached like ours.
  if (url.origin !== self.location.origin) {
    if (request.destination === "image" && url.pathname.startsWith("/storage/")) event.respondWith(staleWhileRevalidate(event));
    return;
  }
  if (never(url.pathname)) return;
  // React Server Component payloads are left to the network: offline, Next
  // falls back to a full navigation, which lands on the page handler below.
  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return;

  if (request.mode === "navigate") {
    event.respondWith(page(event));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.pathname.startsWith("/_next/image") || url.pathname.startsWith("/pwa-icon/") || request.destination === "font") {
    event.respondWith(staleWhileRevalidate(event));
  }
});
