# Site themes — a plan

*Proposal, 2026-09-16. **Step 1 is built** — see `docs/themes.md` for the
rules as they landed, and the decisions taken: the new concept is "Themes",
the palette picker is "Colour palette", four more themes follow (editorial,
then — redirected on 2026-09-16 towards technology-company identities —
datacenter, launch, terminal), public site only, preview route + screenshots.
Where this proposal and `docs/themes.md` disagree — the registry is lazily
loaded, not statically imported; the setting group is `themes`, not
`appearance`; `Card` is not a slot — `themes.md` is what was built and why.*

## What is asked for

Themes the way WordPress has them: each theme in its own folder, each with a
genuinely different architecture rather than a recolour, chosen from a list
in Settings. The content — solutions, products, posts, menus, the store, the
info bar, the popups — stays exactly what it is; the theme decides how the
public site is *built* around it.

## What already exists, and what it is not

The site has a **palette** system called "theme" today: `appearance.theme`
is a preset id (`technoware`, `ocean`, …) or `custom`, five colours and two
fonts generate every token, and `npm run themes` gates the result for
contrast. That is a skin. It changes no layout, no component, no page
structure, and it stays: every design below is painted by it.

The word is the first decision. Two things called "theme" in one console is
the drift this project keeps being caught by, so the proposal is: the new
concept is **Themes** (the client's word, WordPress's word) and the existing
picker is relabelled **Colour palette** — same setting key, same behaviour,
new label. Nothing stored changes.

## The shape

### A theme is a folder

```
web/src/themes/
  index.ts                  the registry: id → theme, statically imported
  contract.ts               the ThemeTemplates interface every theme fills
  classic/                  the site as it is today, moved rather than rewritten
    theme.ts                manifest: id, name, blurb, screenshot, options, extends
    theme.css               that theme's CSS, scoped under [data-theme="classic"]
    templates/
      chrome.tsx            header + footer + drawer (the marketing layout's body)
      home.tsx              the homepage composition
      page-hero.tsx         the section banner every inner page opens on
      card.tsx              the card the grids render
      collection.tsx        the index-page shape (solutions, services, blog…)
      detail.tsx            the detail-page shape
      cta-band.tsx, faq.tsx, … the rest of the slots
  editorial/
  datacenter/
  launch/
  terminal/
```

`contract.ts` is the whole discipline: a `ThemeTemplates` type naming every
slot a page may ask for, with the **props fixed by the data layer** — a
`home` template receives the same ten fetches `page.tsx` makes today, a
`collection` template receives the same list — so a theme cannot change what
is fetched, cached or gated. Pages become thin: `app/(marketing)/page.tsx`
fetches, resolves `theme.templates.home`, renders it. Every page in
`(marketing)` goes through a slot; nothing there renders chrome directly.

A theme may leave a slot empty and declare `extends: "classic"`; resolution
walks the chain, so a theme that only rethinks the homepage and the header
is thirty lines plus two templates. That is WordPress's child theme, and it
is what makes a fourth and fifth theme cheap.

### Selection is a setting; a theme is code

`appearance.site_theme` (public, string, default `classic`), validated
against the registry's ids on the API side the way `motion_*` ids are —
shape only, with the frontend falling back to `classic` for an id it does
not know, so a theme removed in a deploy cannot blank the site. The console
save calls `updateTag("settings")` as it does now, and because every cached
page carries the settings tag, switching the theme re-renders the whole
site at once. **A theme is code and ships with a deploy; choosing one is
data.** No upload, no marketplace, no editor-installed theme — that would be
an editor deploying code, and the sanitiser rules exist because that door
is closed.

### Why the whole registry is imported and why that is fine

Turbopack cannot import a folder by a string read from the database, so the
registry imports every theme statically. Cost, measured before this is
accepted: server components cost nothing on the wire, and a theme's client
islands are code-split by *use* — Next ships the chunks of the client
components a render actually mounted, so an inactive theme's drawer or
carousel never reaches a visitor. What does grow is the server bundle and
the build, by roughly one site's worth of components per theme. The
`icons.tsx` lesson applies in reverse here: the map must not become a
client import, so `index.ts` stays server-only and the console's gallery
reads a `manifests.ts` that carries names, blurbs and screenshot paths and
no components.

Each theme's `theme.css` is imported by the registry and scoped under
`[data-theme="<id>"]`, stamped on the `.public-site` wrapper by the layout
beside the `data-motion-*` attributes — the same construction that keeps the
console untouched, for the same reason. Tokens stay global; a theme may
*add* rules and may not redefine a token, or the palette gate would be
grading a palette the theme then repaints.

### Options a theme declares

A manifest may declare `options`: a small schema (`{ key, label, type:
"choice" | "switch" | "colour", choices }`) rendered generically by the
console under the theme's card and stored as `theme_<id>_<key>` settings in
the `appearance` group — seeded by a command that reads the manifests, so a
new option is a line in one file. The template receives them as
`props.options`. This is how "the editorial theme's sidebar on the left or
the right" becomes a switch without a settings panel per theme.

### The console

Site → **Themes**: a gallery of cards (screenshot, name, one-line blurb, the
active one marked), **Activate**, and **Preview**. Preview cannot be a
cookie read in the marketing layout — a `cookies()` call there makes every
public page dynamic, the 500 that `generateStaticParams` note documents —
so it is a dynamic route of its own, `/theme-preview/[theme]`, admin-only,
rendering the homepage and one collection page through the named theme. The
gallery opens it in a new tab. Screenshots are generated, not uploaded:
`npm run theme-shots` drives Playwright over the preview route per theme
and writes `public/themes/<id>.jpg`, the way `warm-images` and the audits
already drive the site.

### The five themes, and what "different architecture" means for each

Each is a different answer to *how a visitor moves through the site*, not a
different coat of paint. The first is free; the others are ordered by how
much of the contract they exercise.

| id | Architecture | What it changes structurally |
|---|---|---|
| `classic` | The site today | Nothing — extracted, pixel-identical, so the palette gate, both audits and every probe keep passing while the contract is built. |
| `editorial` | Magazine | A slim top rail and a **sticky left index** on every inner page (the page's own sections, live-highlighted); the homepage is a front page — one lead story, a three-column rail, dense type, rules not cards. Exercises `collection`/`detail` hardest. |
| `datacenter` | Operations floor | **Built 2026-09-16.** A dark two-row console header with mono readouts, a dark hero on the grid holding the slider or the NOC panel in a bezel, a readout strip, the solutions as a numbered **rack**, an accent rule on every card, a dark band on every inner page. The first of the three technology-company identities the client asked for on 2026-09-16, which replaced bento/immersive/mono. |
| `launch` | Product / SaaS | **Built 2026-09-16.** The homepage is a **bento grid** of unequal tiles (the hero is a tile, the stats are tiles, a live "support desk today" tile reads the ticket metrics the API already publishes); cards are glass panels on a tinted ground; the header is a floating pill. Exercises `card` and the home composition. |
| `terminal` | CLI | Monospace display, hairline borders, no shadows, no radius, a prompt-styled hero, a permanent **marquee** strip, tables where the others use cards, black-on-white with the palette's accent as the one colour. Exercises the "an icon that does a job is not coloured" rule and the type floor. |

Each keeps every rule in `CLAUDE.md` that is about the *site* rather than
the design: the primitives (`Button`, `Card`, `Field`, `Form`, `Modal`,
`Toast`), the tokens, the 12px floor, the reveal attributes, the `translate`
trap, the audits. A theme that needs a new primitive adds it to
`components/ui` for every theme, not to its own folder.

### The gates grow with the count

- `npm run themes` — the palette gate — runs unchanged; themes do not touch
  tokens.
- `npm run audit` and `audit:mobile` take `AUDIT_THEME=<id>`, which the
  server honours through `SITE_THEME` (an env override of the setting, read
  at boot, the way `CANONICAL_HOST` is) so a CI job can start one server per
  theme against the mock. Five themes is five runs of 145 routes; the matrix
  is the cost of the feature and is written into the definition of done.
- A probe per theme for the thing only it does: the sticky index highlights
  the section in view; the launch tiles never exceed the viewport at 320;
  the datacenter header's readouts hide below `md`; the terminal marquee
  pauses.

## Sequence

1. **The contract and `classic`** — `contract.ts`, the registry, every
   marketing page rewritten to render through a slot, the layout stamping
   `data-theme`, the setting seeded and validated, the console gallery with
   one card. The site must be byte-for-byte the same to a visitor: the audit
   runs against the same 145 routes and the diff of rendered HTML for the
   twenty main routes is empty. This is the largest step and the one that
   finds every place a page reaches into chrome it should not know about.
2. **`editorial`** — the first real theme, chosen because a sticky index and
   a front page stress the collection and detail slots, which is where the
   contract is most likely to be wrong. The preview route, the screenshot
   command and the audit matrix land here, because this is the first moment
   there are two of anything.
3. **`datacenter`** — built. The client's direction changed here: the
   three remaining themes are technology-company identities (Datacenter,
   Launch, Terminal) rather than layout exercises.
4. **`launch`** — built, with the theme options (menu style, hero style,
   section backgrounds, section order and switches) landing beside it.
   Child themes (`extends`) remain proven by the resolver's tests only.
5. **`terminal`** — in its own session, with its probe.
6. Docs: `docs/themes.md` for the rules, a `CLAUDE.md` module block, the
   API.md line for `site_theme`, and the version.

Rough size: step 1 is two to three working sessions; each theme after it
one to two. Nothing in step 1 is visible to a visitor, which is the point.

## Risks named now

- **The contract is the product.** A slot with a loose prop type lets a
  theme fetch on its own, and then one theme is dynamic where the others are
  cached. Props are the data layer's types and nothing else; a template
  receives no `fetch`.
- **Structured data and metadata do not belong to a theme.** `JsonLd`,
  canonicals and `buildMetadata` stay in the pages. A theme that could emit
  its own graph is one that could emit a second `BreadcrumbList`, the bug
  the landing pages already had.
- **Forms stay `<Form>`** whatever the theme draws around them. The
  React 19 reset trap is not something a theme author should be able to
  reintroduce by reaching for `<form>`.
- **Five themes is five audits.** Slower CI is the honest cost; a theme
  nobody has run the audit on is not shippable, and the gallery should say
  so (a manifest flag set by the audit run, not by hand).

## Questions that change the work

1. **The name.** "Themes" for this and "Colour palette" for the existing
   picker, as proposed? Or keep the palette as "Theme" and call these
   "Designs" / "Layouts"?
2. **Which four after `classic`**, and in what order? The table is a
   proposal; the client's own reference sites would decide it better.
3. **Does a theme change the console or the portal?** The proposal says no
   — the console is a tool and the portal is a form — and scopes everything
   to `.public-site`. If the portal should follow the theme, its layout is
   the one other place the `data-theme` stamp would go.
4. **Per-page theme overrides** (a landing page in `launch` on a
   `classic` site) — WordPress has page templates for this. Not proposed
   for the first cut; the contract makes it possible later as one column on
   `pages`.
