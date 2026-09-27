# The section page builder

A CMS page can be laid out as a stack of ready sections (the client,
2026-09-26): each section a set of validated fields, reordered, duplicated,
hidden and previewed from the page's own form. **No free-form drag canvas** —
the client chose a section builder, and a stack of typed sections is a page
that cannot be laid out into something unreadable. `docs/page-builder-plan.md`
is the plan this implements.

This reverses the 2026-09-20 "not suggested" note in
`docs/feature-ideas-2026-09-20.md` and the "`blocks` is deliberately absent"
comments the page requests carried. Their objection was raw JSON typed into a
text field, where a typo corrupts a page with no way to see it; a builder
whose every section is validated by its type is the editor that note asked
for, so the objection is answered rather than overruled.

## Data

**`pages.blocks` is a list of sections**, each
`{id, type, hidden, background, data}` — the column existed since Phase 1 and
nothing read or wrote it. `id` is a uuid the console mints; `hidden` keeps a
section with the page and off the public site; `background` is the Themes
screen's section background, the same five kinds in the same shape.

**`pages.template` gains `builder`** (`default`, `wide`, `builder`). A builder
page renders its sections instead of its body; the body is still stored and
sent, so switching the template back loses nothing.

**Fourteen types, `App\Enums\PageSectionType`** — `hero`, `rich_text`,
`media_text`, `features`, `cards`, `content_block`, `slider`, `gallery`,
`form`, `faq`, `logos`, `testimonial`, `video`, `divider` — each with
`label()` and `blurb()`, sent as `meta.section_types` and on
`GET /admin/pages/builder`. The console never lists them.

**`App\Support\PageSections\SectionRules::for($type)` is what each type may
hold**, the `BlockRules` pattern one level out: each type validates exactly
what it draws, and `forPayload()` generates the rules **per row from that
row's type**, so a 422 is keyed where the console's field is
(`blocks.3.data.heading`). `after()` holds what no rule can express:

- a picture or video that is really in the media library, and of the right
  kind (`image/…` for a picture, `video/…` for a video);
- a content block, slider, gallery or form that exists **and is published** —
  a page pointing at a draft would draw nothing and say nothing;
- a YouTube link `App\Support\YouTube` can read (stored as the id only);
- a background checked by `ThemeOptions::background()`, extracted from the
  homepage-section cleaner so the two mean one thing;
- a product category that exists, and only on a product list;
- section ids unique within the page.

**`normalise()` is what is stored**: only the keys a type declares
(`validated()` would hand back each `data` whole, because the wildcard
`blocks.*.data` carries a rule), the background cleaned, ids and counts as
integers, an empty button dropped. A reference is stored as an **id**, so
renaming a slider's slug moves nothing.

**Rich text is sanitised on write**, before validation.
`SanitisesRichText` reads a dotted path after its wildcard since this
feature — `blocks.*.data.body`, the body of `rich_text` and `media_text` —
and `tests/Unit/SanitisesRichTextTest.php` pins it, including that the
one-level form still works. Every other text field is plain and escaped by
React at the sink; shortcodes in a body are expanded as components by
`ProseWithShortcodes`, never by string substitution.

## Presented for the public site

`SectionPresenter::present()` is the public shape, and it is what
`PageResource` sends as `sections` — **only for a builder page**:

- **Hidden sections are gone.** Nothing downstream has to remember.
- **A path becomes a URL** with the library's alt text and focal point
  (`image`, `image_alt`, `image_focus`; `photo_…` on a testimonial; `video`);
  a background's picture gains `image_url` and `image_focus`, the
  `ThemeOptions::withUrls()` shape.
- **A content block is inline** (the public `ContentBlockResource`). **A
  slider, gallery or form becomes its current slug**, fetched by the frontend
  from its own public endpoint — the shortcodes' path, so "published and not
  empty" has one definition.
- **A reference that has since been unpublished or deleted drops its
  section**, as a deleted record drops its menu item. An empty `cards` list
  and an empty `faq` drop too: a heading over nothing reads as broken.
- **`cards` is resolved now** — the live list's published rows as tiles with a
  path, a picture, an icon and a kicker — so it follows the catalogue.
- **A `faq` on "this page's FAQs" carries them.**

**One `FAQPage` per page, still.** A builder page's `faq_schema` is built over
the page's FAQs, its question blocks **and** the custom questions of its
visible `faq` sections (`SectionPresenter::faqEntries()`), under the same
two-entry gate; `FaqSection` emits no graph of its own.

## The public route

`web/src/app/(marketing)/[slug]/page.tsx` gains one branch: `template ===
"builder"` renders `BuilderPage`, and the default and wide templates below it
are untouched.

- **One `h1`, one trail, either way.** A builder page that opens on a `hero`
  section gets no `PageHero`: the hero's heading is the `h1` and it draws
  `Breadcrumbs` (visible and as `BreadcrumbList`). Anything else first, and
  `PageHero` opens the page as on every other CMS page. Section headings are
  `h2`; a tile's or a feature's title is an `h3` under one, or not a heading
  at all when the section has none — never a jump.
- **`PageSections`** (`web/src/components/page-sections/`) draws each section
  inside `SectionBg`, the homepage's shell: a background means exactly what it
  means on the Themes screen — a local palette whose inks are pushed to AA on
  every stop — and nothing at all when none is chosen. The first two sections
  load their pictures eagerly; the rest are lazy.
- **Themes restyle by attribute**, nothing theme-specific in the components:
  every band carries `data-page-section="<type>"`, a `cards` section is a
  `Collection` of `Tile`s (so every theme's idiom block draws it), a logo
  strip moves the way the theme's homepage strip does (`STRIP_MODES` in
  `embed-sections.tsx` mirrors the `mode` each `templates/home.tsx` passes —
  change both together), a card is `data-card`.
- After the sections: the answer blocks and "Related" (page FAQs left out when
  a `faq` section already shows them), then the closing `CtaBand` **unless a
  `content_block` section already closes the page with a CTA**.
- **Reveals** are `data-aos="fade-up"` on every band except an opening hero,
  which is the largest paint and must not wait for an observer.
- **Video** is YouTube's click-to-play facade (`YouTubeEmbed`: no request to
  YouTube until pressed, `youtube-nocookie`, the poster drawn here and never
  from `i.ytimg.com`) or a library file with `controls`. `media-src` in the
  CSP now names the asset origins, as `img-src` always has — a slide's video
  was already served from there.

## The console

**A Builder tab on the page form, drawn while the template is Builder.** The
template select is controlled for that; the body editor steps aside (still
mounted, still posted) with a line saying where the page's content is.
`GROUPS` lists `builder` with `fields: ["blocks"]` whatever the template, so a
422 on `blocks.3.data.heading` always has a tab to land on.

**The list lives in the form, not in the tab**, and posts as one hidden JSON
input (`blocks`): a tab that is not drawn cannot take the sections with it,
and collapsing, reordering or removing a section is a state change rather
than a renaming. A structural change fires no input event of its own, so the
form dispatches one on the hidden input — which is what `FormDraft` and
`FormActions`' leave guard listen for — and `tw:draft-restored` reads a
restored draft back out of it.

- **Add** opens a picker of type tiles with the API's blurbs. A new section
  starts with the choices its type needs made (`blankData()`).
- **Start from** — Landing, Service, About — offered while the list is empty:
  plain JSON starters from the API (`meta.section_presets`), every word a
  placeholder, only self-contained types, a fresh uuid per section. A test
  saves every preset through the real rules.
- Each section: collapse, `ReorderButtons` (dense), duplicate, hide/show,
  remove — **undoable from its toast** for as long as the toast is up.
- **Fields are the content blocks' editor primitives**
  (`blocks/editors/shared.tsx`), bound to a path in the section's `data` and
  unnamed, so nothing posts twice. `shared.tsx` gained an optional
  `idPrefix` on its context: fourteen hero editors on one form all saying
  `b-heading` would be fourteen labels pointing at the first input.
- **A section with a 422 opens itself, turns red and counts its problems**;
  each field finds its message by path. A preview's refusal marks sections
  the same way until the next save answers.
- Selects are fed by `GET /admin/pages/builder`: types, presets, hero
  layouts, card sources, and the **published** content blocks, sliders,
  galleries, forms and both category lists. An empty picker says so and links
  to where one is made.

**Preview, two ways.**

- **Unsaved** — "Preview" posts the list to a Server Action
  (`builder/preview-action.tsx`) that sends it to `POST /admin/pages/preview`
  — the rules a save runs, nothing written — keeps the presented sections for
  ten minutes (`lib/admin/preview-drafts.ts`, bound to that staff session, on
  `globalThis` so every route bundle in the process shares it) and returns an
  id; the `Modal` (`xl`) frames `/admin/draft-preview/{id}`, a page outside
  `admin/(app)` that draws them **with the public components**. A refusal
  comes back as field errors. It returned the rendered JSX from the action
  until 2026-09-26, and that failed in a browser the first time anybody drove
  it: a section holding a client component the console page never imports
  (the YouTube facade, the gallery's lightbox, a form, a CTA island) put a
  module in the RSC payload that the page's client manifest did not hold —
  "Could not find the module … in the React Client Manifest". A page gets its
  own complete client bundle.
- **Saved** — `/admin/pages/{id}/preview` draws the admin read's `sections`
  (presented, hidden ones left out), drafts included; linked from the page's
  header and from the Builder tab.

Both draw inside `SectionsFrame` — the content blocks' `PreviewFrame` recipe:
`.public-site` with the active theme's `data-theme`, so the 12px floor, the
card grounds and the theme's rules apply, and `data-reveal-static`. **Both pass
`ownsH1={false}`**: the console screen has its own `h1`, so an opening hero is
drawn as an `h2` there, and the preview keeps the one-`h1` rule.

## Seeded, and audited

`SampleBuilderPageSeeder` creates one **draft** page at `/sample-builder-page`
with a section of every type the install can draw, after the content blocks,
sliders and forms it points at (a type with nothing published to point at —
a gallery, on a fresh install — is left out). **Create-only**: a re-seed never
touches a page already at that slug, unlike `PageSeeder`, which rewrites the
policy pages. It is placeholder content on the must-not-ship list.

**It gives the hero, the media-and-text section and the testimonial three
different pictures** — the first three raster images in the library, the
last repeated only when there are fewer. With one photo in all three the
saved preview failed the audit on `next/image`'s dev warning that the
largest paint should be `loading="eager"` — about a hero that was
eager. Next's check keys its images by URL, the lazy copy further down
registered last and overwrote the hero's entry; measured with a
`PerformanceObserver`, the LCP element carried `loading="eager"` the
whole time. Dev only, but a page an editor builds that way reads the same
in `npm run audit`: check the element before adding `eager` anywhere.

**A section card is `min-w-0`.** The list is a grid, a grid item's
automatic minimum is its min-content, and a collapsed card's `truncate`d
summary is one unbreakable run — the Builder tab was 488px wide at 360
until the `<li>` carried it (2026-09-27).

`npm run audit` discovers its Builder tab (`?tab=builder`) and its saved
preview. Its public route 404s while it is a draft — audit it by name once
published: `node scripts/audit.mjs /sample-builder-page`. The mock API carries
it published, with its sections, so a build against `npm run mock` renders
the builder route.

## API

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/pages/builder` | Types, presets, hero layouts, card sources, and the published pickers. **Declared above `pages/{page:id}`** |
| `POST` | `/admin/pages/preview` | `{blocks, page_id?}`. Validated as a save is, presented, **nothing written**. Throttled 60/min |
| `POST`/`PATCH` | `/admin/pages`, `/admin/pages/{id}` | `blocks[]`, `template: builder`. The admin detail read returns `blocks`, `blocks_media` and `sections` |
| `GET` | `/pages/{slug}` | `sections` for a builder page only; `faq_schema` counts its questions |

## Tests

`tests/Feature/PageBuilderTest.php` — every type's rules valid and invalid, an
unknown type refused, ids unique, rich text sanitised in a nested field, media
that must exist and be the right kind, references that must be published (and
drop out when unpublished later), a content block inline, a background checked
by the theme rule, a live list resolved, faq sections joining the one
`FAQPage`, the preview presenting without writing, the options endpoint, every
preset saved through the real rules, the role gate.
`tests/Unit/SanitisesRichTextTest.php` — the nested wildcard path.
