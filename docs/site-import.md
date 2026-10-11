# Importing a website with no API

System → **Site import** (`/admin/imports/site`, `role:admin`, 0.163.0). Brings
in a website that has no API to read — a hand-written site, a Webflow / Wix /
Framer export, a site-builder template, an old static site — from a **live
address** (crawled) or an **uploaded ZIP**. Each page arrives as a **draft
builder page** in the active theme's sections, with its pictures and files,
search-engine details, menus, internal links and redirects.

It is the WordPress import's sibling (`docs/wordpress-import.md`) and the same
shape — **scan → dry run → review → commit**, every phase a sliced queued job,
nothing written until the person presses Import — over a source that tells it
nothing about what a page *is*. So it reads structure: what repeats across the
site is furniture, and what is left is walked by recognisers that key on how a
block is built, not on any framework's class names.

**Part 1 of two.** 0.163.0 is sources, chrome stripping, the generic
recognisers, pages, media, SEO, menus, links and redirects. Not yet (0.164.0):
the AI fallback for blocks the rules cannot place, page / post / product
classification, and brand colours and fonts. The seams are left clean — the
review's `skip` list is where a `kinds` decision will go.

## The flow

1. **Scan** (`RunSiteImport` phase `scan`, sliced at 35 s). A URL import is
   walked by `SiteCrawler`; a ZIP is unpacked by `ZipSource`. Either writes
   `pages.jsonl` (`{url, path, title, status, html}`) under
   `storage/app/private/site-imports/{id}/` (`Harvest`, parameterised by base
   directory), with `state.json` (`ScanState`) the memory between slices. Then
   the **chrome** phase tallies every page's candidate blocks and, when done,
   decides what is furniture, the site's name, the home page and the menus, and
   writes them to `analysis.site`.
2. **Analyse** (phase `analyse`). The dry run: `Importer::analyse()` plans every
   record, writes nothing, counts media rather than fetching it. Ends `ready`.
3. **Review.** A `PATCH` with decisions re-runs the dry run, so the counts shown
   are the commit's.
4. **Commit** (phase `commit`). The same steps, planning and writing, a record
   per transaction; the import's files (harvest and ZIP) are deleted at the end.

Status: `pending → scanning → analysing → ready → running → completed`, with
`failed`, `cancelled` and `expired`. One import at a time. `technoware:prune-site-imports`
(hourly) expires a `ready` import past three days, fails one stuck two hours,
deletes the files of cancelled and expired ones and removes an upload nobody
started after a day.

## Reading a live site

`SiteCrawler` is `Newsletter\WebsiteCrawler`'s shape for one host (that class is
tied to harvesting addresses): a frontier and a visited set (in `state.json`),
`Robots` read once per host and obeyed, a host asked at most every `delay_ms`
(500), `SafeHttp` for every request (public hosts, pinned, redirects checked),
a page read to 2 MB. It seeds from the start page and `/sitemap.xml` (an index
is followed one level), follows same-site links (`www.` or not) to `depth`
(0–6) and `max_pages` (≤ 1000), skips files and the obvious dead ends (cart,
login, feeds), and keeps only `200` HTML. A page not kept — robots, a 404, not
HTML, unreadable — is counted under its reason with examples. A scan that
finds no page fails with the first reason as its sentence.

`SITE_IMPORT_ALLOW_PRIVATE=true` lets a site on this machine be read (also plain
http) and is ignored unless `APP_ENV=local` (`config/site_import.php`).

## Reading a ZIP

The ZIP arrives through `POST imports/site/upload` in 1.5 MB chunks (the release
zip's route and client code: `lib/chunk-upload.ts`, shared with System →
Updates), is held at `site-imports/uploads/{user}-{name}` until the scan is
started, and is moved to the import's own folder. `ZipSource`:

- **zip-slip**: `relative()` refuses an absolute path, a drive letter, a `..`
  segment and a NUL byte (modelled on `BackupPaths::restoreTarget`); the
  one top-level folder the whole ZIP sits in is not part of every address
  (`prefix()` ignores unsafe entries when deciding);
- **caps**: 5,000 files and 500 MB declared (checked before anything is read),
  and the bytes *actually read* per file and in total (a ZIP's declared sizes
  are a claim); 2 MB for a page, 50 MB for any other file;
- **allowlist**: html, htm, css, jpg, jpeg, png, gif, webp, avif, svg, ico, pdf,
  woff2. Anything else — scripts, PHP, archives — is counted in the review and
  never written. `__MACOSX/`, dot files and `404.html`-style error pages are
  left out;
- HTML becomes pages (`https://zip.import/…` is the origin they pretend to live
  at, so relative addresses resolve; nothing ever requests it), the rest is
  written under `files/` on the **private** disk. Nothing is executed or served.
  A picture is copied from there into the media library when a page uses it
  (the library checks it again — extension against bytes, size, megapixels, the
  SVG sanitiser).

## Understanding a page

### Chrome

`Chrome` tallies, for every page, the blocks that could be furniture — every
`<nav>`, `<header>`, `<footer>`, `<aside>` and `role=banner|navigation|contentinfo`,
and any `<div>`, `<section>`, `<ul>`, `<form>`, `<table>` or `<article>` up to
three levels below `<body>` — as a hash of tag, tag skeleton and words. A block
on **at least 60% of pages, and at least three pages** is the site's chrome.
Independent of repetition, by what they are: `<nav>` always; a `<footer>` or
`role=contentinfo` not inside an `<article>`, `<section>`, `<main>` or `<aside>`;
a `<header>` / `role=banner` that holds a menu and no `<h1>`. A `<header>` that
holds the page's `<h1>` is the page's own masthead and is content (its `<nav>`
goes). Never repeated-chrome: a block holding an `<h1>` or `<main>`.

Only **container** tags count as repeated chrome, and a block must have 12
characters of words — a link in the menu ("About") must never make every
paragraph link to About furniture (found by a test: an inline element was
being compared with the same words in the menu). The chrome is removed from
every page's body; the page's `<title>` (the site's name taken off, `SiteName`)
and `<h1>` are read before it goes. `<main>` / `role=main`, when it has words,
is the content; otherwise the body.

The **menus** come off the home page before its chrome is removed: the primary
menu from the first `<nav>` outside the footer (else the header's first list of
links, else the first repeated block that is a list of ≥ 3 links), the footer
menu from the first inside it. `NavReader`: the first top-level list, its
nested lists as children (3 deep), a dropdown toggle with no address a heading;
without lists, the links in a row.

### The generic recognisers

`RenderedSections::siteRecognisers()` = the WordPress builders' recognisers
**first** (they key on class names a hand-written site sometimes shares —
`accordion-item`, `testimonial`, `counter` — and must keep claiming them; a
unit test runs WordPress snippets through both lists and requires identical
results) then these, which key on structure (`Recognisers/Structure.php`):

| Recogniser | Detects | Becomes |
|---|---|---|
| `GenericHero` | the opening block that holds the `<h1>`, ≤ 520 characters, one picture at most, no list/table/form, no plain links — **and every word of it is the headline, one line before it, one line after it or a button**; else it is not a hero (a hero keeps only those) | `hero` (`cover` with the `<img>` or inline `background-image`, else `centered`) |
| `RepeatedCards` | ≥ 3 sibling blocks of one shape (≥ 80% alike) each with a heading, short (a card, not an article), no form | `features` (title, text, link; a card's picture is not kept — a features item has an icon, no photograph) |
| `LogoStrip` | ≥ 4 pictures and ≤ 60 characters of words | a **gallery** (`Parts`). The `logos` section draws this site's own clients/brands, which an imported strip is not |
| `StatsRow` | 2–6 children that are each a short number (with a unit: `340+`, `99.9%`, `4h`, `24/7`) and a short label | `stats` (figures) |
| `DetailsFaq` | a `<dl>`, or ≥ 3 headings that end in `?` each followed by its answer (`<details>` is the WordPress `FaqRecogniser`'s) | `faq` |
| `QuoteBlock` | a `<figure>` with `<blockquote>` + `<figcaption>`, or a `<blockquote>` with a `<footer>` | `testimonial` / `testimonials` |
| `MediaTextBlock` | exactly two columns (after single wrappers): one a picture with ≤ 40 characters, the other a heading and words, no form; the side is kept | `media_text` (its buttons are the section's, not its body) |
| `CtaBand` | a short block (≤ 320 characters) of one heading, ≤ 2 paragraphs and 1–2 buttons, nothing else | `cta` |
| `MapEmbed` | an iframe whose address begins `https://www.google.com/maps/embed` (the only kind the `map` section takes) | `map` |
| `VideoEmbed` | a `<video>` playing an MP4 (YouTube is `VideoRecogniser`'s) | `video` (MP4, from the library) |
| any `<form>` | `FormRecogniser` (already generic) | a **form** (`Parts::form()`) |

A *button* is a link styled as one (`btn`, `button`, `cta`, `role=button`, a
Tailwind `px-*` + `py-*` pill) **or standing in a row beside one** (a hero's
quieter second link). The page's markup is handed to the walker inside one
`<div>` when it has no loose words at its top, so questions or columns that sit
straight under `<body>` can be looked at whole.

Everything else is gathered into text sections, split at the main headings
(`RenderedSections` / `BodySections`). Every section must pass
`SectionRules::for()`; one that does not stays its words.

### SEO

Per page: `<title>` with the site's name taken off (an override only if it
differs from the page's title), the meta description, `og:image` (into the
library), `noindex` as `noindex, follow`. A **canonical is never copied**: it
names the old address, and this site derives its own.

## The steps

`Importer::steps()` — the dependency order. Pages → Menus → Links → Redirects;
media is counted under its own key as pages ask for it.

| Step | Becomes | Notes |
|---|---|---|
| Pages | `Page`, `template: builder`, `blocks`, **draft** | slug = old path with `/` → `-` (`home-page` for `/`); a slug this site routes, a page's or a content type's gets the next free one, and the review says so; never changed on a second run |
| Files and pictures | media, in a "Site import" folder | every `<img>`, inline `background-image`, same-site document link (pdf, doc, xls, ppt, zip, csv, txt) and `og:image`; any host's pictures; alt text from `alt` |
| Forms, pricing tables and galleries | forms and galleries made by `Parts` | **published** (as the WordPress import does: a page's `form` section needs a published form) but reachable only through the draft page |
| Menus | `Menu`, **unassigned** | items for imported pages are `page` items; others a path or address (`LinkPattern`) |
| Links | internal `href`s in the sections rewritten | via `LinkRewriter`, shared with the WordPress import; a link to the old home page is `/`; an unresolved internal link in a ZIP becomes its bare path |
| Redirects | a 301 from each page's old address | both `/about.html` and `/about`; not for `/`; never over a route / page / archive this site serves (`Redirects::live`); chains shortened |

## Rules worth knowing

- **Dry run and commit are one loop** (`Importer::run`) with the WordPress
  importer's cursor (`step`, `offset`, `report`, `planned`) plus the review's
  `rows`. A page is planned with `layout(writes: false)` — media "planned" and
  counted, `Parts` counting — and written with `writes: true`; the commit
  plans first too, so parts are counted in the result as in the review.
- **Re-running updates rather than copies.** The map is `wordpress_import_map`,
  keyed by `sha1('static:' . host)` (`static:zip:<name>` for a ZIP) — no new
  table, and `wordpress_import_id` is left null (it is a foreign key to the
  WordPress imports). A page's *fingerprint* (title + sections in canonical key
  order — MySQL's JSON reorders keys) is stored beside it as a `page_hash` map
  row; a page whose current fingerprint differs from the one the import last
  wrote has been **edited here** and is left alone (a warning in the review).
  The links step updates the fingerprint when it rewrites a page.
- **Everything is a draft; menus are unassigned; nothing is mailed.** The home
  page is made the site's (`homepage_page_id`) only when ticked, and the
  public settings name it only while it is a published builder page.
- **All HTML goes through `HtmlSanitiser`**; scripts, styles and inline styles
  are never kept. A body's pictures are re-homed in the library, `srcset` dropped.
- **Pictures come from anywhere** the page showed them (a CDN, a stock
  library), through `SafeHttp`, capped at 50 MB, with the same extension list
  as any upload; an address with no file extension is named and skipped.
- **A page is "its own words"**: a hero or a card list that would drop a word is
  left as text. This is a deliberate trade — fewer clever sections, no lost
  copy — and the first thing to loosen is `GenericHero`'s accounting.
- **`SITE_IMPORT_DELAY_MS`** (default 500) bounds the crawl's politeness.
- `MediaDownload::toTemp` is the download both imports use (extracted from
  `WordPress\Context`); `Import\Redirects` and `Import\LinkRewriter` are the
  redirect writer and href rewriter extracted from the WordPress steps;
  `Import\PartsHost` is the interface `Rendered\Parts` needs of whichever import
  runs it. The WordPress tests passed unchanged across the refactor.

## API

See `API.md`, "Importing a website (`role:admin`)".

## Tests

`tests/Feature/SiteImportTest.php` — the whole flow against a faked site
(`Http::fake()` + `preventStrayRequests()`, `PublicHost::RESOLVER` bound): the
review's counts and skipped reasons with nothing written, the commit's counts
equal to the review's, drafts only, builder pages with the chrome gone, menus
unassigned, media in the library, a form and a gallery made, links rewritten and
redirects written (and none over a route), the home page set only when ticked,
a page and a menu left out, a second import updating in place and leaving an
edited page alone, private and bad addresses refused, an uploaded ZIP read in
chunks with zip-slip, the extension allowlist and the file and size caps, files
deleted after, the prune command. `tests/Unit/SiteImportRecognisersTest.php` —
each generic recogniser on the four fixture sites (`tests/fixtures/site-import/`:
Bootstrap, Tailwind, Webflow, plain) and the WordPress-unchanged guarantee.
`tests/Unit/SiteImportChromeTest.php` — chrome, menus, addresses, the site name
and the ZIP name checks.
