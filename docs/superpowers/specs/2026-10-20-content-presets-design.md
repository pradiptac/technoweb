# Content-type presets — design (C1, 0.186.0)

Track C of the 2.0 roadmap begins here. Agreed in conversation on 2026-10-20.

## Intent

A corporate buyer should get four sections a listed or mid-size company is expected to have — a **newsroom**, an **investors** page, **testimonials** and **awards** — with one press each, instead of assembling them field by field in Custom content types. Success: from nothing to a published, good-looking investors page in minutes, in every theme.

## The client's decisions

1. **Fields, a purpose-built layout per preset, a builder section, and two extras** (question 1, option C): a newsroom RSS feed and investor email alerts.
2. **Review markup is dropped.** Google ignores self-serving reviews of a business on its own site and can flag them; testimonials carry no `Review` or `Quotation` markup.
3. **Testimonials feed what already exists**: the builder's Testimonials section gains a source, and the homepage quote can read the newest featured testimonial. Everything typed today keeps working.
4. **Awards are their own preset at `/awards`**, linked to and from Certifications — not a type of certification.
5. **Investor alerts: a per-document "Email subscribers when published" switch, default off, plus a "Send alert" button.**
6. **The newsroom is press releases, external coverage and a media kit.** No embargo beyond the scheduled publishing entries already have.
7. **Approach 1: presets are built on Custom content types**, not four new modules.
8. **A content manager may send an investor alert** — one fixed message, about a live document, to one list.

## What exists and is reused

- Custom content types (`docs/custom-content.md`): `content_types`, `entries`, custom field groups, the archive branch of `(marketing)/[slug]/page.tsx`, the entry route `(marketing)/[slug]/[entry]/page.tsx`, `Entry::scopePublished()`, the console's Content types and Custom content screens, and every registry an entry already joins (SEO, search, menus, sitemap, `llms.txt`, share links, page history, site health, bulk actions, semantic search).
- The downloads centre's categories, for the media kit's files.
- The newsletter: groups with a `source`, `SubscriberIntake`, `POST /newsletter/subscribe`, `CampaignSender` and its blocking health checks.
- The builder's `Testimonials` section, `SectionRules`, `SectionPresenter`.
- The store feed's RSS rendering at the sink.

## Data

### Schema (one migration, additive)

| Column | Meaning |
|---|---|
| `content_types.preset` | nullable string, unique when set: `newsroom_releases`, `newsroom_coverage`, `investors`, `testimonials`, `awards` |
| `content_types.entry_pages` | boolean, default `true`. False: entries have no page of their own |
| `custom_fields.locked` | boolean, default `false`. Set only by a preset install |
| `entries.alert_on_publish` | boolean, default `false` (investors only) |
| `entries.alert_sent_at` | nullable timestamp |
| `entries.alert_error` | nullable text — the last refusal, in the health gate's words |

### `App\Support\Presets\Presets`

The one list. Per preset: the key, the type defaults (`name`, `plural`, `slug`, `icon`, `description`, `sort`, `schema_type`, `has_body`, `has_image`, `archive_enabled`, `entry_pages`), and one field group of field definitions. The newsroom is one install of two keys (`newsroom_releases` then `newsroom_coverage`). Bold fields are locked.

| Preset | Default slug | Type | Entry columns used | Fields |
|---|---|---|---|---|
| `newsroom_releases` | `newsroom` | Article, entry pages, newest | title (headline), summary, body, image, published date | **`dateline`** text (the city), **`release_pdf`** file, `contact_name`, `contact_email`, `contact_phone` (override the newsroom's press contact) |
| `newsroom_coverage` | `in-the-news` | WebPage, no entry pages, newest | title (the article's headline), summary (a line quoted from it) | **`publication`** text required, **`article_url`** link required, **`publication_logo`** image, **`coverage_date`** date |
| `investors` | `investors` | WebPage, no entry pages, newest | title (the document's name) | **`document_type`** dropdown (seeded: Financial results, Annual report, Shareholding pattern, Board meeting outcome, Notice of meeting, Corporate governance, Policy, Stock exchange filing, Other — options editable), **`financial_year`** text, shape `^\d{4}-\d{2}$`, **`document`** file required, **`document_date`** date |
| `testimonials` | `testimonials` | WebPage, no entry pages, manual | title (the person's name) | **`quote`** long text required, **`role`** text, **`company`** text, **`photo`** image, **`company_logo`** image, **`featured`** yes/no |
| `awards` | `awards` | WebPage, no entry pages, newest | title (the award), summary (an optional line) | **`awarding_body`** text required, **`year`** number required (1900–2100), **`category`** text, **`badge`** image, **`link`** link |

`financial_year`'s shape is a custom-field `settings` rule the field kind already carries (`max_length`) plus a new optional `pattern`, set only by presets and not offered in the field builder.

### Locked fields

A locked field's `key` and `kind` cannot change and it cannot be deleted — a 422 on `fields.N.key` / `fields.N.kind` / the group naming the preset ("The Investors layout reads this field."). Its label, help, required flag and options stay editable; removing an option entries use is already refused. The lock is enforced in the group's update, so the console's disabled controls are a convenience.

### Settings

Two public groups, drawn by the pages and edited on the preset type's own form under a **Preset** tab:

- `newsroom`: `newsroom_boilerplate` (rich text, `cms` profile), `newsroom_contact_name`, `newsroom_contact_email`, `newsroom_contact_phone`, `newsroom_kit_category_id` (a Downloads category id, or blank; options from the API).
- `investors`: `investors_contact_name`, `investors_contact_email`, `investors_contact_phone`, `investors_signup_line` (plain text, 200).

## API

### Installing

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/content-types/presets` | `[{key, label, blurb, slug, fields[{key,label,kind}], installed: {id, slug} \| null, clash: string \| null}]`. The newsroom is one row covering both keys. Declared above `content-types/{id}` |
| `POST` | `/admin/content-types/presets/{key}` | `slug?` (and `coverage_slug?` for the newsroom). One transaction: the type(s), the field group, and for `investors` the "Investor updates" newsletter group (`source: investors`, reused if it exists). **201** with the type(s). 422 on `key` when already installed; on `slug` when reserved, a page's, or another type's (naming it) |

`role:content_manager`. After installing, a preset type is an ordinary content type: renamed, re-slugged (`moveSlug` as today), switched off, given extra field groups. `preset` cannot be set or changed through `PATCH /admin/content-types/{id}` (prohibited). Deleting follows today's rule (refused while it has entries); deleting frees the preset to be installed again.

### `entry_pages`

Editable on the type form. False:

- `GET /types/{type}/{slug}` answers 404.
- `Entry::publicPath()` (override of `Sluggable`'s) returns the archive's path, so search, menus, share-link paths, site health's Fix links, `EntityLinks` and the chatbot all link to the archive.
- The sitemap and `llms.txt` list the archive only; IndexNow pings the archive.
- `StructuredData::entry()` is not emitted for such an entry (no page carries it).

### Public reads

`GET /types/{type}` and `GET /types/{type}/{slug}` are unchanged in shape and gain, on `meta.type`, `preset` and `entry_pages`. `custom_data` (already on the detail; added to index rows **only for a preset type**) carries the fields the layouts read, resolved as today (a file `{url, name, mime}`, a picture `{url, alt, focus, width, height, blur}`). The investors index accepts `?type=<document_type value>` and `?year=<financial_year>`; the coverage and awards indexes accept `?per_page` up to 100.

`GET /settings` carries the two new public groups (blank values dropped, as always); `newsroom_kit_category_id` is resolved to `newsroom_kit` — the category's published downloads in the public download shape — on `GET /types/{type}`'s `meta` for the releases type only.

### Investor alerts

| Method | Path | Notes |
|---|---|---|
| `POST` | `/admin/content-types/{type-slug}/entries/{id}/alert` | Send now. 422 on `alert` when the type is not `investors`, the entry is not live (`scopePublished`), or `alert_sent_at` is set. **202**. Throttled 6/min |

The entry form posts `alert_on_publish` (investors only; prohibited on other types). The admin entry resource adds `alert_on_publish`, `alert_sent_at`, `alert_error`, `alert_campaign_id`.

`App\Support\Presets\InvestorAlerts`:

- `due()`: investors entries in `scopePublished` with `alert_on_publish` and no `alert_sent_at` and no `alert_error`.
- `send(Entry)`: claim with a conditional UPDATE setting `alert_sent_at`; build a campaign from a fixed template (subject `{company}: {title}`, blocks: heading = title, text = document type and date, button "View on our investors page" → `/{slug}#entry-{id}` absolute on `frontend_url`, footer); audience = the "Investor updates" group; queue through `CampaignSender` behind its blocking health checks. A refusal clears `alert_sent_at`, writes `alert_error` (the checks' sentences) and is not retried until a save clears `alert_error`. Nothing throws to the caller.
- `technoware:send-investor-alerts`, every 10 minutes: `send()` each `due()` row. A save of an investors entry dispatches it after commit.

### Signup

`POST /newsletter/subscribe` accepts `list` (`general`, default, or `investors`). `investors` puts the address into the `source: investors` group instead of the general newsletter group, through the same `SubscriberIntake`, honeypot, suppression and 202-always answer. When the group does not exist (preset not installed) the answer is the same 202 and nothing is written.

### Builder

**`preset_list`** — new `PageSectionType`, "From a preset":

- `data`: `preset` (`newsroom_releases`, `newsroom_coverage`, `investors`, `awards` — an installed one; 422 on `blocks.N.data.preset` otherwise), `limit` 1–12 (default 6), `kicker?`, `heading?`, `lede?`, `document_type?` (investors only).
- Presented as `items` (the archive row shape for that preset) plus `index_path` and `preset`. Dropped when the preset is not installed, its type is inactive, or nothing is published.
- `GET /admin/pages/builder` adds `presets: [{value, label, document_types?}]` for installed presets.
- Allowed in record bodies, detail templates and the library like any ordinary section.

**`testimonials`** — gains `source` (`custom`, default and not stored, or `preset`). With `preset`: `featured_only` boolean, `limit` 2–9; `items` neither required nor stored. Presented `items` are the same shape either way (`quote, name, role, photo, photo_alt, photo_focus`) plus `company_logo` from the preset. Dropped when `preset` resolves to fewer than two.

### Homepage

`testimonial_source` in the `homepage` group (public): `typed` (default, today's behaviour) or `preset` (options from the API). With `preset`, `loadHome()` reads `GET /types/testimonials?featured=1&per_page=1` — the testimonials index accepts `featured=1` — and falls back to the typed quote when none is returned or the preset is not installed.

## Web

- **Install strip** on Content → Content types: four cards (what each installs, a small drawn preview, Install / "Installed — open"). The newsroom card installs both types. A slug clash opens a one-field dialog to choose another.
- **Archive branch** in `(marketing)/[slug]/page.tsx`: when `meta.type.preset` is set, render `components/presets/<preset>-archive.tsx` instead of the generic `Collection`; unknown presets render the generic archive.
  - `newsroom-archive`: lead release (picture + headline + date + summary), releases by year, "In the news" strip (six newest coverage cards, outbound `rel="noopener"`), media-kit band (boilerplate through `Prose`, contact card, kit files as plain `<a>` download rows through `/api/downloads/{id}`).
  - `coverage-archive`, `investors-archive` (type chips as links, rows grouped by financial year, signup band posting through a Server Action to `/newsletter/subscribe` with `list: investors`, contact card), `testimonials-archive` (masonry quote cards; CSS columns, not JS), `awards-archive` (badge wall by year, "See our certifications").
  - Each archive stamps `data-preset="<key>"` and named parts (`data-preset-item`, `-media`, `-title`, `-meta`) so a theme may restyle; base styling is tokens on `bg-card` grounds; judged in every theme.
- **Release page** in `(marketing)/[slug]/[entry]/page.tsx`: when the type's preset is `newsroom_releases`, the body is preceded by "For immediate release" and the dateline (`KOLKATA, 12 October 2026 —`, date from the API's label) and followed by the release PDF, "About {company}" boilerplate and the media contact (the entry's override, else the newsroom's).
- **RSS**: `web/src/app/(marketing)/[slug]/feed.xml/route.ts` — 404 unless the type's preset is `newsroom_releases`; 30 newest; escaped at the sink; `revalidate` with the type's tag. The releases archive carries `<link rel="alternate" type="application/rss+xml">`.
- **Certifications ↔ Awards**: each page links the other only when the other has something published.
- **Builder**: `PresetListSection` draws the compact archive for the preset; the Testimonials editor gains the source select.
- **Console entry form** for an investors entry: the switch, the Send alert button, and `alert_error` as an inline `warn` alert.
- **Mock**: every new or changed shape.

## Testing

- `ContentPresetsTest`: install each preset (types, fields locked, investor group), install twice refused, slug clash and `slug` override, reserved slug, `preset` not patchable, locked key/kind/delete refused and label edit allowed, `entry_pages: false` (detail 404, `publicPath()` is the archive, sitemap and search link the archive), role gate, delete frees the preset.
- `InvestorAlertsTest`: switch on publish sends once; a scheduled publish caught by the sweep; the button; two concurrent sends make one campaign; a draft refused; a health-gate refusal writes `alert_error` and is not retried; signup with `list: investors` lands in the group; a suppressed address stays out; signup with no preset installed answers 202 and writes nothing.
- `PresetSectionsTest`: `preset_list` rules (installed only) and presenter (dropped when empty or inactive), `testimonials` `source: preset` returns the custom shape and `custom` is byte-identical to today, the homepage fallback.
- `ReservedSlugsTest` stays green (no new top-level route); the coverage tests (`MorphMapCoverageTest`, `SeoEntityCoverageTest`, `AdminNavRolesTest`) unchanged.
- Web: `tsc`, lint, `npm run audit` and `npm run audit:mobile` with the six archive routes, a release page and the install strip added; `scripts/probes/content-presets.mjs` (install all four, one entry each, every archive renders, the feed parses as XML, the Testimonials source switch); every archive by eye in all 14 themes at 360/768/1280/1920.

## Not in this release

An embargo beyond scheduled publishing; review or quotation markup; stock tickers or share-price feeds; entry pages for coverage, investors, testimonials or awards (a type's `entry_pages` can still be switched on by an editor, and the generic page then draws); detaching a preset into a plain type; investor alerts for any type but investors.

## Release

0.186.0 — `VERSION.md`, `web/src/lib/version.ts`, `docs/content-presets.md`, a module line in `CLAUDE.md`, `API.md`, `manual/36-presets.md`.
