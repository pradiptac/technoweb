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

**Two releases.** 0.163.0 is sources, chrome stripping, the generic
recognisers, pages, media, SEO, menus, links and redirects. 0.164.0 adds the
AI fallback for blocks the rules cannot place, page / post / product
classification (the review's `kinds` replaced its `skip` list, which is still
accepted) and the site's brand colours and fonts, and closes three gaps part 1
left: a banner with no `<h1>`, pictured cards that lost their pictures, and
Vimeo.

## The flow

1. **Scan** (`RunSiteImport` phase `scan`, sliced at 35 s). A URL import is
   walked by `SiteCrawler`; a ZIP is unpacked by `ZipSource`. Either writes
   `pages.jsonl` (`{url, path, title, status, html}`) under
   `storage/app/private/site-imports/{id}/` (`Harvest`, parameterised by base
   directory), with `state.json` (`ScanState`) the memory between slices. Then
   the **chrome** phase tallies every page's candidate blocks and, when done,
   decides what is furniture, the site's name, the home page and the menus, and
   writes them to `analysis.site`. A URL import reads the site's own
   stylesheets between the crawl and the chrome phase (`StyleSheets`, phase
   `assets`: the `<link rel="stylesheet">`s the crawl met on the site's own
   host, up to 12, ≤ 1.5 MB each, into the harvest's `assets` collection); a ZIP's
   `.css` files are added to it as they are unpacked. The brand is read from
   them last (`analysis.site.brand`).
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
| `RepeatedCards` | ≥ 3 sibling blocks of one shape (≥ 80% alike) each with a heading, short (a card, not an article), no form | `features` (title, text, link) — or, when at least half the cards show a picture, a **`layout`** section: a card per column (picture, heading, words, link), three or four to a row, nine to a section (a features item has an icon, no photograph, so it could not keep them) |
| `HeroBlock` | the opening block with **no `<h1>`**, classed `hero` / `masthead` / `banner` / `jumbotron` / `intro` / `splash` / `showcase` / `cover` (or holding one such wrapper), with a headline (`<h2>`–`<h4>`, or an element classed `title` / `headline` / `display`) and a button — and, like `GenericHero` (whose accounting it shares, `Structure::hero()`), nothing else in it | `hero` |
OLD_X],
[<<<'OLD_X'
| `VideoEmbed` | a `<video>` playing an MP4 (YouTube is `VideoRecogniser`'s) | `video` (MP4, from the library) |
OLD_X, <<<'NEW_X'
| `VideoEmbed` | a `<video>` playing an MP4 (YouTube is `VideoRecogniser`'s) | `video` (MP4, from the library) |
| `VimeoEmbed` | an `<iframe>` to `player.vimeo.com` / `vimeo.com` with a numeric id (also from `data-src`) | a **text** section holding `<iframe src="https://player.vimeo.com/video/{id}">` rebuilt from the id — the `video` section plays YouTube or MP4 only, and the editor's sanitiser lets a body carry a Vimeo player; nothing else in the `src` (a query, `autoplay`) comes along |
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

### The AI fallback

`AiSections` — off with the assistant, with no key, and when the review's
**"Use AI to place what the rules could not"** is off (it defaults to on only
while the SEO assistant is switched on with a key). It looks at a **text**
section the rules left (`RenderedSections` calls it just before a text piece
is kept as text) when the block has 25–500 words and enough shape — sub-headings,
a list of three or more, pictures, links, a table: `Outline::measure()`, a score
of 3 — which prose never has. A post or a product is never offered: an
article is prose and a product's words are its description.

- **The model sees text.** `Outline` renders the block as lines (`#` headings,
  `- ` list items) with numbered `[L1]` links and `[P1: alt]` pictures, inside
  a `---WEBSITE COPY---` fence that the instructions call material, never an
  instruction (the marker is stripped from the copy until none is left). It
  never gets markup, attributes or scripts.
- **It answers in the page draft's vocabulary** (`PageDraft::guide()` and
  `data()` made public): one of `hero` (only on the first block), `rich_text`,
  `media_text`, `features`, `steps`, `checklist`, `faq`, `cta`, or `{"type":
  "none"}`. Not `cards` (a live list of this site's own records) and not `flow`.
  A button's link and a picture are *numbers*; rich text is built from escaped
  paragraphs; a number outside the block's own lists is dropped.
- **Then the section's own rules** (`SectionRules::forPayload`) and a
  **coverage check**: at least 60% of the block's words survive into the
  section and at least 80% of the section's words are the block's. A section that
  changes the words, or invents any, stays the block's text. (The `after()`
  media check is not run: in the dry run a picture is only planned.)
- **Cost.** It shares the assistant's switch, key, model and daily cap
  (`PageDraft::refusal()`), counts one run per block *used*
  (`SeoAssistant::countRun()` — a refusal or an answer that fails the checks is
  free), asks at most eight blocks a page and `SITE_IMPORT_AI_MAX_BLOCKS` (150)
  a import.
- **The ledger.** `AiLedger` is `ai.json` beside the harvest, keyed by the
  block's hash and holding the model's answer *in its own vocabulary* (numbers,
  not paths), so the dry run's planned pictures and the commit's real ones read
  the same answer. The commit finds every answer there and makes the review's
  sections without asking — including a block the daily cap or the per-import
  limit stopped, written down as `cap` / `limit` so the commit cannot decide
  differently by being a day later. A fresh dry run (after changing a choice)
  forgets only what a limit stopped.
- **The review marks them**: a count and an "AI placed n" badge per page, and a
  notice naming the total.

### Page, post or product

`PageKind::detect()` decides from what a page says about itself, most trusted
first: structured data (`BlogPosting`, `Article`, `NewsArticle`… → post;
`Product` → product), `og:type`, `article:published_time`, an `<article>` with a
`<time>` and an author (a byline, `rel="author"`, JSON-LD, `<meta name=author>`),
an address under `/blog/`, `/news/` (and a few other folders) that is not a
listing (`category`, `tag`, `page`, `author`, `archive`, a year or a month), and a SKU
(`SKU:`, `Part No.`, `MPN:`…, or JSON-LD) beside a specification table
(`Specs`: two-column rows or a `<dl>`, three or more). The home page always is a page.
A page with *some* of those signs and not enough is **ambiguous**: it is a page
unless the AI is on, in which case the model is shown the page as text and
answers one word (counted against the same cap, kept in the ledger).
The review's select overrides all of it (`kinds`: `page`, `post`, `product`,
`skip`); the table says who settled each — rules, the AI, or you.

`PagesStep` reads *every* page, sorts it and notes the kind in
`Context::kinds` (carried in the checkpoint like `rows`); `PostsStep` and
`ProductsStep` extend it, take the records of their kind, and hand their
delegated twin back (`Outcome::delegated` — nothing counted, nothing written).

| Becomes | Written as |
|---|---|
| Post | draft `BlogPost`: `body_layout` `sections` with the same sections, `body` = the text sections joined (reading time and the switch back to a written body keep working), `published_at` from JSON-LD / `article:published_time` / the first `<time>`, the cover from `og:image`, the excerpt from the meta description. The slug drops the old blog folder (`/blog/my-post` → `my-post`). The author is not kept (a staff account writes a post here) and the review says so |
| Product | draft catalogue `Product`, **no price** (the catalogue has none): `specifications` from the page's table or `<dl>` in order (taken out of the sections so they are not repeated), the share image and up to seven of the page's pictures as `images`, the meta description as the short description, a SKU named on the page, `body_layout` `sections`. No brand or category is guessed. The slug is the last path segment, never one a product category has (that URL would open the category) |

Menus, links and redirects know the new kinds: a menu item for an imported post
or product is a `blog_post` / `product` record reference, a link to one is
rewritten to its public path, and a 301 is written from its old address — for a
post under `/blog/` or a product under `/products/` (routes here) the redirect is
refused only if a record already has that slug, not because the folder is a route
(`RedirectsStep::taken()`; `Redirects::write()` takes a `live` check). Map keys
are `page`, `post` and `product`; the fingerprint map (`page_hash`) is shared.

### Colours and fonts

`Brand::detect()` reads the harvested stylesheets and the `<style>` blocks of
the first six pages and settles, by what a colour is used *for*:

- **Primary** — `--primary` / `--brand` custom properties (weight 6), the fill
  of `.btn` / `button` / `.cta` (4), link colours (3); **Secondary** and
  **Accent** from variables named so, else the next strongest colours at least
  25° of hue from those already chosen; **Background** and **Text** from `body`;
  **Top bar** from the header / navbar's background when it is not the page's.
  Only a colour with chroma (saturation ≥ 25%, lightness 12–88%) can be a brand
  colour — whites, blacks and greys never are — and a role the stylesheets do
  not settle stays empty and is left alone.
- **Fonts** — `body`'s first non-system family and the headings' (`h1`–`h3`,
  `--font-heading`), matched by name to the vendored faces (`Brand::FONTS`,
  pinned to `web/src/lib/font-choices.ts` by `SiteImportBrandTest` as
  `ReservedSlugs` is to the app folder, including which faces may be a body
  face). A family that is not vendored but arrived as a same-site WOFF2 file
  (`@font-face`) is offered for a custom slot (`CustomFonts`); one with neither
  is only named.

**It is applied only when the review's "Use this look for this site" is on**
(`brand.accept`, off by default; `colours` and `fonts` are two sub-ticks, on once
accepted). `BrandStep` runs in the commit only: it installs a font file into a
custom slot that is **empty** (an uploaded font of yours is never replaced; the
report says so), then calls `SettingController::update()` with `theme` =
`custom`, the colours and the font ids — the settings screen's own validation —
so a refused value is a notice, not a half-written theme. The website's
cache is purged the way a settings save purges it: the console's poll that sees
the import complete calls `updateTag("settings")` (the API has no way to reach
the website's cache; if nobody is watching, the public site picks the change
up when the settings fetch's ten-minute window turns over). The review shows
the six swatches, the two typefaces and what will happen to each, and a
**Preview** (`BrandPanel`, a modal framing `/theme-preview/current` and posting
the tokens `generate()` would make — the Appearance tab's own preview).

### SEO

Per page: `<title>` with the site's name taken off (an override only if it
differs from the page's title), the meta description, `og:image` (into the
library), `noindex` as `noindex, follow`. A **canonical is never copied**: it
names the old address, and this site derives its own.

## The steps

`Importer::steps()` — the dependency order. Pages → Posts → Products → Menus →
Links → Redirects → Brand (commit only, if accepted); media is counted under its
own key as pages ask for it.

| Step | Becomes | Notes |
|---|---|---|
| Pages | `Page`, `template: builder`, `blocks`, **draft** | slug = old path with `/` → `-` (`home-page` for `/`); a slug this site routes, a page's or a content type's gets the next free one, and the review says so; never changed on a second run |
| Blog posts | draft `BlogPost` | the pages sorted as posts; see "Page, post or product" |
| Catalogue products | draft `Product` | likewise, without price |
| Files and pictures | media, in a "Site import" folder | every `<img>`, inline `background-image`, same-site document link (pdf, doc, xls, ppt, zip, csv, txt) and `og:image`; any host's pictures; alt text from `alt` |
| Forms, pricing tables and galleries | forms and galleries made by `Parts` | **published** (as the WordPress import does: a page's `form` section needs a published form) but reachable only through the draft page |
| Menus | `Menu`, **unassigned** | items for imported pages, posts and products are `page` / `blog_post` / `product` items; others a path or address (`LinkPattern`) |
| Links | internal `href`s in the sections rewritten | via `LinkRewriter`, shared with the WordPress import; a link to the old home page is `/`; an unresolved internal link in a ZIP becomes its bare path |
| Redirects | a 301 from each page's old address | both `/about.html` and `/about`; not for `/`; never over a route / page / archive this site serves (`Redirects::live`); chains shortened (a path directly under `/blog` or `/products`, routes here, is refused only where a record has that slug) |
| Colours and fonts | `theme` = `custom`, the six `theme_*` and the two `theme_font_*` settings, a custom font slot | commit only, and only when accepted; see "Colours and fonts" |

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

0.164.0: `tests/Feature/SiteImportKindsTest.php` — pages sorted by the rules and
the commit's counts equal to the review's (posts, products, media, menus), a
post's date / cover / excerpt / body and a product's ordered spec sheet, a
header link to a post as a `blog_post` item, a `.html` post address redirected
though `/blog` is a route, a kind chosen in the review honoured and `skip` still
working, a second import updating instead of copying; the AI placing a block
(the model sent text and never markup, the review's `ai` count, the commit
asking nothing more, one run counted), copy that changes the words refused, the
daily cap respected and the commit keeping the review's decision, nothing asked
when it is off / has no key / is turned off in the review, an ambiguous page
settled by the AI and a person's choice beating it; the brand found, never
written unless accepted, applied through the settings rules, a custom slot that
holds a font never replaced, and a ZIP's stylesheet read. The AI is faked
(`AiProvider`) under `Http::preventStrayRequests()`.
`tests/Unit/SiteImportBrandTest.php` (known CSS → hexes, greys never a brand,
fonts matched or offered as files, the font list pinned to the frontend's) and
`tests/Unit/SiteImportKindTest.php` (`PageKind`, `Specs`, `Outline`, `HeroBlock`,
`VimeoEmbed`, pictured cards).
