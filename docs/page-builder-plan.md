# Section page builder — plan (2026-09-26)

The client asked for a page builder and chose **a section builder**: a page is
a stack of ready sections, each with its own validated fields; reorder,
duplicate, hide; live preview. **No free-form drag canvas.** This reverses the
2026-09-20 "not suggested" note (`docs/feature-ideas-2026-09-20.md`) and the
"`blocks` is deliberately absent" comments in `StorePageRequest` /
`UpdatePageRequest` — update both with the date and the reason: the objection
was raw JSON typed into a text field; a builder with per-section validated
fields is the answer that note asked for.

## Data

- `pages.blocks` (existing nullable JSON, currently unused) holds a **list**
  of sections: `{id (uuid), type, hidden, background, data}`.
  `background` reuses the theme `SectionBg` shape (`kind` default/solid/
  gradient/image, colours, angle, image_path, overlay — validated by the
  same rules `App\Support\ThemeOptions` uses for section backgrounds).
- `pages.template` gains `builder` in the allowlist (`default`, `wide`,
  `builder`): a builder page renders its sections instead of the body.
- `App\Enums\PageSectionType` with `label()`, `blurb()`, `options()` (sent as
  `meta.section_types`), and `App\Support\PageSections\SectionRules::for($type)`
  (the `BlockRules` pattern: each type validates exactly what it draws; rich
  text fields sanitised with the `cms` profile inside the rules class, since
  `SanitisesRichText` only handles one wildcard level — or extend that trait
  to nested wildcards, with a unit test); `SectionPresenter` resolves media
  paths to URLs + alt + focus (`MediaMeta`) and references (slugs/ids) to
  what the frontend needs.
- Section types (v1):
  - `hero` — kicker, heading, lede, image, primary/secondary buttons, layout
    (`split` / `centered` / `cover`).
  - `rich_text` — heading, body (rich text, shortcodes allowed).
  - `media_text` — heading, body, image or YouTube/MP4 video, side
    (left/right), buttons.
  - `features` — heading, lede, 2–4 columns, items `{icon, title, body,
    link}` (up to 12).
  - `cards` — a **live list**: heading, source (`solutions`, `services`,
    `industries`, `case_studies`, `blog`, `knowledge`, `store_products` by
    category, `products` by category), limit, rendered as the theme's
    `Collection` of `Tile`s.
  - `content_block` — pick a published CTA / stats / pricing / stack block
    (renders `BlockView`).
  - `slider`, `gallery`, `form` — pick one by slug (renders `SliderFor`,
    `Gallery`, `FormBlock`).
  - `faq` — heading + items `{question, answer}` (plain text answers) or
    "use this page's FAQs"; feeds the page's single FAQPage via the existing
    `faq_schema` rule (never two FAQPage graphs).
  - `logos` — clients or partner brands strip (`LogoMarquee`, mode from the
    theme).
  - `testimonial` — quote, name, role, photo.
  - `video` — YouTube (click-to-play facade, no-cookie, never i.ytimg.com)
    or MP4 from the media library.
  - `divider` — a spacing/rule section (small / medium / large).
- API: the admin page resource and requests accept/return `blocks` (with
  `meta.section_types` and per-type option lists); the public `PageResource`
  returns presented `sections` (hidden ones omitted) when the template is
  `builder`. Validation errors keyed `blocks.N.data.field`.

## Frontend

- Public: `web/src/app/(marketing)/[slug]/page.tsx` — when `template ===
  "builder"`, render `PageHero` only if the first section is not a `hero`,
  then `PageSections` (new `web/src/components/page-sections/`), one server
  component per type, each wrapped in `SectionBg` + `Container` and the
  `.section-y` rhythm, using existing primitives (`Card`, `Collection`/
  `Tile`, `BlockView`, `SliderFor`, `Gallery`, `FormBlock`, `FaqList`,
  `LogoMarquee`, `Prose` / `ProseWithShortcodes`), `data-aos="fade-up"`
  reveals, tokens only, headings one level below the page's single h1 (a
  builder `hero` provides the h1 when it is first; otherwise `PageHero` does
  — exactly one h1 either way). Themes restyle via existing `[data-theme]`
  hooks; nothing theme-specific in the components.
- Console: the page form (`web/src/app/admin/(app)/pages/page-form.tsx`)
  gets a **Builder** tab shown when the template is `builder` (the body tab
  hides its editor then): a section list with add (a picker of type tiles
  with blurbs), `ReorderButtons`, duplicate, hide/show, remove (with undo
  via toast), collapse; each section's editor built from the existing admin
  primitives (`Field`, `EditorField`, `CoverField`/`MediaBrowser`,
  `IconField` lazy, selects fed by the pickers the API sends — published
  blocks, sliders, galleries, forms, categories); the whole list posts one
  hidden JSON `blocks` input and is added to the Builder tab's `fields` list
  so 422s land there with the section highlighted.
- Preview: "Preview" opens `/admin/pages/{id}/preview` rendering the saved
  sections inside `PreviewFrame` (theme-aware, `data-reveal-static`); plus
  an unsaved-draft preview: a Server Action posts the current JSON to a
  `POST /admin/pages/preview` API endpoint that validates and presents
  without saving, rendered in a `Modal` with the same components.
- Templates: "Start from" presets when creating a builder page (Landing,
  Service, About) — plain JSON starters in the API (`meta.section_presets`).
- Seed: one sample draft builder page (`PageSeeder` must not overwrite the
  policy pages; create-only) so the audits render every section type.
- `mock-api.mjs`, `types/api.ts`, audit lists (the sample page's public
  route and its console edit via DISCOVER).

## Docs and tests

`docs/page-builder.md`, `docs/editor.md` note, CLAUDE.md module section (one
line per rule) and remove/annotate the "no page builder" statements
(`docs/feature-ideas-2026-09-20.md`), `API.md`, `FEATURES.md`. Tests: each
section type's rules (valid/invalid), unknown type refused, rich text
sanitised in nested fields, media paths must exist, references must be
published, hidden sections omitted publicly, presenter output, preview
endpoint validates without writing, builder template renders sections,
role gate.
