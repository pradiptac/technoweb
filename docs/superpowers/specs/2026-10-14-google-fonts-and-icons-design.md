# Google Fonts, Noto and Google icons — design

**Status:** approved in conversation 2026-10-14; this file is the written spec.
**Release:** 0.179.0, after 0.178.0 (price entry and display) is committed.

## What the client asked for, and what they chose

> "Add support for Google font, Noto font and Google icons — fonts.google.com"

Their answers:

1. **Pick any Google font** for headings and body text, beyond the 19 vendored
   faces. Noto is part of Google Fonts, so it comes with this. Indian-script
   content was not a stated need, but the Noto families for it come free.
2. **Google icons in every icon picker**, and **icons in written text** (page
   and blog bodies).
3. **Copied to our server**: a visitor's browser never contacts Google — no
   consent question, no CSP change, nothing breaks when Google is unreachable.
4. **Rounded style only** for the icons, at a light weight, so they sit with
   the site's own 1.7-stroke set.

Success: an editor picks "Noto Sans Devanagari" or "Poppins" in Settings →
Appearance, saves, and the public site renders in it from our own origin; an
editor gives a solution the Google icon "router" and it draws like any other
identity icon; `[icon name="ms:router"]` in a body renders the icon inline.

## Part 1 — Google Fonts

### The catalogue

- `web/scripts/build-google-fonts.mjs` reads Google's public family metadata
  (`https://fonts.google.com/metadata/fonts`, no API key; it is prefixed with
  `)]}'` and that prefix is stripped) and writes
  `api/resources/google-fonts.json`: one row per family —
  `{family, slug, category, weights[], italics: bool, subsets[]}`, sorted by
  popularity. Committed, so nothing calls Google while an editor searches.
  Re-run by hand to refresh; the release carries whatever is committed.
- The slug is the family lower-cased with every run of non-alphanumerics a
  hyphen ("Noto Sans Devanagari" → `noto-sans-devanagari`).
- **The API holds the catalogue, not the browser bundle.** `GET
  /admin/settings/google-fonts/catalogue?q=&category=&page=` (`role:admin`)
  searches it (prefix match on the family first, then substring; 40 a page)
  and answers `{data: [{family, slug, category, subsets, installed}], meta}`.
  The ~300 KB file never reaches a client bundle.

### Installing a font

- `POST /admin/settings/google-fonts {slug}` (`role:admin`, throttled 10/min):
  1. The slug must be in the catalogue (422 otherwise — "Choose a font from
     the list.").
  2. The weights fetched are 400, 600 and 700, intersected with what the
     family has; a family with none of them (a display face that only comes
     in 300, say) takes its nearest weight to 400 as its only file set.
  3. The API asks `https://fonts.googleapis.com/css2?family=<Family>:wght@<w;w;w>&display=swap`
     through `SafeHttp` with a current browser's `User-Agent` (Google answers
     WOFF2 `@font-face` blocks only to one), parses each block's `font-weight`,
     `unicode-range` and `src: url(https://fonts.gstatic.com/…woff2)`, refuses
     any URL off `fonts.gstatic.com`, and downloads each file through
     `SafeHttp`, checked to begin with the WOFF2 signature (`wOF2`) and to be
     under 2 MB.
  4. Files go to the public disk under `fonts/google/<slug>/<n>.woff2`. A row
     in a new `google_fonts` table records `slug`, `family`, `category`,
     `faces` (a JSON list of `{weight, unicode_range, path}`) and `bytes`.
  5. Answers `{data: {id: "g-<slug>", family, faces: n, bytes}}`. A failure
     anywhere leaves nothing behind (files written so far are deleted) and is
     a 422 on `slug` with one sentence (Google's status, or "That font could
     not be downloaded from Google. Try again shortly.").
- Installing a font already installed answers 200 and re-downloads nothing.
- `DELETE /admin/settings/google-fonts/{slug}` removes the files and the row;
  **422 while `theme_font_display` or `theme_font_body` uses it**, naming
  which.
- `GET /admin/settings/google-fonts` lists the installed ones with `in_use`.

### Choosing and rendering

- A Google font's id is **`g-<slug>`**. `SettingController::validateAppearance`
  widens its shape check for this form only (`^g-[a-z0-9-]{1,62}$`) and
  **refuses a `g-` id that is not installed** ("Install that font first."),
  since unlike a vendored id the frontend cannot fall back silently to a face
  it has never been sent.
- The public `/settings` map gains `google_fonts`: a JSON string of the
  installed fonts **in use** — `[{id, family, faces: [{weight, range, url}]}]`
  — with URLs built from the stored paths (never from anything typed), absent
  when none is in use. Same shape as the custom-font rows: a public setting the
  root layout reads.
- `web/src/lib/google-fonts.ts` (pure): turns that string into the
  `@font-face` rules — family name ours, `tw-g-<slug>`, never the typed name —
  each with its `unicode-range`, served through the existing same-origin
  `/font/[name]` route (extended to `fonts/google/<slug>/<n>.woff2`, the same
  exact-shape check). The root layout emits them in the `<style id="custom-fonts">`
  block it already writes, and declares `--font-g-<slug>`.
- `fontFor(id)` in `lib/font-choices.ts` answers a `g-` id with that variable
  and the category's generic fallback (`serif`, `sans-serif`, `monospace`,
  `cursive` for handwriting, `sans-serif` for display). Nothing else in the
  theme machinery changes.
- **The site import's `Brand::FONTS`** match also gains the catalogue: a family
  found in a stylesheet that Google has is offered as `g-<slug>` and installed
  on commit if the brand is accepted (otherwise unchanged).

### The console

- Settings → Appearance, both font selects: the 19 vendored faces and any
  installed Google fonts as options, then **"Browse Google Fonts…"**, which
  opens a `Modal` (`size="lg"`) with a search box, a category filter and a
  grid of results, each a sample line in that face.
- **Previews come through our server too.** Showing a sample of a font not yet
  installed needs its file: `GET /admin/settings/google-fonts/preview/{slug}`
  downloads only the 400 Latin subset into a cache folder
  (`fonts/google-preview/`, pruned after 7 days by
  `technoware:prune-font-previews`) and redirects to it. The console's browser
  never contacts Google. Previews are lazy — a card asks only once scrolled
  into view.
- Pressing a result installs it (a spinner on the card; the error sentence in
  the dialog on a refusal) and selects it in the field. Save then applies it,
  exactly as choosing a vendored face does.
- Below the selects, "Google fonts on this site" lists the installed ones with
  size and a Remove button (disabled with a reason while in use).

## Part 2 — Google icons (Material Symbols Rounded)

### The set

- `web/scripts/build-material-symbols.mjs` reads the SVGs of
  `@material-symbols/svg-300` (a **dev** dependency only — Apache 2.0, the
  Rounded style at weight 300, unfilled) and writes two committed files:
  - `web/src/content/material-symbols.json` — `{name: pathData}` for every
    icon (~3,800), viewBox `0 -960 960 960`, read **only by server code** and
    by the picker's API route.
  - `web/src/content/material-symbols-index.json` — `[{name, tags}]` for
    search, tags from the package's metadata.
  The file header credits Google and the Apache 2.0 licence; `docs/icons.md`
  records it as the sixth pack and why it is the first one vendored whole
  (it is an icon *library* an editor browses, not a gap-filler re-drawn to
  `base`).
- **Never imported by a client component.** That is the `icons.tsx` trap
  (Turbopack keeps a module whole) at twenty times the size.

### Storing and validating

- A Google icon's key is **`ms:<name>`** — `name` matching `^[a-z0-9_]{1,40}$`.
  Every icon column is `max:40` today; the request rules for icons
  (solutions, services, industries, product and service categories, content
  types, menu items, builder sections and layout widgets) widen to `max:44`
  and accept either an `iconMap` key or `ms:<name>`. Unknown names are not
  refused by the API (the shape is checked, the list lives on the frontend —
  the fonts' rule), and render nothing, as an unknown `iconMap` key does now.

### Rendering

- `IdentityIcon` (server) handles an `ms:` key by reading the path from
  `material-symbols.json` through a `server-only` module
  (`lib/material-symbols.ts`, `cache()`d) and drawing an `<svg>` with that
  path as a fill, in the same box and with the same identity hue as an
  `iconMap` icon. The hue still comes from the key (`ms:router`), so the
  twelve fixed tokens and their contrast guarantees hold.
- Client islands that receive identity icons already get them as rendered
  elements from the server (the header, the nav), so nothing new crosses into
  a client bundle. Any client component that renders an icon by **key** today
  is listed in the plan and either moves to a server-rendered element or shows
  the `iconMap` fallback for an `ms:` key.

### The picker

- `IconField` (already lazy, `icon-field-lazy.tsx`) gains tabs: **Site icons**
  (today's grid) and **Google icons**. The second tab asks
  `GET /api/admin/icons/material?q=&page=` — a Next route handler, staff
  only, reading the two JSON files on the server — and gets 120 matches at a
  time as `{name, path}`, searched by name then tags. Nothing is downloaded
  until the tab is opened.
- The same picker serves menus, the page builder's icon fields and layout
  widgets, wherever `IconField` is used.

### In written text

- A Summernote button **Icon** (`container` passed, per `docs/editor.md`)
  opens the picker and inserts `[icon name="ms:router"]` at the cursor.
  Site icons may be inserted the same way (`[icon name="router"]`).
- `lib/shortcodes.ts` gains `icon` with its own pattern
  (`/\[icon\s+name=["']((?:ms:)?[a-z0-9_-]{1,40})["']\s*\]/`) — shortcodes are
  expanded into components after sanitising, never by string substitution, so
  a malformed one stays literal text. `ProseWithShortcodes` renders it as an
  inline `<svg>` sized `1em`, `fill: currentColor`, `aria-hidden`, so it takes
  the text's colour, not an identity hue. **Inline**: the existing splitter
  works on block segments; the icon is the one shortcode that may sit inside
  a paragraph, so it is expanded within a segment's HTML by the same component
  walk, not by splitting the paragraph.

## What is deliberately out

- Italic faces and weights other than 400/600/700.
- Loading anything from Google's CDN at runtime.
- The Outlined and Sharp icon styles, filled icons, per-icon weight or grade.
- Icons as a font (ligatures): a ligature icon shows its *word* until the font
  loads, which both reads wrongly and is graded by the contrast audit as text.

## Testing

- **API:** `GoogleFontsTest` with `Http::fake()` for Google's CSS and files —
  installs a family (faces, unicode ranges, paths, row), refuses a slug not in
  the catalogue, refuses a URL off `fonts.gstatic.com`, refuses a file that is
  not WOFF2 or is too large, leaves nothing behind on a failure, re-installing
  is a no-op, removing one in use is a 422, a `g-` id not installed is refused
  by the settings save, `/settings` carries only fonts in use.
- **API:** icon rules accept `ms:router` and an `iconMap` key, refuse
  `ms:Router!` and a 45-character key, on two or three representative requests.
- **Web:** `node scripts/build-google-fonts.mjs --check` and
  `build-material-symbols.mjs --check` (the committed files match the script).
- **Probe** `scripts/probes/google-fonts-icons.mjs`: install a Google font
  through the dialog, save it as the heading font, read the computed
  `font-family` of an `h1` on a public page and confirm the WOFF2 came from our
  origin (no request to any Google host during the public page load); give a
  solution `ms:router` through the picker and see it drawn; put
  `[icon name="ms:router"]` in a draft page body and see an inline `<svg>`;
  remove what it made.
- **Audits:** light, dark and phone over Settings → Appearance (dialog open by
  hand, since no audit opens it), a public page in the Google font, and a page
  with an `ms:` icon.
