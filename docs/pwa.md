# The installable website (PWA)

Since 0.100.0 (2026-10-05) the public site can be added to a phone's home
screen or installed on a desktop. Installed, it opens full screen without the
browser's address bar, and pages a visitor has already opened still load
without a connection. It is settings-driven: Site → Settings → Installable
app (`pwa_*`, a public settings group).

| Piece | Where |
|---|---|
| Manifest | `web/src/app/manifest.ts` → `/manifest.webmanifest` |
| Icons | `web/src/app/pwa-icon/[size]/route.tsx` → `/pwa-icon/180`, `/192`, `/512`, `?maskable=1` |
| Service worker | `web/public/sw.js` (imports `firebase-messaging-sw.js`) |
| Registration and install card | `web/src/components/pwa/pwa-loader.tsx`, `install-prompt.tsx`, mounted by `(marketing)/layout.tsx` only |
| Offline page | `web/src/app/(marketing)/offline/page.tsx` |
| Settings resolver | `web/src/lib/pwa.ts` (`pwaFor`, `initials`, `PWA_NEVER_CACHE`) |
| Probe | `web/scripts/probes/pwa.mjs` |

## Rules

**One service worker, because a scope holds one.** The push worker was
registered at `/`, and a second script at `/` replaces the first — taking the
browser's push subscription with it. So `/sw.js` imports
`/firebase-messaging-sw.js` and adds the caching beside it, and
`lib/push-client.ts` reuses whatever registration exists rather than
registering its own. The push file stays at its path for browsers that
registered it before; they are moved to `/sw.js` on their next visit.

**The worker's configuration is its query string.** A static file cannot read
the settings, and a different URL is what makes a browser install a new
version: `pwa=1` caches and serves offline, `pwa=0` is push only and deletes
every `tw-*` cache, `v=<APP_VERSION>` replaces the static cache on a release.
Switching the setting off reaches each browser on its next visit; nothing is
unregistered, because unregistering would end push too.

**Never cached**: anything signed in, paying, or holding a secret —
`/admin`, `/portal`, `/api`, `/checkout`, `/order`, the basket and stock-notice
routes, unsubscribe, `/visit`, `/meeting`, `/ticket-survey`, `/embed`,
`/theme-preview`, `/push` — any non-GET, any other origin except the asset
origin's `/storage/` images, and RSC payloads (offline, Next falls back to a
full navigation, which the page handler answers). The list is in `sw.js` and
`lib/pwa.ts`; change both.

**Navigations are network first.** A good answer is kept (40 pages, oldest
dropped) so it opens offline; with neither network nor copy, the offline page
answers at the requested address — which is why its "Try again" is a plain
`<a href="">`, working with no JavaScript. `/_next/static/*` is cache first
(content-hashed names); `/_next/image`, `/storage/*`, fonts and the icons are
served from cache and refreshed behind (120 entries).

**The offline page is precached with everything it names.** On install the
worker fetches `/offline` and every `/_next/static/` stylesheet and script in
its HTML, so it renders in the site's own chrome and theme with no network.

**Not in development** unless `PWA_IN_DEV=1` is set for the server: dev chunk
names are not content hashes, and a cache-first worker would serve old code
with nothing saying so. The first install in `next dev` takes as long as
compiling `/offline` — up to a minute.

**The install card is polite.** Not on the first page (from the second, or
after 45s); never while the cookie banner (`data-cookie-banner`) or the
compare tray is up; a month of silence once dismissed (`tw_pwa_dismissed`);
never inside the installed app. Chrome and Edge's `beforeinstallprompt` is
held and replayed by Install; iPhone Safari never fires it, so there the card
says where Share → Add to Home Screen is. Below `sm` it spans the screen with
a 4.5rem right gutter — the column the assistant's launcher and back-to-top
live in — and its buttons sit on their own row; from `sm` it is a 22rem card
bottom-left. The probe checks both widths for overlap and overflow.

**Icons are generated**, the `opengraph-image.tsx` argument: initials on the
brand gradient in `brandOn`, or the uploaded `pwa_icon_path` centred on the
page colour. The maskable variant keeps the mark in the middle 60%. Any size
but 180/192/512 is a 404. Apple reads neither the manifest's icons nor its
display mode, so the root layout links `/pwa-icon/180` as the touch icon and
sets `appleWebApp`; `themeColor` is per scheme.

**`start_url` is `/?source=pwa`**, so analytics can tell an installed launch
from a visit; the canonical never carries the query. The manifest's shop
shortcut appears only while `store_enabled` is on. `window-controls-overlay`
is deliberately not offered: the headers do not reserve the title-bar area.

## Deploying

HTTPS is required (browsers refuse a worker otherwise; `localhost` is the
exception). Nothing else: `sw.js` is in `public/`, served with
`Cache-Control: max-age=0`, so a reverse proxy must not add a long cache to it.
