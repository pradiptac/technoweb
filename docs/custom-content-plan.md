# Custom fields and custom content types — plan (2026-09-26)

The client asked for WordPress/ACF-style extensibility: add fields to existing
content, and create whole new record types with their own public pages, from
the console, without a developer.

## Part A — custom fields

- `custom_field_groups`: `name`, `slug`, `targets` JSON **list** of target
  keys (existing: `page`, `blog_post`, `knowledge_article`, `case_study`,
  `solution`, `service`, `industry`, `product`, `store_product`, and
  `entry:<type-slug>` for custom types), `placement` (`details` — drawn as a
  "Details" section on the public page — or `hidden`, data only in the API),
  `sort_order`, `is_active`.
- `custom_fields`: `custom_field_group_id`, `key` (`^[a-z][a-z0-9_]*$`,
  unique per group), `label`, `kind`, `help`, `required`, `options` JSON list
  `[{value,label}]` (select/multi), `settings` JSON (min/max, relation
  target), `show_on_page` bool, `sort_order`.
- Kinds (`App\Enums\CustomFieldKind`, with `label()`, `options()` sent to the
  console as `meta.kinds`): `text`, `textarea`, `rich_text` (sanitised with the
  `cms` profile), `number`, `date`, `url` (http/https only), `email`,
  `select`, `multi_select`, `boolean`, `image` (media-library path),
  `file` (media-library path), `relation` (a record of a chosen target type,
  stored as id), `list` (a list of short strings).
- Values: `custom_field_values` — `fieldable_type`/`fieldable_id` (morph;
  every target model in the morph map), `custom_field_id`, `value` JSON,
  unique `(fieldable, field)`; one trait `HasCustomFields` (`customValues()`
  morphMany, `customFieldsFor()` loader) added to each target model.
- Validation generated from the stored definitions (the `FormValidator`
  rule: a key nobody declared is dropped; select values checked against
  options; relation ids checked to exist; media paths checked in the
  library). One helper `CustomFields::rules($targetKey)` and
  `CustomFields::save($model, $input)` used by every target's admin
  controller — the payload key is `custom_fields` (an object keyed by field
  key); a request that omits it leaves values alone.
- Output: admin resources carry `custom_fields` (values keyed by field key)
  and `custom_field_groups` (the definitions that apply, from the API — never
  listed in TypeScript); public resources carry `custom_fields` as a list of
  `{key, label, kind, value, display}` for the groups placed `details` and
  fields with `show_on_page`, with media resolved to URL + alt (`MediaMeta`),
  relations to `{title, path}`, rich text already sanitised, dates formatted
  en-IN. Eager-load everywhere (`preventLazyLoading`).
- Console: **Content → Custom fields** — list of groups, group editor (name,
  targets checklist, placement, field builder in the `forms/field-builder`
  pattern with `ReorderButtons`, per-kind settings). Every target entity's
  edit form gains a "Fields" tab (only when a group applies), rendering the
  inputs with the existing primitives (`Field`, `Select`, `EditorField`,
  `CoverField`/`MediaBrowser`, `RelationPicker`-style select, date input),
  posting one hidden JSON `custom_fields` — added to that tab's `fields` list
  so a 422 lands on it (`buildFormTabs`). One shared component
  `CustomFieldsPanel` used by every form.
- Public pages: one shared `CustomFieldDetails` component (a definition list
  on a `Card` ground, tokens only) rendered on each target's detail page
  after the body when `custom_fields` is non-empty.

## Part B — custom content types

- `content_types`: `name` (singular), `plural`, `slug` (the URL prefix:
  `^[a-z][a-z0-9-]*$`, refused if it collides with a reserved first segment —
  every existing top-level route in `web/src/app/(marketing)` and the API's
  public prefixes, a list kept in `App\Support\ReservedSlugs` and a test that
  reads the frontend app directory — or an existing CMS page slug), `icon`
  (iconMap key), `description`, `has_body`, `has_image`, `archive_enabled`,
  `per_page`, `sort` (`newest`, `title`, `manual`), `is_active`.
- `entries`: `content_type_id`, `title`, `slug` (unique **per type**),
  `summary`, `body` (rich text, sanitised), `image_path`, `status`
  (draft/published/archived), `published_at`, `sort_order`, timestamps;
  traits `HasSeo`, `HasCustomFields`, `HasAnswerBlocks` (+ FAQs) — `urlPrefix()`
  is the type's slug, so `Sluggable`'s 301-on-rename works, **but** slug
  uniqueness must be per type (override the uniqueness query), and renaming a
  **type's** slug re-saves its entries' paths and writes redirects for each
  (the `RepathsLandingPages` pattern, one row at a time).
- Morph map: `entry`, `content_type`.
- One registry entry in each hand-maintained list (the exploration counted
  ~14): sitemap (`web/src/app/sitemap.ts` — all published entries of active
  types + each archive), `/admin/seo` (`SeoController::ENTITIES` + the
  coverage test), menu targets (`MenuItemType` `entry` + a `content_type`
  archive item, `MenuController::targets`), site search
  (`SearchController`), admin command palette search, `llms.ts`, FAQ owners,
  chatbot `Retriever` (published entries' summary/body), AEO/GEO scoring
  lists, `StructuredData` (`Article` / `WebPage` per the type's
  `schema_type` choice), `EntityLinks` as applicable.
- API: public `GET /content-types` (active, for the sitemap/menus), `GET
  /types/{type}` (archive: type + paginated published entries),
  `GET /types/{type}/{slug}` (detail with `seo`, `custom_fields`, answer
  content, `->withSchema()`). Admin (`role:content_manager`): CRUD
  `/admin/content-types` (delete refused while entries exist), CRUD
  `/admin/content-types/{type}/entries` bound by id, `meta` carrying kinds,
  statuses, answer-block kinds, field groups.
- Frontend public routes: `web/src/app/(marketing)/[slug]/page.tsx` today
  resolves a CMS page; extend it to resolve **a CMS page first, then a
  content type archive** (the `products/[slug]/resolve.ts` pattern), and add
  `web/src/app/(marketing)/[slug]/[entry]/page.tsx` for entry detail (export
  an empty `generateStaticParams` so it is ISR-cached, tags
  `entries:<type>` and `entry:<type>:<slug>`, never read request APIs).
  Archive: `PageHero` + a theme `Collection` of `Tile`s + numbered
  `Pagination`; detail: `PageHero`, `Prose`, `CustomFieldDetails`,
  `AnswerBlocks`, `CtaBand`, JSON-LD.
- Console: **Content → Content types** (list, create/edit type with its
  settings and which field groups apply), and for each active type an
  entries screen at `/admin/content/{type}` (list + new + edit forms in the
  Solutions form pattern: Content / Media / Fields / SEO / AEO tabs,
  `FormActions`, `FormDraft`). The sidebar gets one static row
  "Content types" (`/admin/content-types`) and one "Custom content"
  (`/admin/content`) whose index lists the types, so `screenRole()` finds a
  row for every screen (longest-match rule); `AdminNavRolesTest` green.
- Server actions `updateTag("entries:<type>")`, `updateTag("content-types")`,
  `updateTag("menu")`.
- `mock-api.mjs` endpoints + one sample type with two entries;
  `types/api.ts`; audit lists (the console screens, one archive, one entry
  via DISCOVER).

## Docs and tests

`docs/custom-content.md`, a module section in `CLAUDE.md` (one line per rule),
`API.md`, `FEATURES.md`. Tests: field definitions validation (reserved keys,
kinds, options), value validation per kind (including relation existence
and media path), unknown keys dropped, values saved/cleared, public output
only for `details`/`show_on_page`, content type reserved-slug refusal,
per-type slug uniqueness, 301 on entry rename and on type rename, archive
and detail 404 for drafts/inactive types, sitemap/SEO overview coverage
tests updated, morph map coverage, role gates.
