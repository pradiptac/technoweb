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

## Style (0.104.0)

Each section may carry `style` beside `hidden`, `background` and `reveal`:
how it sits on the page, separate from what it says. `SectionRules::STYLE`
is the list — `pad_top`/`pad_bottom` (`none`, `s`, `l`, `xl`), `width`
(`medium`, `narrow`), `align` (`center`), `heading` (`s`, `l`) — plus
`anchor` (`^[a-z][a-z0-9-]{0,47}$`, unique on the page, `after()`) and
`show_on` (a non-empty subset of `phone`, `tablet`, `desktop`).

- **Choices, never values.** No number and no colour, so nothing an editor
  picks can widen the page, put type under the floor or change a colour the
  audit reads. `default` (the first of each list) and all three devices are
  never stored; `SectionRules::style()` returns null when nothing differs,
  and the presenter sends it on.
- **One wrapper, no section learned anything.** `PageSections` wraps a
  styled section in `<div data-section-style data-pad-top … id=anchor>`
  (none for an unstyled one, so its markup is unchanged) and
  `globals.css` reads it: padding on the section's root
  (`> [data-page-section]`, multiplied by `--density`), width on its
  `[data-container]` (`Container` carries the marker since 0.104.0; a
  width only ever narrows), alignment on `[data-section-head]`,
  `[data-section-buttons]`, a rich-text or testimonial body (centred lists
  take their bullets in with them), heading size one rung up or down the
  display scale. Devices not shown get `max-sm:hidden`,
  `sm:max-lg:hidden` or `lg:hidden` — the class, never the attribute.
- **The Style panel** (`builder/style-field.tsx`) is rows of `aria-pressed`
  buttons rather than selects, with a small spacing diagram from `lg`; the
  last device cannot be switched off (that is Hide's job). Errors from
  `blocks.N.style.*` land under their row.
- Probe: `scripts/probes/section-style.mjs` drives the panel and checks the
  unsaved preview; it saves nothing.

## Editing: undo, drag, copy and paste (0.105.0)

All in `builder/section-builder.tsx`, client-side only; the API is unchanged.

- **History.** Every change goes through `apply()`, which computes the next
  list from the current one, pushes the current one and hands the next to
  the form — never a history push inside a state updater, which React may
  run twice. Fifty steps, in memory; typing into one section within a second
  is one step (`patch:<id>` coalescing). Undo/Redo buttons, and Ctrl/⌘ Z,
  Ctrl/⌘ Shift Z, Ctrl/⌘ Y while focus is in the builder **but not in a text
  field**, which keeps its native undo. Remove's toast Undo still works.
- **Drag and drop.** A `⠿` handle (from `sm`) is the HTML5 drag source; the
  card under the pointer shows a brand line where the section will land
  (its top or bottom half). The arrows stay: HTML drag and drop does not
  fire on touch, and the keyboard needs them.
- **Copy and paste.** Copy writes `{"tw-section": 1, section}` to the
  clipboard and to `localStorage` (`tw_section_clipboard`), so Paste works
  where the clipboard cannot be read back. Paste checks the shape and the
  type against `section_types`, gives it a fresh id and appends it; the
  server validates it on save like anything typed (a picture from another
  install is a 422, as it should be).
- Probe: `scripts/probes/builder-editing.mjs` (saves nothing).

## Figures, steps, tabs, checklists and calls to action (0.107.0)

Five self-contained types, each validated by `SectionRules::for()` and drawn
by `components/page-sections/visual-sections.tsx`:

| Type | Holds | Drawn as |
|---|---|---|
| `stats` | `display` of `figures`/`rings`/`bars` (`STAT_DISPLAYS`), `columns`, up to 8 items `{value, label, icon?, percent?}` — `percent` 0–100, required for rings and bars and **dropped** by `normalise()` for figures | figures count up (`CountUp`); rings are `Ring`; bars grow |
| `steps` | `layout` of `vertical`/`horizontal`, 2–8 items `{title, body?, icon?}` | a numbered list joined by a line, or cards in rows |
| `tabs` | 2–8 items `{label, heading?, body, image_path?}` — `body` is **plain text**, a blank line a new paragraph | `section-tabs.tsx`, the WAI-ARIA tabs pattern; every panel in the markup |
| `checklist` | `columns` 1–3, up to 24 items `{text, icon?}`, two buttons | a tick (or the item's icon) beside each line |
| `cta` | `heading`, `kicker`, `lede`, `tone` (`accent`/`brand`), `call`, two buttons | `ThemeBand` — the active theme's own closing band; `call` keeps its "Call" button when no second button is set |

A tab's picture is checked like any other (a library picture, 422 on
`blocks.N.data.items.M.image_path`) and the presenter resolves each item's
`image_path` to `image`/`image_alt`/`image_focus`. A `cta` section closes the
page like a CTA content block: the route draws no second `CtaBand`.

**Proportion is the component's, not the editor's.** The client's rule
(2026-10-05): every section must sit in a proper ratio to the screen it is
on, in every theme.

- **No empty columns.** A row never has more columns than items, and a
  short last row is **centred** (`rowItem()`): five steps are three and two,
  never three and two-and-a-hole.
- **Phones.** Figures and rings sit two to a row on a phone, where one full
  card each read as sparse. Rings are 108px, so they fit in a half-width card
  at 320px.
- **Read lists sit beside their heading.** Bars and vertical steps are read
  rather than scanned, so from `lg` they sit beside their heading
  (`SplitHead`, the heading held sticky) instead of running 1,700px wide or
  leaving half the band empty.
- **Tab pictures.** A tab's picture is 4:3, capped at `max-w-2xl` below `lg`.
  From `xl` it takes five parts to the words' seven at 16:10, so it never
  becomes a billboard beside a short paragraph.
- **Horizontal steps on a phone.** The number sits beside the words, not
  above them.

**Tailwind generates only class names it can read in the source.**
`rowItem()` spells out every width as a literal string. The first cut built
the `sm:` width from a template string, and the class did not exist: steps
stacked one per row at 768.

**Motion** is `[data-meter-fill]`, `[data-meter-ring]` and `[data-step-line]`
in `globals.css`.
- The bars grow, the rings sweep (a `from`-only `stroke-dasharray`) and the
  steps' line draws down.
- It starts when the reveal observer stamps `data-aos-animate`, so a band
  below the fold moves when it is reached. Each item is staggered by `--i`.
- It is inside the reduced-motion guard. A section set to appear with "None"
  has no `data-aos` and simply shows its final state.

`scripts/probes/section-bands.mjs` samples a bar mid-flight and at rest,
checks the tabs from the keyboard, and checks reduced motion.

**`normalise()` puts sections back in the order they were sent.**
`validated()` rebuilds the list rule by rule, so a section whose only fields
sit under a wildcard came back after the sections behind it. Examples are a
Features section holding only its points, and every Tabs section.
`array_values()` then made that the stored order, so a save moved the section
down the page. Both levels — sections, and a section's items — are
`ksort`ed first. `PageBuilderTest::test_sections_keep_the_order_they_were_sent_in`
fails without it.

**Any theme can be previewed on a real page.** `/theme-preview/<theme>/page/<slug>`
draws a published builder page under that theme, for an administrator. That
is how a section is judged in every theme, not only in the one the site
wears.

## The library: saved sections and page templates (0.106.0)

`saved_sections` (`App\Models\SavedSection`) holds two kinds of item, both
in the builder's stored shape and normalised by `SectionRules::normalise()`
exactly as a page's sections are, so placing one stores what the page would
have stored:

- **A section** — exactly one section, never itself a link (`saved` is
  refused inside the library: a link to a link is a cycle waiting to happen).
  Made from the bookmark button on a builder card ("Save to library"), with
  "Link this section to it" ticked by default, which swaps the card for a
  link in place.
- **A page template** — a whole stack. Made from **Save as template** above
  the list; offered under "Start from a template" on an empty builder page,
  where every section is **copied** with a fresh id. A page started from a
  template owes it nothing afterwards.

**Placed linked** a section is `{type: "saved", data: {saved_id}}` on the
page. `SectionRules` checks the id is a library *section* that still exists
(422 on `blocks.N.data.saved_id`), and `SectionPresenter::resolve()` swaps it
for the library's section — keeping the page's own `id` and Hidden switch —
in one query for the whole page, before anything else is presented, so FAQ
schema, cards and every other rule see a real section. Style, background and
Appear come from the library; a linked card shows none of those controls,
only which item it is, **Edit it in the library**, and **Make a copy here**,
which replaces the link with the library section's contents under the card's
id (one undo step, like any change).

**Placed as a copy** it is just sections, as if pasted.

**Deleting** a section placed linked anywhere — a page or a template — is a
422 naming how many (`SavedSection::linkedFrom()` reads every page's and
template's blocks; there is no join table to drift). Make a copy on those
pages first. Templates and copies never block a delete.

**Editing** an item at `/admin/pages/library/{id}` saves through
`updateLibraryAction`, which calls `updateTag("pages")`: nothing records which
public pages place it linked short of reading them all, and the tag is the one
every page fetch carries. The screen uses the same `SectionBuilder` with
`inLibrary`, which hides Save to library and Save as template.

`role:content_manager`; the sidebar row is Content → Section library.
Probe: `scripts/probes/section-library.mjs` (creates one section and one
template through the real buttons, places the section linked on a throwaway
page, and deletes all three).

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

### Live preview (0.112.0)

**From 1400px wide the page sits beside its sections and redraws as they
change** (`builder/live-preview.tsx`). Below 1400px there is no room for two
columns of fields and the Preview button's dialog is the preview. Whether it
is shown is the browser's choice — "Hide/Show live preview" in the toolbar,
kept in `localStorage` (`tw_builder_live`, default on) and read through
`useSyncExternalStore` with an "off" server snapshot, so the server markup and
the first client render agree.

- **Each redraw is the unsaved preview** — `previewSectionsAction`, the save's
  rules, a draft id, `/admin/draft-preview/{id}` — sent 900ms after the last
  change (600ms for the first, so the editors settling on mount are one
  request). A newer change cancels an older answer by a sequence number.
- **A section still missing a required field is left out, never allowed to
  stop the preview**: on a 422 the `blocks.N` it names are dropped, the rest
  drawn, and the pane says which ("Section 4 is left out until its required
  fields are filled in"). The fields themselves are marked on save or Preview,
  as before.
- **No flash and no lost place**: the next frame loads hidden behind the shown
  one, copies its `scrollY` on load, and only then swaps in.
- **Desktop / Tablet / Phone** draw the frame at 1280, 768 or 390 and scale it
  to the pane with `transform: scale()` — a desktop page is seen as a desktop
  page, smaller.
- **The two directions are joined**: `PageSections marked` wraps each section
  in `data-builder-id`, and `BuilderPreviewBridge` (framed only) makes a press
  on a section post `tw:builder-select` to the builder, which opens that card
  and scrolls to it; opening a card posts `tw:builder-show` back, which
  scrolls the preview to the section and outlines it for 1.4s. Same-origin
  messages only, checked both ways. Links and submits inside the preview do
  nothing — a press there means "edit this".
- `preview-drafts`' cap went from 100 to 400, since a live session makes a
  draft per pause in typing.

A throwaway browser probe checked it: beside at 1600, no
redraw while idle, typing reaches the frame, a press opens the card, opening a
card outlines the section, the phone width, hide/show, absent at 1280.

**Each section card has an Appear select** (2026-09-27), above its
background: `SECTION_REVEALS` from `lib/motion-choices.ts`, stored on the
section as `reveal` beside `hidden` and `background` — never `default`, which
is stored as nothing. Disabled on an opening hero, which never animates.
`renderSection()` resolves it (`sectionReveal()`, with the type's own default)
and each section puts it on its root; see `docs/motion.md`, "A section's own
reveal".

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

The library: `GET/POST /admin/saved-sections`, `GET/PATCH/DELETE /admin/saved-sections/{id}`, and `library` on `GET /admin/pages/builder` (see API.md).

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/pages/builder` | Types, presets, hero layouts, card sources, and the published pickers. **Declared above `pages/{page:id}`** |
| `POST` | `/admin/pages/preview` | `{blocks, page_id?}`. Validated as a save is, presented, **nothing written**. Throttled 60/min |
| `POST`/`PATCH` | `/admin/pages`, `/admin/pages/{id}` | `blocks[]`, `template: builder`. The admin detail read returns `blocks`, `blocks_media` and `sections` |
| `GET` | `/pages/{slug}` | `sections` for a builder page only; `faq_schema` counts its questions |

## Comparison, timeline, before and after, testimonials (0.109.0)

Four more section types, on 0.107.0's rule that the component decides the
proportion:

- **`comparison`** — two to four `plans` (`name`, `note`), up to twenty `rows`
  (`label`, `cells`), and an optional `highlight` (a plan's position). A cell
  is `yes` (a tick), `no` (a cross), a few words, or blank (a dash). From
  `sm` it is a real `<table>` with row and column headers, held to
  `max-w-5xl`, four plans keeping a 600px table that scrolls inside its card;
  **below `sm` it is one card per plan** listing every feature, because three
  columns beside a label column do not fit 330px and a sideways scroll hides
  the plan people came to compare. The two are alternatives by breakpoint, so
  a screen reader meets one. `cells` is a list of plain values kept by
  position — `SectionRules::keep()` learned that shape (`children === ['*']`)
  for it, blank as null.
- **`timeline`** — two to twelve milestones (`date`, `title`, `body`). The
  line runs down the left on a phone and down the middle from `lg`, the
  milestones alternating sides; it draws on the reveal (`data-step-line`).
- **`before_after`** — two library pictures, their labels and where the
  divider `start`s (10–90). A client island, `before-after.tsx`: a native
  range input over the whole picture (a pointer drags anywhere, the arrows
  move it, a screen reader hears a slider), the handle drawn beside it with
  the input's focus ring through `peer-focus-visible`, the labels on opaque
  `bg-card` chips. Held to `max-w-5xl`, 16:10.
- **`testimonials`** — two to nine quotations (`quote`, `name`, `role`,
  `photo_path`). Four are two by two; any other count is rows of up to three,
  the last row centred. Without a photo, the person's initial on a solid disc.

The comparison editor removes a plan with **one** write
(`set([], next)`): each `set` starts from the same snapshot of the section,
so three in a row kept only the last, and a removed plan left its column of
cells under the next plan.

## From a page's own content (0.109.0)

A page written in the editor — or imported as one body — used to open the
builder empty when switched to it, and a builder page never draws its body,
so the content seemed to vanish. Three things fix that:

- **"This page's content"** is the first thing the empty builder offers when
  the page has a body: **Lay it out as sections** (`POST
  /admin/pages/sections-from-body`, `App\Support\PageSections\BodySections`:
  a `rich_text` section at each `<h2>` — at each `<h3>` when there is no
  `<h2>` and at least two `<h3>`s — the heading as the section's heading,
  what came before the first as a section of its own, cleaned as a saved body
  is, nothing written) or **Keep it as one text section**. Through `apply`,
  so Undo puts the empty builder back. The page form passes `readBody()`,
  which reads the uncontrolled body editor's field at the press.
- `BodySections` keeps every result saveable: a heading over nothing keeps its
  words as an `<h2>` in the body (an empty `body` is refused on save), a
  section over 180,000 characters is cut between elements, and past
  `MAX_SECTIONS` the rest joins the last section.
- **A builder page with no sections renders its body** as the default
  template does (`(marketing)/[slug]/page.tsx`), so a page switched to the
  builder and saved before anything was laid out is never blank.

Two CSS rules keep a laid-out page in proportion: a picture in a `rich_text`
section is capped at `min(70vh, 620px)` tall and centred (an inline width an
editor set still wins), and a text section directly after another starts at
the first's padding rather than doubling it.

## Team, downloads, countdown, columns, map (0.111.0)

Five more types, in `page-sections/people-sections.tsx`:

- **`team`** — a live list, like `cards`: the published team from Company →
  Team in its own order, with current certifications only (`/team`'s query),
  optionally one `department`, at most `limit` (1–48), grouped by department
  when `group` is on. Drawn by `TeamGrid` — the `/team` page's own markup — so
  every theme's team idiom reaches it; the cards are `h3` under a section
  heading and `h2` without one. Nobody published drops the section.
- **`downloads`** — one to twenty files from the media library (`title`,
  `file_path`, `note`); `after()` checks each is in the library. The public
  read gives each its `url`, `size` in bytes and `extension`, never the path;
  a file deleted since is left out, and nothing left drops the section. The
  files are one `max-w-3xl` column whatever the count — a list of files is
  read down, and two columns of three left an orphan row. The console's
  `FilePath` takes `accept` and `noun` now (documents, not only a PDF).
- **`countdown`** — `ends_at` is a wall-clock `Y-m-d\TH:i` in the site's
  timezone; the public read turns it into an instant with its offset
  (`2030-01-01T10:00:00+05:30`) and adds `ends_label`, the API's words for it.
  `countdown.tsx` reads the clock through `useSyncExternalStore` with a null
  server snapshot, so the boxes are drawn empty until hydration and nothing
  about the visitor's clock can mismatch it; the ticking boxes are
  `aria-hidden` and "Ends …" is the words a screen reader hears. After the end
  it says `done_text`. Buttons as any band.
- **`columns`** — two or three columns, each an optional heading and an editor
  body. The bodies are rich text a second list deep,
  `blocks.*.data.columns.*.body`: `SanitisesRichText::cleanAt()` walks any
  number of `*`s now (it took one), and the page, preview and library requests
  name the path. Two columns from `md`, three from `lg`.
- **`map`** — a Google Maps embed address (`starts_with` Google's embed URL,
  the `map_embed_url` setting's rule) and an address, drawn by the contact
  page's `MapEmbed`: a card until pressed, so nothing reaches Google before
  then.

## The homepage as a builder page (0.113.0)

**Settings → Homepage → Homepage** chooses what `/` draws: the theme's own
homepage (the default, and what an install that never touches it keeps), or a
published builder page. `homepage_page_id` holds the page's id; the API checks
it names a published builder page on write, offers exactly those as the
select's options, and publishes `homepage_page_slug` on `/settings` **only
while the page is still a published builder page** — so unpublishing or
deleting it puts the theme's homepage back rather than leaving `/` addressed
at nothing. The id itself is not published.

**The theme's own sections are a section type, `theme_section`** (`{section}`,
an id from `HOME_SECTIONS`). It is drawn by `ThemeSectionSlot`, which renders
the active theme's `Home` with `options.only` set — `orderSections()` then
returns that one entry — and the theme's own background and reveal for it
cleared, since the builder section carries its own. So the hero, the partner
strip, the rack, the bento all stay the theme's, and change when the theme
does; an id the active theme does not draw draws nothing. The API checks the
id's shape only, the rule `site_theme` follows.

**The theme's hero is the page's title**, so the API refuses it anywhere but
first (`blocks.N.data.section`). Inside a context that does not own the
page's `h1` — the console previews, `ownsH1={false}` — `PageSections` sets the
per-request hero level to `h2` (`lib/hero-heading.tsx`, a `cache()` store read
by `HeroTitle`, which every theme's homepage hero now renders its heading
through). On `/` the page owns its `h1`: an opening builder hero or the theme
hero is it, and otherwise an `sr-only` one carries the page's title. No
breadcrumbs, and no automatic closing band — the theme's `cta` is a theme
section like any other.

**"New homepage from the theme"** on Content → Pages builds a draft builder
page from what `/` draws today: the active theme's sections in the order and
set the Themes screen gives, each with its stored background and reveal, the
hero first; the block sections only when a block is chosen for them. Publish
it, then choose it under Settings → Homepage.

**The page lives at one address.** Its own `/{slug}` 301s to `/`, and the
sitemap leaves it out (`/llms.txt` lists no CMS pages at all). Its canonical
is `/`; its SEO title is used only when it is not merely the page's own name
— a page called "Home" keeps the homepage's usual title.

**`FullRows` never touches a preview or a streaming chunk.** It is mounted
once in the root layout and stamps `data-fill-settled` on every
`[data-fill="rows"]` grid; the saved preview streams in under the `[id]`
route's `loading.tsx`, so a theme section's grids were stamped before React
hydrated them — a hydration error on `/admin/pages/{id}/preview`, found by the
audit. It skips anything under `[data-reveal-static]` (the reveal observer's
marker) or still inside React's `<div hidden id="S:…">`, so a preview shows
the whole selection. Each theme section is wrapped in
`data-page-section="theme_section"` with `data-theme-section="<id>"`.

## Tests

`tests/Feature/PageBuilderTest.php` — every type's rules valid and invalid, an
unknown type refused, ids unique, rich text sanitised in a nested field, media
that must exist and be the right kind, references that must be published (and
drop out when unpublished later), a content block inline, a background checked
by the theme rule, a live list resolved, faq sections joining the one
`FAQPage`, the preview presenting without writing, the options endpoint, every
preset saved through the real rules, the role gate.
`tests/Unit/SanitisesRichTextTest.php` — the nested wildcard path.
`tests/Unit/BodySectionsTest.php` — the heading split, `h3`s, a heading over
nothing, an empty body, the forty cap, the size cut. `PageBuilderTest` also
pins the four 0.109.0 types and `sections-from-body` (cleaned, role-gated,
writes nothing, saveable as returned).
