# CDNs and versioned media URLs

0.124.0. Three things that arrived together because each needs the others: a
setting for a media CDN, a site that behaves behind a CDN proxying the whole
domain, and a public address that changes when a file's bytes do.

## What a CDN can and cannot serve here

The first plan was "point a CDN at `/storage`". It would not have sped up a
single photograph. Every public raster goes through `/_next/image`: the
website's optimiser fetches the original from the API, server to server,
re-encodes it, and what the visitor downloads is
`www…/_next/image?url=…&w=828` — from the **website's** domain. A CDN in
front of the API's storage only ever sees the optimiser's one fetch per
width.

So there are two kinds of file and two ways to put a CDN in front of them:

| | Served from | Sped up by |
|---|---|---|
| Photographs (jpg, png, webp, gif, avif) | the website, resized | a CDN that **proxies the whole website** (Cloudflare) — no setting |
| Videos, documents, vector logos | the API's `/storage`, as stored | the same, or a **pull-zone** CDN named in `media_cdn_url` |

Making the optimiser itself emit CDN addresses was looked at and is not
possible at runtime: `images.path` and a custom `loaderFile` are build-time
configuration, inlined into the client bundle, and the portable build is one
build for every install.

## `MediaUrl`

`App\Support\MediaUrl::for($path, ?int $version = null)` is the address of
a file on the media disk, and every public response uses it — 61 call sites
that used to read `asset('storage/'.$path)`. With nothing configured and a
file nobody has edited it returns exactly that.

Left on `asset()`, deliberately:

- the console's own resources (`Http/Resources/Admin`, the settings and
  promo controllers) — they version by `updated_at` already, their rasters
  are `unoptimized`, and a console preview has no business on a CDN;
- the newsletter — a campaign's HTML is stored when it is saved, and a CDN's
  address must not outlive the CDN in an email already sent;
- the WordPress importer — it writes URLs into bodies.

## The versioned address

An in-place edit keeps the file's path on purpose: the path is what records
store, and keeping it is what lets a crop reach every page already using the
picture. But the path is cached for a year — by the browser, by the
optimiser's own disk cache (`minimumCacheTTL: 31536000`), by Apache's
`Cache-Control` on uploads, and by any CDN in front of either.

`next.config.ts` said that was safe because "an in-place edit versions the
URL with `?v=<updated_at>`". Only the console's resources and the brand logo
did. A blog cover, a product picture or a slide edited in place went on being
served as it was, to every returning visitor and from the optimiser's cache,
for up to a year — invisible on a development machine, where `artisan serve`
sends no `Cache-Control`.

- `media.revision` counts the times a file's bytes have changed.
  `Media::markEdited()` bumps it and re-makes the blurred preview; it is
  called by the three editing endpoints, a replacement and a version restore
  — the same five places `refreshBlur()` was.
- `MediaMeta::revision($path)` reads a map of the *edited* files only, binned
  ones included, and `MediaUrl` appends `?v=N`. Zero adds nothing, so an
  unedited file's URL — nearly all of them — is byte-identical to before.
- A caller with a better version passes it: a brand's `updated_at`, which
  also moves when the logo is swapped for a different file.
- The media edit actions and the replace route handler
  `revalidatePath("/", "layout")`. Nothing records which pages use a file,
  so it is all of them; without it the new address reached each page only as
  its own cache ran out, five to ten minutes later.

**There is no purge API, and that is the design.** A purge is a different
call for every provider, each needing a token, and it cannot reach a
browser's cache at all. An address that changes works for every CDN and for
the visitor who already has the old file. The one condition is that a
pull-zone CDN varies its cache by query string; the manual says so.

## The media CDN setting

The private `media_cdn` group, on Content → Media settings → CDN:
`media_cdn_enabled` (off) and `media_cdn_url`.

- `MediaUrl::direct($path)` — anything the optimiser does not fetch — goes
  to `<cdn>/storage/<path>`. The pull zone's origin is the API's address, so
  the CDN mirrors `/storage` and nothing is uploaded anywhere.
- The address is an https origin and nothing after it, on a public host
  name, never this server's own (`refusalFor`); stored cleaned, and checked
  for shape again on every read (`cdn()`), so a row edited in the database
  cannot put a path or another scheme in front of every download.
- The website needs the origin for one thing, the Report-Only policy's
  `img-src` and `media-src`. It is not an environment variable, so it rides
  on the read the proxy already makes: `meta.media_cdn` on `GET /redirects`,
  present only while the switch is on, passed to `reportOnlyCsp()`. Up to a
  minute late, like everything else there; a violation in that minute is
  reported, not enforced.
- Saving the group purges every cached page (`saveSettingsAction`). The
  address of every video and vector logo is inside cached API responses, not
  a setting a page reads, so without the purge "off" would take ten minutes
  to mean off.
- `POST /admin/settings/media-cdn/test` fetches one library file through the
  saved address with `SafeHttp` and compares its bytes with the disk's. A
  status alone is not proof: a pull zone pointed at the wrong origin, or a
  parked domain, answers 200.

Keeping rasters off the media CDN also keeps its host out of
`images.remotePatterns`, which a non-portable build derives from
`ASSET_ORIGIN` at build time — a CDN host named there would need a rebuild
to add and another to remove.

## Behind a CDN that proxies the whole site

No code switch: the customer points DNS at the CDN. What the application
does about it:

- **Cache lifetimes** were already right — a year on `/_next/image` and on
  uploads — and are now also *safe*, since an edit moves the address.
- **The visitor's address.** The connection to this server comes from the
  CDN, so the rightmost `X-Forwarded-For` entry is one of a few hundred edge
  machines and every visitor behind one shares a rate-limit bucket: five
  wrong passwords from anybody lock the account for everybody.
  `CLIENT_IP_HEADER` (`lib/client-ip.ts`) accepts `cf-connecting-ip` and
  `true-client-ip` beside `x-real-ip` — the header the CDN sets and
  overwrites on every request. It is only safe while the origin accepts
  connections from the CDN alone; anybody reaching it directly writes that
  header themselves.
- **System → Status** reads the request it is drawn from (`lib/cdn.ts`):
  `cf-ray` or `cdn-loop: cloudflare` means Cloudflare is in front. It then
  says whether `CLIENT_IP_HEADER` matches, in the words of what to set — and
  warns the other way round, when the header is set and no CDN is in front.
  A hint on a screen only an administrator sees, never a security decision:
  a visitor can send those headers too.
- **What must be off at the CDN** is in the manual, because it is the CDN's
  configuration and not ours: anything that rewrites the HTML or the scripts
  (Rocket Loader, email obfuscation) breaks hydration and the pre-paint
  scheme script, and "cache everything" must never cover the console, the
  portal, the API or the pages a secret addresses.

## Checked

`MediaCdnTest` (off by default and byte-identical, on for direct files and
never for rasters, the address rules, the revision on an edit and again on
the next, the test endpoint against a faked CDN). `scripts/probes/media-cdn.mjs`
stands a CDN in by routing `https://cdn.example.com` to the API's storage in
the browser: 25 vector pictures on the homepage addressed at it and served,
131 optimised pictures with the API as their upstream, the policy naming the
CDN with no violation, the test's notice staying on screen, "off" on the very
next load, and the status card with and without Cloudflare's header.

Not driven against a real CDN account, and the purge after an in-place edit
was not watched in a browser — its URL is covered by the API test and the
purge is the call the menu actions already make.
