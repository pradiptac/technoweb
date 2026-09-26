# Custom fields and custom content types

Built 2026-09-26 from `docs/custom-content-plan.md`. The client asked for
ACF-style extensibility: fields added to existing content, and whole new
kinds of record with pages of their own, made from the console without a
developer.

## Part A — custom fields

### The shape

Three tables (`2026_09_26_100000_create_custom_fields`):

| Table | What |
|---|---|
| `custom_field_groups` | `name`, `slug`, `targets` (a JSON **list** of target keys), `placement` (`details` or `hidden`), `sort_order`, `is_active` |
| `custom_fields` | the group, `key` (unique per group), `label`, `kind`, `help`, `required`, `options` (`[{value,label}]`), `settings` (`min`/`max`, `max_length`, `max_items`, `target`), `show_on_page`, `sort_order` |
| `custom_field_values` | `fieldable_type`/`fieldable_id` (the morph alias), `custom_field_id`, `value` (JSON), unique per (record, field) |

A **target key** is the morph alias of an existing model — `page`,
`blog_post`, `knowledge_article`, `case_study`, `solution`, `service`,
`industry`, `product`, `store_product` — or `entry:<type-slug>` for a custom
content type. `App\Support\CustomFields\Targets` is the one list: the group
form's checklist, a linked-record field's target select, the picker's choices
and the existence rule are all read from it, and `EntryTargets` is its
content-type half.

The fourteen kinds are `App\Enums\CustomFieldKind`, sent to the console as
`meta.kinds`: text, long text, rich text, number, date, link, email, dropdown,
checkboxes, yes/no, image, file, linked record, list.

### Rules

- **The definition is the contract, not the payload** — `FormValidator`'s
  rule. `CustomFields::rules($target)` generates `custom_fields.<key>` rules
  from the active groups on that target: a dropdown is checked against its
  own options, a linked record against its table (an entry against its type,
  a product against the bin), a picture against the media library **with an
  image MIME**, a link for `http(s)` only, a date as `Y-m-d`. A key nobody
  declared is dropped, never stored.
- **Absent means "leave alone".** The rules are spread in only when the
  request carries `custom_fields` (`AcceptsCustomFields`), and `save()` touches
  only the keys sent: a `PATCH` from the SEO overview or a script leaves every
  value where it was, a required field is required only when the form sends
  the object, and a key sent blank clears that one field.
- **Rich text is cleaned before validation**, in `SanitisesRichText`, which
  asks the request's `customFieldTarget()` which keys are rich text — the
  definitions know, the request cannot list them. `cms` profile, like every
  body.
- **A key is unique across every group on a target**, not just its own
  group: the value payload is keyed by field key, so two groups on
  `solution` both declaring `warranty` would make it ambiguous. Refused at the
  second group, naming the first. Keys a record already answers — `title`,
  `slug`, `status`, `body`, `seo`, `website` (the honeypot) and the rest in
  `CustomFields::RESERVED_KEYS` — are refused outright.
- **Fields are synced by id, never replaced wholesale.** The editor-built
  forms delete and recreate their fields on save, which is right there;
  here the values hang off the field row and cascade with it, so recreating
  would silently empty every record. A row naming its `id` is updated, one
  without is created, one nobody sent is deleted (its values with it — the
  builder says how many before the row goes). Kept rows step aside to
  `~<id>` for a moment so two fields can swap keys in one save.
- **A field's kind is fixed once it holds values.** A date re-read as a
  number is a page drawing something nobody typed. Refused with a 422 naming
  the count; add a new field instead.
- **Values go with the record** (`HasCustomFields`), except on a soft
  delete: a product in the bin keeps what was typed about it.

### The two shapes

Admin detail reads carry `custom_fields` (stored values keyed by field key),
`custom_field_media` (key → URL for pictures and files) and
`custom_field_groups` (the definitions that apply, a linked-record field
with up to 200 `choices`). Every target's admin **index** carries
`meta.custom_field_groups` for the "new" form, the `answer_block_kinds` rule:
each page asks *its own* index, so a store manager gets the store product's
groups without reading `/admin/custom-field-groups`.

Public detail reads carry `custom_fields` — the list the page draws,
`{key, label, kind, value, display}` for fields in active `details` groups
marked `show_on_page`, non-empty, in group then field order — and
`custom_data`, every applicable value keyed, **hidden groups included**.
`hidden` means *not drawn*, never *private*: nothing typed into a custom field
is a secret, and the console says so beside the placement select. Values are
resolved: a picture to `{url, alt, focus, width, height}` through
`MediaMeta`, a file to `{url, name}`, a linked record to `{title, path}` — a
**path**, and absent when the record is no longer public, so the page never
links to a 404 — a number to Indian grouping (`1,00,000`), a date to
`26 September 2026`. Both shapes key on the `customValues` relation being
loaded (`customValues.field.group`), never on the route, so a nested
resource carries nothing.

### The console

**Content → Custom fields** (`/admin/custom-fields`, API
`/admin/custom-field-groups`, `role:content_manager`). The group form has
two tabs — the group, and the field builder in the `forms/field-builder`
pattern with `ReorderButtons`, per-kind settings and the kind select disabled
once a field holds values.

Every target's edit form gains a **Fields** tab when a group applies —
`CustomFieldsPanel`, one component for all nine plus entries. It is the
**last** tab, because `Tabs` reads its children by position and a tab that
comes and goes in the middle would shift every panel after it. Its field list
is `["custom_fields"]`, so a 422 on `custom_fields.warranty` badges it and
jumps there.

**The controls post their own named inputs, not one hidden JSON value** — a
deliberate deviation from the plan. Each control is named `cf__<key>` and the
panel posts `custom_fields_schema` (`[{key, kind}]`);
`customFieldsFromFormData()` in `lib/admin-form.ts` rebuilds the object in the
Server Action. The reason is the primitives: `EditorField`, `CoverField`,
`DocumentField` and `StringListField` each post their own hidden input, and
`<Form>` (which puts a refused submission back) and `FormDraft` (which keeps
a draft) both work by control name. A single JSON value built from state is
one input neither could restore. A switch posts a hidden `"0"` before its
checkbox so an unticked box still means "no".

### The page

`CustomFieldDetails` (`components/content/custom-field-details.tsx`): a
"Details" `h2` and a definition list on a `Card` ground, tokens only, drawn
after the body on the nine target pages and on every entry. Nothing when
the list is empty. Rich text through `Prose`, a picture through
`next/image`, a linked record through `Link`.

## Part B — custom content types

### The shape

`content_types`: `name`, `plural`, `slug` (the URL prefix), `icon`,
`description`, `has_body`, `has_image`, `archive_enabled`, `per_page`, `sort`
(`newest`, `title`, `manual`), `schema_type` (`Article` or `WebPage`),
`sort_order`, `is_active`. `entries`: the type, `title`, `slug` (unique **per
type**), `summary`, `body` (rich text), `image_path`, `status`,
`published_at`, `sort_order`, with `HasSeo`, `HasCustomFields`,
`HasAnswerBlocks` and FAQs. Morph aliases `entry` and `content_type`.

### Rules

- **A type's slug is a top-level address**, so it is refused when it is a
  route the site owns — every top-level directory under `web/src/app` and
  `(marketing)` plus the root files Next serves — an API public prefix, a
  handful of server words (`App\Support\ReservedSlugs`), or a CMS page's slug.
  `ReservedSlugsTest` reads the frontend's app directory, so a route added to
  the site and not to the list fails on the commit that adds it.
- **An entry's slug is unique within its type.** `/events/launch` and
  `/downloads/launch` coexist; `Entry::generateUniqueSlug()` overrides
  `Sluggable`'s to ask only its type, and the request's `unique` rule is
  scoped the same way. `Sluggable`'s 301-on-rename works unchanged because
  `urlPrefix()` is the type's slug.
- **Renaming a type moves everything that carries its slug**
  (`ContentType::moveSlug`, one transaction): a redirect for the archive and
  one per entry (the redirect table is looked up by exact path), any
  redirect already pointing at an old address re-aimed so a chain does not
  grow a hop, self-pointing redirects removed, custom field groups attached
  as `entry:<old>` re-attached as `entry:<new>`, and linked-record fields
  pointing at the type re-pointed.
- **The type is read through `typeSlug()`**, never `$entry->contentType`
  from anywhere that may not have loaded it — the SEO overview, IndexNow and
  the redirect hook all reach an entry without the relation, and
  `preventLazyLoading` is on.
- **A type with entries cannot be deleted** (422, and the foreign key
  restricts). Switching it off takes the archive and every entry off the
  site and keeps everything.
- **Published** is one scope (`Entry::scopePublished`): status published,
  `published_at` not in the future, type active. The archive, the detail,
  the sitemap, site search, the chatbot and the menu all use it.

### API

Public: `GET /content-types` (active types, with the newest published
entry's `updated_at`), `GET /types/{type}` (a page of published entries in
the type's order, `meta.type`; answers for a type whose archive is off, with
`archive_enabled: false`, because the sitemap walks it), `GET
/types/{type}/{slug}` (the page: body, SEO, custom fields, answer blocks,
FAQs, `entity`, `faq_schema`, `schema`). Admin (`role:content_manager`):
`/admin/content-types` bound by **id** (its form changes its slug), and
`/admin/content-types/{type-slug}/entries/{id}` — the type by slug because
that is the console's URL and nothing on an entry's form can change it, the
entry by id and **scoped**, so another type's entry id is a 404.

`StructuredData::entry()` emits an `Article` (headline, dates, the publisher
as author — an entry has no author column, so naming a person would be
invented) or a `WebPage` (name, description, last change), per the type,
refined by the entry's own SEO override within `SchemaTypes`.

### Registries

One entry in each hand-maintained list: `SeoController::ENTITIES` (`entry`,
with `adminPath()` answered by the record because the console route is per
type), `MenuItemType` (`entry` and `content_type` — an archive item — with
`Menu::tree()` loading each entry's type through `morphWith`),
`MenuController::targets` (labels prefixed with the type), site search (one
"More from the site" group, each result its own path), the console palette,
FAQ owners, the chatbot `Retriever`, `StructuredData`, the sitemap and
`llms.txt`/`llms-full.txt`. `EntityLinks` needed nothing: it reads loaded
relations and `publicPath()`. **`AeoScore`/`GeoScore` needed nothing**
either: their type lists name catalogue-specific checks (a comparison on a
product, a brand on a product), none of which applies to an entry, and the
generic checks run on every record.

### Frontend

- `(marketing)/[slug]/page.tsx` resolves **a CMS page first, then a type's
  archive** (`./archive.ts`) — additive: a branch after the page lookup and
  `searchParams` for `?page=`. The route stays dynamic, as it must (junk URLs
  must not become cached not-founds); the cost is one more uncached 404
  round trip for a slug that is neither.
- `(marketing)/[slug]/[entry]/page.tsx` is the entry, with an empty
  `generateStaticParams` so it is ISR-cached; tags `entries:<type>` and
  `entry:<type>:<slug>`; it reads no request-time API.
- The archive is `PageHero`, a theme `Collection` of `Tile`s (kind
  `content-<slug>`) and the numbered `Pagination`.
- Console: **Content → Content types** (list, form) and **Content → Custom
  content** (`/admin/content`, one card per type; `/admin/content/{type}`,
  its entries; the entry form in the Solutions pattern — Content, Media when
  the type has pictures, SEO, AEO, Fields). The tab list and the panels are
  built from one array, so a Media tab absent for one type takes its panel
  with it. Two static sidebar rows serve every type: `screenRole()` resolves
  `/admin/content/events/3` to "Custom content" by the longest match.
- Saves `updateTag` `entries:<type>`, `entry:<type>:<slug>` (and the old
  slug's on a rename), `content-types` and `menu`; a field group's save tags
  every target's collection.

## Tests

`CustomFieldsTest` (definitions: reserved keys, kinds, options, the cross-
group key collision, the role gate; values per kind including linked-record
existence and the media path; unknown keys dropped; saved and cleared; an
absent payload; required-only-when-sent; the public output for
`details`/`show_on_page`, hidden in `custom_data`, a draft link dropped;
sync by id and the kind lock; the index meta; values deleted with the
record). `ContentTypesTest` (reserved and page slugs, the role gate, delete
refused, per-type uniqueness, scoped binding, 301 on entry and on type
rename with field groups re-attached, an entry's custom fields, archive and
detail 404s for drafts, future dates and inactive types, the WebPage graph,
the SEO overview, search, FAQ owners and menus). `ReservedSlugsTest`.
`MorphMapCoverageTest`, `SeoEntityCoverageTest` and `AdminNavRolesTest` cover
the new models, entity and rows by reading the code.
