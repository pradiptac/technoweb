# Content-type presets

A newsroom, an investors page, testimonials and awards, each installed with
one press (0.186.0). A preset is not a module of its own: it is an ordinary
custom content type (`docs/custom-content.md`) with a `preset` key, a field
group whose fields its layout reads, and an archive drawn for the purpose.

The client's decisions, taken 2026-10-20:

- **Fields, a purpose-built layout, a builder section, and two extras**: a
  newsroom RSS feed and investor email alerts.
- **No review markup on testimonials.** Google ignores a business's praise of
  itself on its own site and can flag it; the quotes carry no `Review` or
  `Quotation` graph.
- **Testimonials feed what already exists**: the builder's Testimonials
  section can read them, and the homepage's pull-quote can be the newest
  featured one. Everything typed today keeps working.
- **Awards are their own preset at `/awards`**, linked to and from
  Certifications — an award never expires, so it is not a kind of certificate.
- **An investor document has a switch, "Email subscribers when published"**,
  off by default, and a "Send alert now" button.
- **The newsroom is press releases, coverage and a media kit.** No embargo
  beyond the scheduled publishing every entry already has.
- **Built on custom content types**, not four new modules, so entries get the
  editor, SEO, search, menus, history, share links, bulk actions, site health
  and semantic search for nothing.
- **A content manager may send an investor alert**: one fixed message, about
  a live document, to one list.

---

## A preset is found by `preset`, never by its address

`content_types.preset` is one of `newsroom_releases`, `newsroom_coverage`,
`investors`, `testimonials`, `awards`, unique when set, written only by
installing (`PATCH /admin/content-types/{id}` prohibits it). Every piece that
needs a preset — the archive layouts, the RSS route, the builder section, the
homepage quote, the investor alerts — looks the type up by that key
(`ContentType::scopePreset`). An editor may rename `/newsroom` to `/press`
and nothing breaks; a test renames the testimonials type and reads the
homepage quote through it.

`App\Support\Presets\Presets` is the one list: per install key (`newsroom`,
`investors`, `testimonials`, `awards`) the type defaults and the fields. The
newsroom installs two types, Press releases and In the news.
`PresetInstaller` makes them in one transaction, refuses a preset already
installed (422 on `key`) and an address already taken, naming what holds it
(422 on `slug`, or `coverage_slug`). The field group is named
`preset-<preset>`, `hidden`, so the generic "Details" list does not repeat
what the layout draws. Deleting the type — allowed only while it is empty —
deletes that group, and the preset can be installed again.

## Locked fields

A field the layout reads by key is `custom_fields.locked`. Its key and its
kind cannot change and it cannot be removed — a 422 on `fields.N.key`,
`fields.N.kind` or `fields`, naming the preset — and the group cannot be
deleted on its own, detached from its type, switched off (every layout would
read empty custom data) or given another slug. Deleting the preset type
deletes the groups holding its locked fields, found by target, never by slug. The label, the help, whether
it is required and a dropdown's options stay the editor's. The lock and the
financial year's shape (`settings.pattern`, `^\d{4}-\d{2}$`) are kept by the
API on every save, whatever the form sends; the field builder offers no way
to set either.

## An entry with no page of its own

`content_types.entry_pages`, true by default. Testimonials, coverage,
investor documents and awards install with it off: the entry's detail read
is a 404, `Entry::publicPath()` is the archive, so search, menus, share
paths, site health's links and `EntityLinks` all lead there, and the sitemap
and `llms.txt` list the archive only. The entry form's slug hint says so.

## What the pages read

`GET /types/{type}` is unchanged in shape. For a preset type its rows carry
`custom_data` (loaded only then), and `meta.type` carries `preset` and
`entry_pages`. Investors also gets `meta.document_types` — **only the types
a published document uses**, read before `?type=` filters, so every view
shows the same chips and none leads to an empty list — and accepts `?type=`
and `?year=`; testimonials accept `?featured=1`. The newsroom gets
`meta.newsroom_kit`, the published downloads in the category chosen for it.
A filtered read is never ISR-cached (`cache: false`), and a filtered view is
`noindex`.

The layouts are `web/src/components/presets/` — one archive each, drawn by
the `[slug]` route when `meta.type.preset` is set, built from the parts in
`preset-parts.tsx` (`ReleaseRow`, `CoverageCard`, `InvestorRow`, `QuoteCard`,
`AwardBadge`, `ContactCard`), which the builder section draws from too. Each
stamps `data-preset` and `data-preset-item` so a theme may restyle it. Two
things that read as failures were taken out on sight: an empty well beside a
release with no picture, and a year disc on an award with no badge.

A press release's page wraps the body in `ReleaseFrame`: "For immediate
release", the dateline in capitals with the date, then the PDF, "About
{company}" and the media contact — the release's own when it names one,
else the newsroom's.

## Preset settings

Two public groups the pages draw, `newsroom` (`newsroom_boilerplate`, rich
text; the press contact; `newsroom_kit_category_id`) and `investors` (the
investor contact; `investors_signup_line`). Settings are `role:admin`, so a
content manager edits these through
`GET|PATCH /admin/content-types/{id}/preset-settings`, which names its keys
per preset and refuses any other — the store promo's door — and cleans the
boilerplate through `HtmlSanitiser`. The console draws them as a panel below
the type's form, never inside it.

## The homepage quote

`testimonial_source` (`typed`, the default, or `preset`). With `preset`,
`PublicSettings::build()` puts the newest published, featured testimonial
onto the three keys every theme's `WhyUs` already reads —
`testimonial_quote`, `_author`, `_role` — so no theme changes; with none
featured, the typed quote stands. The role is sent even when blank, so the
typed role is never drawn under somebody else's quote. Only a testimonial's
save purges the website's `settings` tag (`lib/entry-tags.ts`, pinned by
`scripts/entry-tags.check.mjs`): that tag is read by the marketing layout, so
purging it for every entry would re-render every cached public page. The
boilerplate is cleaned at both doors — the preset-settings one and
`PATCH /admin/settings`.

## The builder

**From a preset** (`preset_list`): `preset` (an installed one, 422
otherwise), `limit` 1–12, `document_type` for investors. The presenter
builds a light row — no body — because `EntryResource` sends the body on any
`*.show` route and `GET /pages/{slug}` is one. Dropped when the preset is
missing, switched off or empty. Card rows size to how many cards there are.
A new section starts on the first installed preset: `Choice`'s fallback is
shown and never written, so an untouched one would save without one.

**Testimonials** gains `source` (`custom`, the default, never stored, or
`preset`), with `featured_only` and `limit` 2–9. From the preset it presents
the typed section's item shape, plus `company_logo`, so the component cannot
tell where the quotes came from; fewer than two drops it.

## Investor alerts

The list is a standing newsletter group found by `source: investors`
(`Presets::investorGroup()`). The investors page's signup posts to
`/newsletter/subscribe` with `list: investors`: the same intake, honeypot,
suppression list and 202-always answer, into that group; with the preset not
installed the answer is the same and nothing is written.

`InvestorAlerts::send()` claims `alert_sent_at` with a conditional UPDATE —
two presses, or a press and the sweep, send once — then builds an ordinary
campaign from a fixed message and queues it through `CampaignSender` behind
its blocking health checks. The message carries **no header logo** and two
sentences: the health check refuses a short email with a picture in it. The
sender is `newsletter_from_*`, else `mail_from_*`, else the mail config. A
refusal releases the claim, deletes the campaign and writes `alert_error`,
which keeps the document out of `due()` until a save clears it — a broken
setting is not retried every ten minutes. It never throws to its caller.

`technoware:send-investor-alerts` runs every ten minutes, which is what
catches a document scheduled for later; a save of an investors entry
dispatches the same sweep after commit. `POST
/admin/content-types/{type}/entries/{id}/alert` is the button.

An exception after the campaign has left Draft and Ready keeps the claim
(the newsletter is sending it; releasing it would let a save and the sweep
send a second email); one before that deletes the draft campaign and
releases the claim with `alert_error`.

## The newsroom feed

`/{type}/feed.xml` (`web/src/app/(marketing)/[slug]/feed.xml/route.ts`) —
the thirty newest releases, escaped at the sink, cached under the type's
tag, a 404 for any type that is not the newsroom's. A static segment beats
`[entry]`, and a dot cannot appear in a slug. The archive names it in
`<link rel="alternate">`, and `llms.txt` lists it.

## Deliberately out

An embargo; review or quotation markup; share-price feeds; pages for
coverage, investor documents, testimonials or awards (an editor can switch
`entry_pages` on, and the generic page then draws); detaching a preset into
a plain type; alerts for anything but investor documents.

## Tests and checks

`ContentPresetsTest` (installing, clashes, locked fields, `entry_pages`, the
archive's data and filters, found by preset, the homepage quote, the
settings door, every preset type saving unchanged through its form),
`InvestorAlertsTest`, `PresetSectionsTest`. `scripts/probes/content-presets.mjs`
checks the strip, every installed archive at 360 and 1280 and the feed. The
audits take the five archives at their default addresses when they answer
200 (`PRESET_ROUTES`), and the mock installs all four.
