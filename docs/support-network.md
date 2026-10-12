# The support network

Service centres, offices and service partners with an address, a telephone and
a pin on a map, listed on `/support-network` country by country, city by city,
and the staff who work at each (0.170.0, the client's ask of 2026-10-12).

## Shape

- **`support_centres`** is its own table, not the `locations` tree. A location
  is an SEO place — a claim that work is done there, backing landing pages,
  `role:seo_manager`; a centre is a building with a phone. `location_id` links
  the two when wanted (nullable, `nullOnDelete`).
- **`support_centre_user`** tags staff: `title` (80), `is_public` (default
  true), `sort_order`. A person may be at several centres. Replaced wholesale
  by `staff` on a write; absent leaves it alone, `[]` clears it.
- **`role:admin`** for the CRUD, beside Staff (`routes/api/admin-admin.php`),
  because a centre tags staff accounts. `GET /admin/staff?centre=` filters,
  and each staff row carries `support_centres`.
- **`App\Support\Countries`** is the one list of countries (ISO alpha-2 →
  English name), generated once from ICU and committed so a server without
  intl has it; `country_code` must be in it. `SupportCentreKind` is the kinds.
- A pin needs **both** coordinates or neither (judged against what the row will
  be); latitude −90..90, longitude −180..180.

## The public read

`GET /support-centres`: active centres, country → city → `sort_order`; staff
only where `is_public` and the account is active, **by name and title only** —
a staff member's email and mobile never leave the console (`SupportCentreTest`
reads the body for them). `{data: [], meta: {schema: null}}` in a 200 when
empty. `meta.schema` is `StructuredData::supportNetwork()`: an `ItemList` of
`LocalBusiness` nodes with `parentOrganization` → the site's Organization `@id`
— the physical-place case the `LocalBusiness` rule allows.

## The map

- **Drawn here, from committed data**: `web/src/content/world-map.ts`, built
  once by `web/scripts/build-world-map.mjs` (its docblock has the commands)
  from Natural Earth admin-0, **India point-of-view edition** — India's
  boundary as India claims it, a legal matter for an Indian client — public
  domain, simplified by mapshaper and projected to Miller. 67 KB, 245
  countries, 1000 map units wide. No tiles, no third-party request, no cookie,
  no CSP change. `project()`/`unproject()` in the same module are the same
  Miller arithmetic, so a pin and an outline always agree; the console's
  click-to-place uses `unproject()` through the zoom group's screen matrix.
- **`SupportNetwork`** (`components/support/support-network.tsx`) is server-
  rendered whole: outlines, pins and cards are in the HTML (works without
  JavaScript; the list is what a screen reader and a crawler read). The SVG is
  `aria-hidden`, its pins are not tab stops — every action is on a card.
  A network in one country opens zoomed to it; a builder section may preset
  a country (`country`), which also hides the other countries' groups.
- **`SupportNetworkControls`** is the island: country chips that zoom (a CSS
  `transform` on `[data-map-zoom]`, `transform-box: view-box`, transitioned
  inside the reduced-motion guard) and narrow the list (`hidden` on the other
  `[data-country-group]`s), and the pin ↔ card join (`data-active`). It never
  re-renders the map — the outlines arrive as children — so the 67 KB stays
  out of the client bundle. `zoomFor()` (`map-zoom.ts`) is shared by both.
- **A pin keeps its screen size**: `--s` (the zoom) and `--px` (map units per
  screen pixel, measured by a `ResizeObserver`) divide its `r` in CSS. On a
  phone the map is `h-64` with `preserveAspectRatio="xMidYMid slice"`, cropped
  around the middle, where the zoom puts the chosen country.
- **Directions** is an ordinary link to `google.com/maps/search/?api=1&query=`
  — nothing is requested until it is pressed.

## Where else

- The page is ISR, tag `support-centres` (the console's save purges it and
  `pages`); in the sitemap and `llms.txt` once a centre is shown.
- `SiteSection` `support_network` for menus, dropped at render while no centre
  is shown (`hasContent()`); `support-network` and `support-centres` are in
  `ReservedSlugs`.
- Page builder: `support_network` (`{kicker, heading, lede, country}`), the same
  component; `GET /admin/pages/builder` sends `support_countries`.
- Console: Site → Support network (`/admin/support-centres`), a Details /
  Location / Staff form; "Paste a Google Maps link" reads `!3d…!4d…`, `@lat,lng`,
  `q=`/`ll=` locally (`coordsFromLink`).
- Demo: `SampleSupportCentreSeeder`, three "Sample …" centres, create-only while
  there are none.
- `scripts/probes/support-network.mjs`; `SupportCentreTest`.
