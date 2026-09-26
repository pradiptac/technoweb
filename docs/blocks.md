# Content blocks

CTA banners, stat bars, pricing tables and technology stacks (the client,
2026-09-24): sections an editor builds once in the console and places
anywhere with a shortcode — `[cta slug="…"]`, `[stats …]`, `[pricing …]`,
`[stack …]` — plus one CTA as the site's default closing band and three
homepage sections.

## One entity, four kinds

**One table, `content_blocks`, with a `type`**, not four modules. All four
are the same shape — a name, a slug that is a shortcode's contract, a
layout, a status, structured content — and four tables would be four copies
of one CRUD. `App\Enums\ContentBlockType` is the list; each type has its own
layout enum (`CtaLayout`, `StatsLayout`, `PricingLayout`, `StackLayout`),
all sharing `Concerns\BlockLayoutOptions` for `options()` in the
`SliderLayout` shape (value, label, blurb). The console draws its layout
tiles from `meta.layouts[type]`, never a list of its own.

**The type is fixed once a block exists.** A shortcode names the kind
(`[cta …]`), so a CTA that became a pricing table would silently vanish from
every body embedding it. `ContentBlockRequest` prohibits `type` on PATCH.
The layout may change within the type; when it does the content must be
sent with it and is checked against the new layout's rules.

**No `Sluggable`**, the rule `Slider`, `Gallery` and `Popup` state: a block
has no URL, and that trait writes a 301 between two paths that never
existed. A blank slug is made from the name (`uniqueSlug()`, copied from
`Slider`); the form says changing it breaks every embed.

## The content, and why it is called `content`

The column is `data` (JSON); the wire field is **`content`**. A Laravel
resource whose array holds a `data` key is **not wrapped**, so every read
came back without its `{data: …}` envelope — found by the first test. Lists
wherever order matters (plans, rows, items, groups), because MySQL reorders
JSON object keys (the `SpecSheet` rule).

`App\Support\Blocks\BlockRules::for($type, $layout)` is what each layout may
hold, and **each layout requires only what it draws**: a ring gauge needs
exactly three figures each with a percentage, a sparkline a series, a gated
download a PDF, a split an image. `BlockRules::after()` checks what a rule
cannot: a media path that exists (a PDF that is a PDF), a pricing plan with
a price or a label, a comparison row with one cell per plan, a stack node
with one picture not two.

**Every text field is plain text.** The band's words go into each theme's
closing band as a string, and nothing is rendered through
`dangerouslySetInnerHTML`, so there is no markup to sanitise and none is
accepted. Every button href is held to `PopupRequest`'s link shape.

## What the public read changes

`BlockPresenter::data()`:
- a stored path becomes a URL (`image_path` → `image` with `image_alt` and
  `image_focus`; `qr_path` → `qr`; a stack's centre and node pictures);
- **a gated download's `media_path` never leaves** — it becomes
  `has_download: true`, and the file's URL is handed out only by
  `POST /blocks/{slug}/submit`, after an email address;
- a stack node naming a **brand** takes the brand's own name (when the
  label is blank) and logo, read now, so a logo replaced on the brand
  screen reaches every diagram; a node whose brand was deleted is dropped,
  and an empty group with it.

## The default CTA

One published CTA may be the site default (`is_default`; `makeDefault()`
clears every other in one transaction; a draft is refused, and unpublishing
the default clears it). `GET /blocks/default/cta` answers `{data: null}` in
a 200 when none is chosen — the menu rule, since every page asks and Next
caches only a 200.

`components/ui/cta-band.tsx` (the dispatcher every page calls) reads it:
- none, or the API unreachable → the theme's own band, byte for byte;
- a `band` layout → **the theme's own band** (`ThemeBand`) fed the block's
  heading, text, kicker and buttons through three new optional
  `CtaBandProps` all twelve templates take — `primary`, `secondary`
  (absent = "Call {phone}", `null` = none), `kicker`;
- any other layout → `CtaBlock` in the band's place.

**The nine call sites that pass their own `title`/`body`** (solution pages'
"Thinking about firewalls?", careers, store, support…) keep them; the kicker,
buttons and layout come from the default. The seeded default, `site-audit`,
carries the words the bands already showed, so the feature arrived without
moving a pixel.

## The forms a CTA can carry

`newsletter`, `gated_download`, `webinar` post through `CtaForm` (a `<Form>`,
honeypot `website`, `PageContextFields`) to `POST /blocks/{slug}/submit`
(throttle 10/min). A download and a webinar registration become a **lead**
through `LeadIntake::fromBlock` with channel `download` or `webinar` and the
banner's name as the form name, plus `BlockLeadCaptured` to the sales desk
(editable in Email templates as `block_lead_captured`). A newsletter banner
goes through `SubscriberIntake` (source `banner`), answers 202 always, and
is refused — and not drawn — while `newsletter_signup_enabled` is off.

That switch is a `boolean` row, so `Setting::get()` returns `false`, never
`'0'`: the footer's own `/newsletter/subscribe` compared it to `'0'` and
never refused anybody until this was found (fixed there too, and pinned).

## Rendering

`components/blocks/`: `BlockView` switches on type — `CtaBlock`,
`StatsBlock`, `PricingBlock`, `StackBlock` — each on layout. `embedded` is a
block inside an article body (no `Container`, a margin); without it, a page
section. Server components throughout, with client islands only for the
countdown (client-only first render, the `DueClock` rule), the CTA forms,
the pricing tabs and billing switch, the orbit's selection and the globe.

- **Rings** use `components/ui/ring.tsx` (lifted from the SEO score ring),
  the figure in HTML over the SVG — never SVG text.
- **The comparison table's scroller is `relative`**: its cells' sr-only
  "Included" labels are absolutely positioned, and an absolute box escapes
  a scroller that is not its containing block — the page scrolled 188px at
  360 with no visible element over the edge.
- **A stack disc has no percentage padding**: percentage padding resolves
  against the *parent's* width, so in the orbit's wide detail card it
  swallowed a 56px disc and the logo's box measured 0px. The mark is sized
  as a share of the disc (`.stack-disc__mark`).

## Shortcodes and the homepage

`lib/shortcodes.ts` recognises the four kinds in its one regex;
`ProseWithShortcodes` fetches each distinct slug once and renders nothing for
a draft, an unknown slug or a block of another kind than the shortcode names.

Three `homepage` settings — `home_stats_block`, `home_pricing_block`,
`home_stack_block` — each a picker of that kind's published blocks (the API
sends the options; anything else is refused). `loadHome()` fetches the
chosen ones; `homeBlockSections()` returns entries **only for chosen
blocks** (an empty entry with a background set would be an empty band), and
every theme spreads it before its closing band. The Themes screen places and
switches them like any section (`HOME_SECTIONS`: `stats_block`, `stack`,
`pricing`).

## The console

Four sidebar rows under Site — CTA banners, Stat bars, Pricing, Technology
stack — at `/admin/blocks/{type}`, with `/new`, `/{id}`, `/{id}/preview` and
`/showcase`. **The kind is in the path, not a query**: `?type=` matched no
sidebar row, and `screenRole()` — the role gate — answers 404 for a screen
no row matches.

The form holds the content as one object in state and posts it as JSON (the
slide repeater's approach); each field is bound to a path, and a 422 keyed
`content.items.0.value` finds its own field. The Preview and Showcase render
`BlockView` inside `.public-site` with the active theme, drafts included.

**Previews are `data-reveal-static`.** The console streams its pages in
behind `loading.tsx`, after hydration, and the root `Reveal` observer
stamping `data-aos-animate` on that markup is a hydration mismatch. The
observer skips such a region — checked again at intersection time, because
an async component (the theme band) streams as its own chunk, parked in a
hidden div at the end of `<body>` before React moves it into place — and
`globals.css` shows it at rest. Public pages have no `loading.tsx`.

## Seeding

`ContentBlockSeeder` (create-only): `site-audit`, the default band,
published; one **draft** of every other layout, the stat samples built from
the hero's own figures, invented pricing, and a stack from the catalogue
brands with real logos. All placeholders (CLAUDE.md, "Known risks").
