# The downloads centre

Datasheets, drivers, firmware and guides (0.131.0): filed by category, listed
on `/downloads`, attachable to catalogue and shop products, and either open to
everybody or kept for customers signed in to the portal.

The rules one line each are in `CLAUDE.md`; this is the account behind them.
The endpoints are in `API.md` under "Downloads".

## What a download is

One row in `downloads`: a title, a summary, a version, a release date, a
category, an order, a status — and **a file, which is one of two things**
(`source`, `App\Enums\DownloadSource`):

| | where the bytes are | address |
|---|---|---|
| `library` | the media library (`file_path`) | public, like every library file |
| `upload` | the **private** disk, `downloads/<random>.<ext>` (`private_path`) | none |

No slug and no page of its own — the `Certification` reasoning. A download is
a row on `/downloads` and on the pages of the products it is attached to.

`download_categories` is taxonomy in the `ServiceCategory` shape: no status,
no SEO, `is_active` takes a shelf (and everything on it) off the site, and
the slug is a filter value (`/downloads?category=`), so it is not `Sluggable`
and writes no redirect.

`downloadables` is one morph pivot (`product`, `store_product`). The picker is
on the download's form, not on the two product forms: one place to edit a
relation is one place for it to be wrong.

## Access, and why a library file cannot be customers-only

`access` is `public` or `customers` (`DownloadAccess`). **`customers` on a
`library` file is refused on write** (422 on `access`): a library file has a
public URL by construction, so the lock would be on a door with no wall. The
form disables the option and says to upload the file instead.

A customers-only download is still **listed for everybody**, with `locked:
true`. The page says what exists; the button is what asks who is pressing it.
Hiding the row would also make every page that lists it differ per visitor,
and those pages are cached.

## No address of a file is ever on a page

The public resource carries a file's name, extension and size and **never its
URL** — for a library file either. Every download is fetched through the
website's own route handler:

```
<a href="/api/downloads/{id}">  →  GET /api/v1/downloads/{id}/file
```

That one API route is the only door to the bytes, so it is what:

- **counts** the download (`DownloadFiles::count()`, a query-builder
  increment — it must not move `updated_at`, which is the sitemap's `lastmod`
  for `/downloads`);
- **asks who is reading** a customers-only file: `$request->user('sanctum')`
  narrowed to a `Customer` who may sign in, while the portal is open. The
  route is public, so `$request->user()` would always be null there and read
  as working — the trap the blog comments and the chatbot shipped with.
  `DownloadsTest` sends a real `Authorization: Bearer` header for that
  reason, never `actingAs`.

It answers one of three things, and the Next handler maps each:

| API | handler |
|---|---|
| `200 {data: {url}}` (library file) | `302` to that URL |
| `200` stream (private upload) | streamed through, `attachment`, `application/octet-stream`, `nosniff` |
| `401 reason: sign_in_required` | `303` to `/portal/login?return=/portal/downloads` (a relative `Location`) |

A draft, a download with no file, a file that has gone and an unknown id are
one 404.

**The link is a plain `<a>`, never `next/link`.** A `Link` to a route handler
is prefetched, and a prefetch here would be counted as a download. A locked
row's link carries no `download` attribute and no `target`: a visitor who is
not signed in is redirected to the sign-in *page*, and a `download` attribute
would save that page as the file.

## Private uploads

`App\Support\Downloads\DownloadFiles` is the one place that knows where a
private file lives.

- **A hashed name.** The stored name is random and keeps only the extension;
  the name it was uploaded under is a label in `file_name`, used for the
  `Content-Disposition`.
- **An allowlist of extensions** (`DownloadFiles::EXTENSIONS`): documents,
  archives, firmware and disk images, installers, configuration. Never
  `html`, `svg`, `js` or `php`. Firmware cannot be checked by content the way
  a PDF can, so what makes this safe is not sniffing: the file is never
  executed by this server (private disk), never rendered by a browser
  (always an attachment), and uploaded only by staff.
- **Size**: `min(config('downloads.max_upload_kb'), php.ini)` —
  `DOWNLOADS_MAX_UPLOAD_KB`, 512 MB by default. The form prints the figure
  in force.
- **Deleted with its row** (`Download`'s `deleted` hook), and when a new
  upload replaces it or the download switches to a library file. A new
  upload is written *before* the row is saved and the old one removed
  *after*: a failure between the two leaves the previous file in place.

### The form uploads through a route handler

A Server Action gives the browser no progress, and a firmware image is the
one upload here where that matters. The download form uses `useUploadForm`:
with no file chosen it posts through its Server Action as JSON; with one, the
browser sends the multipart body itself to `/api/admin/downloads[/{id}]`,
which streams it to the same API endpoint.

Three consequences:

- **An edit is `POST` with `_method=PATCH`.** PHP reads a multipart body on
  POST only; Laravel reads the override.
- **A multipart form cannot say "an empty list".** The form sends
  `relations_sent`, and `DownloadRequest::prepareForValidation()` then reads
  an absent `product_ids` as none. The JSON path sends real arrays.
- **A route handler cannot `updateTag`.** After a successful upload the form
  calls `downloadUploadedAction(id)`, a Server Action that purges, and then
  navigates. The edit page keys the form on `updated_at`, which is what
  empties the file box after a save that stays on the same address.

## Publishing needs a file

`Download::scopePublished()` is: status `published`, **a file behind it**,
and a category that is not switched off. The file half is in the query on
purpose — a published row whose upload never arrived would otherwise be a
button that 404s. The request also refuses `published` with no file (422 on
`status`), checked against what the download *will be*: a `PATCH` naming one
half is compared with the stored other half.

The console's `file_missing` is the row that says it has a file while nothing
answers for it (a library file since deleted; an upload gone from the disk).

## Where a download appears

- **`/downloads`** — dynamic (it reads `searchParams`). The unfiltered list
  and the shelves are cached fetches tagged `downloads`; a `?q=` is never
  cached. A shelf or a search is `noindex, follow` through
  `listingMetadata`. From `lg` the shelves are a side column beside the
  list; below it, a wrapped row of pills.
- **Product pages** — `downloads` on the detail read of a catalogue product
  and a shop product (`publishedDownloads`, loaded by the detail read only),
  drawn as a "Downloads" block.
- **The portal** — `/portal/downloads` lists the customers-only files. It
  reads the same public list (`?access=customers`); being signed in changes
  the button, not the list.
- **The page builder** — a `downloads` section takes `source: centre` (with
  an optional `category_id` and `limit`) and lists the centre's files live.
  Its items carry `download_id` and no `url`. Typed-in files (`custom`, the
  default, never stored) are unchanged. A switched section's leftover typed
  files are neither required nor kept.
- **Menus** — `SiteSection` has `downloads`; like every list page's link it
  is dropped at render until a download is published.
- **Search**, the console's palette, the sitemap (only once the centre holds
  a file) and `llms.txt`. A search result opens the centre searched for the
  file, since a file has no page.

One component draws a file everywhere: `components/downloads/download-list.tsx`.

### What a save purges

`SHOWS_DOWNLOADS` in `admin/(app)/downloads/actions.ts`: `downloads`,
`menus`, and every tag a page that can hold a builder section carries (the
list the section library keeps). Wide, for a save that is rare — the
alternative is a page offering a file deleted an hour ago.

## The old `/downloads` page

Until 0.131.0 that address was a CMS page the installer seeded. A route of
the site's own now lives there, and Next resolves a route before the page
catch-all, so the page would have been a row nobody could open.

- `PageSeeder` no longer seeds it; `downloads` is in `ReservedSlugs`, so a
  page or a content type cannot take the address.
- The **`RetireDownloadsPage`** upgrade step, for installs that have it:
  menu items pointing at the page become `section` items (`downloads`); the
  page is renamed `downloads-page` and set to draft **through the query
  builder**, so `Sluggable` writes no 301 from `/downloads`; and any
  redirect *from* `/downloads` is deleted, because the proxy answers a
  redirect before any route.
- **Not handled automatically**: an install that made its own *content type*
  with the slug `downloads`. Its entries (`/downloads/<entry>`) still open;
  its list page is replaced by the centre. Renaming the type brings its list
  back at the new address.

## Samples

`SampleDownloadSeeder` (demo only): three shelves and three files titled
"Sample …" — two public library PDFs and one customers-only private upload —
attached to the first published catalogue and shop product. Created only
while there are no downloads. On the must-not-ship list.

## Checks

- `api/tests/Feature/DownloadsTest.php` — 34 tests: the CRUD and its
  refusals, both kinds of file, who may fetch a customers-only one, the
  count, product pages, search, menus, the builder section, the upgrade
  step and the seeder.
- `web/scripts/probes/downloads.mjs` — creates a customers-only download with
  a real upload through the form, reads the public page at four widths,
  checks a visitor is sent to sign in, signs in as a customer and fetches
  the exact bytes, then deletes what it made. Its screenshots pass
  `caret: "initial"`: Playwright's default hides the caret with an inline
  style on every input, and a shot taken while the footer was still
  hydrating logged a hydration mismatch that was the probe's own doing.

## Not built

Per-company or per-contract access; a file's own page; version history of a
download (a new version is a new upload on the same row); an external link
as a file. None was asked for.
