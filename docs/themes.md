# Site themes

One folder per theme under `web/src/themes/`, each filling a fixed set of
template slots; the active one is the `site_theme` setting (Site → Themes in
the console), `classic` by default. The colour palette (`appearance.theme`,
Site → Settings → Colour palette) is a different thing and paints every theme. The
proposal this grew from is `docs/themes-plan.md`.

**A theme is code and choosing one is data.** `themes.site_theme` is a public
string; the API checks it for the shape of an id and nothing more
(`SettingController::validateSiteTheme`, the motion rule for the motion
reason), because the list lives in `web/src/themes/manifests.ts` and a copy
on the other side of the wire would be the `admin_path` drift. Every way the
value can be wrong lands on `classic`: unknown, blank, a theme removed in a
deploy, a folder that fails to import. The site cannot render themeless.

**`classic` is the site as it was on 2026-09-16, moved and not rewritten.**
Its four templates are the marketing layout's chrome, the homepage's
composition, `PageHero` and `CtaBand`, moved verbatim with their docblocks
— `git log --follow` on `themes/classic/templates/*` reaches the history —
and its `theme.css` is a comment, because everything classic paints is
`globals.css`. Step 1 was gated on `scripts/probes/html-snapshot.mjs`: 35
routes from a production build before and after, normalised, `diff -r`
empty; the build's route table identical; `npm run perf` CSS bytes
identical and JS bytes lower.

**Four slots, and the dispatcher pattern is what made step 1 a no-op.**
`Chrome`, `Home`, `PageHero`, `CtaBand` (`themes/contract.ts`). The ~30
pages that render a hero keep importing `@/components/ui/page-hero`; that
file is now a dispatcher — resolve the active theme, read the settings once,
hand both to the theme's template. Same for `cta-band.tsx`. **Every prop is a
type the data layer already produces**, and none is a function: a template
receives data and returns markup, so it cannot fetch (and make one page
dynamic where the others are cached), cannot read a cookie, and cannot emit
`JsonLd` — the structured data stays in the pages and the layout.

**`Card`, `SectionHeader` and `Container` are not slots, deliberately.**
`card.tsx` is imported by three console client components
(`jobs/reference/reference-lists.tsx`, `leads/lead-panels.tsx`,
`menus/menu-builder.tsx`), and a `server-only` registry behind it would be
the `lib/settings.ts` 500 on every console screen; it also renders outside
`.public-site`, where there is no theme. A theme restyles them through
`[data-theme="<id>"]` rules in its own `theme.css`. A slot for a detail
page's frame or a collection's shape is added in the step whose theme needs
it, with `classic` getting the pass-through and the pages that use it edited
once — which is the honest limit of the dispatcher approach: step 1 changed
nothing, and themes two to five each grow the contract.

**The registry is `server-only`, and its loaders are lazy literals.**
`themes/index.ts`. A client component that needs a theme's *name* imports
`themes/manifests.ts` (pure data); one that needs the *id* imports
`lib/site-theme.ts`; nothing on the client imports the registry, or
`server-only` throws at build. The loaders are `() => import("./<id>/templates")`
because Next builds a segment's client chunk from every `"use client"`
module *reachable in its server module graph*, not from what rendered — the
`IconField` lesson — so five statically imported themes would put five
headers' client islands into the marketing layout's chunk for every visitor.
Dynamically importing a *server* component lazy-loads only the client
components under it. Literal, because Turbopack cannot analyse a
template-string path. Measured in step 2, the first time there are two.

**Resolution is `activeTheme()`, cached per request, preview store first.**
React `cache()` around it, so the thirty dispatchers on a page resolve once.
It reads the preview store (below), then `siteThemeId(settings)`:
`SITE_THEME` in the environment wins over the stored setting, the id is
checked against the manifests, unknown falls to `classic` with one
`console.warn` per process. `resolveTheme(id)` walks the manifest's
`extends` chain root-first — depth cap 3, cycle guard — awaits each loader
inside a `try`, and overlays the templates; a root that will not load
resolves `classic` instead.

**`SITE_THEME` is the kill switch, and it has three caveats.** One line in
the runtime environment turns a misbehaving theme off with no console login
and no database edit, and it is what the audit matrix will use to run one
server per theme (a `PATCH` from a script does not `updateTag("settings")`,
so the setting is the wrong lever for that). It is process-wide; index pages
are prerendered at **build**, so for `next start` it belongs in the build
environment like `API_BASE_URL`; and the ISR cache survives a restart, so a
matrix run wants a fresh `.next` per theme. The Themes screen says
"overridden by SITE_THEME" when it is set — an editor activating a theme
that changes nothing would otherwise read the screen as broken.

**The preview route is a segment of its own, and the override is a
`cache()` store written before the first `await`.** `/theme-preview/<id>`
(the homepage) and `/theme-preview/<id>/specimen` (a made-up inner page:
hero with trail and banner, a card grid, the band), admin-only through
`getCurrentStaff()`, `noIndex`, disallowed in `robots.ts`. Outside
`(marketing)` so the real chrome is not drawn twice; under the root layout
so the fonts, the tokens and the scheme script are. It is dynamic — it reads
a cookie — and that costs the real site nothing because the marketing layout
stays cookie-free (the build's route table is the proof). `forcePreviewTheme(id)`
writes a request-scoped store that `activeTheme()` reads ahead of the
settings, so every dispatcher underneath renders the named theme with no
cookie, header or query string reaching a cached render. It must be called
**before the first `await` after `params`**, and never from a layout: Next
renders a layout and its page as separate segments, so a page's
`activeTheme()` can run before a layout's override is set.

**Theme CSS is one `@import` per theme in `themes/themes.css`, imported at
the top of `globals.css`.** Not imported from the theme module: a `.css`
reached through a lazy `import()` arrives with the chunk — a flash of
unthemed page — and a theme's rules that use a `--color-*` token need to be
inside the one Tailwind pipeline. `@import` must precede `@theme`, so theme
rules land *before* every unlayered rule at the bottom of `globals.css`: at
equal specificity the 12px type floor and the motion rules win, which is the
right default, and a theme that genuinely needs to beat one writes the more
specific selector. Every rule is scoped under `[data-theme="<id>"]`, stamped
on the `.public-site` div beside `motionAttrs()`, so the console is
untouched by construction — the motion argument, again.

**The Themes screen is `/admin/themes`, not a settings tab, and the palette
picker is "Colour palette".** The info-bar rule: a sidebar row *and* a tab is
two doors to one form. `STANDALONE_GROUPS` in `settings-copy.ts` keeps the
`themes` and `announcement` groups out of the strip; both are fetched with
every other setting and saved through `saveSettingsAction`, which PATCHes
only the `setting__*` names it finds. The gallery is a client component
reading `manifests.ts`; what only the server knows travels as props —
whether each screenshot exists under `public/themes/`, whether `SITE_THEME`
is set. The radio cards re-assert `checked` in an effect, the motion
picker's fix for React 19's post-action reset; the Preview link is a plain
`<a target="_blank">` because a `Link` would prefetch a dynamic signed-in
route from every render; and it sits **outside** the label, since an anchor
inside a label is two controls on one click.

**Screenshots are generated and committed.** `npm run theme-shots` signs in,
opens each manifest's preview at 1280×800 and writes `public/themes/<id>.jpg`;
a card whose file is missing draws a placeholder. `npm run themes:check`
refuses a duplicate or malformed id, an `extends` that does not resolve or
loops, a missing default, and notes a missing screenshot.

**Rules for a theme author**, each of which the rest of this file explains
somewhere: props are the data layer's types, never fetch in a template;
`next/image`, never a raw eager `<img>`; `<Form>`, never `<form>`; no
`JsonLd` from a theme; the `--duration-*` tokens; `translate`/`scale`, not
`transform`; nothing widens the document; a hidden start state only inside
`prefers-reduced-motion: no-preference`; a `PageHero` template renders
`<Breadcrumbs>` when given `crumbs`, or the `BreadcrumbList` a search engine
reads disappears silently; a new primitive goes in `components/ui` for every
theme, not in one theme's folder; and a theme is not shippable until both
audits have run against it.

**`Breadcrumbs` moved to `components/ui/breadcrumbs.tsx` and is re-exported
from `page-hero.tsx`.** Six importers keep the path they had. It moved
because classic's hero template imports it, and a template importing the
dispatcher that lazily loads it would be a cycle.

**The snapshot probe learned three things about "identical" HTML.** A
streamed page splits its RSC payload into a different number of `<script>`
chunks from one request to the next, so runs of them collapse to one. React's
`useId` values encode the component's position in the tree, so wrapping the
same markup in one more component renames every id on the page — normalised.
And the first request after a fresh `next start` on a dynamic route streams
its metadata behind a Suspense placeholder while the API call is cold; the
probe fetches twice and keeps the second.

## Editorial — the first real theme (step 2, 2026-09-16)

**Set like a paper, from `ui-ux-pro-max`'s "Swiss Modernism 2.0" direction
for a B2B infrastructure company asked for a magazine.** Rules, not cards;
a high-contrast serif for headlines over a plain sans; nothing rounded. The
type is declared in `theme.css` — `--font-display` becomes Playfair Display
and `--font-sans` Source Sans 3, both already vendored — and that is the one
place a theme redefines tokens: type tokens, never colour tokens, because
the contrast gate reads colours and not faces. `font-family` is set on the
`[data-theme]` element as well as the token, because `body` resolves the
variable at the body and children inherit the *computed* family.

**The masthead is three rules, and everything that works is reused.**
`themes/editorial/masthead.tsx` is a client component: a dateline strip
(telephone, address, the utility links, the search field, in small
capitals), the nameplate with the logo centred and large, and the section
rail — the primary navigation in tracked capitals between two hairlines —
which is the part that sticks; the nameplate scrolls away. `MegaMenu`,
`TopBarPanel`, `SiteSearch`, `CartBadge` and the whole `MobileDrawer` are
the classic header's, on the same `data-closed` contract, whose two helper
functions moved to `components/layout/panel-host.ts` with their notes so
both headers import them. A second drawer would be a second set of the bugs
the first already fixed. `--h-site-header` is 48px under the theme, because
the shop's filter bar sticks beneath whatever is sticky and reads it.

**The front page's lead is full-bleed and is one of two things.** With a
slider it is the slider edge to edge and the headline sits *under* it as a
standfirst — the slides carry their own captions. Without one it is a fixed
picture with the words on it: the site's default banner (Settings → Page
banners), forced dark the way `PageHero` forces its banners dark, so the
white type is arithmetic; with no banner either, a dark band with the
theme's backdrop. (The client's words: "hero may be full width slider or may
be fixed image and text on that".) Under it, an "in numbers" strip, then
three columns of text under section labels — numbered solutions, the
industries, the latest posts with their dates — the hardware as a ruled
index with counts, the case studies as a ruled list with their results, and
the closing notice. The partner marquee, the client wall and the credentials
are classic's sections, reused.

**An inner page opens on a headline, not a banner.** Editorial's `PageHero`
ignores the section banner a page names — a paper's section front opens on
type — and draws the trail on the top rule, the kicker as a short rule and a
label, the headline in the serif with no width cap, the lede one size up.
`CtaBand` is a ruled notice: headline left, copy and actions right, on the
page ground so it inverts with the scheme.

**`Card` gained `data-card`.** The one change outside the theme folder: a
theme cannot restyle a card by class, since the classes are utilities, so
the primitive stamps an attribute and `theme.css` squares the corners and
drops the shadow under `[data-theme="editorial"] [data-card]`. This is the
"restyle through CSS" half of the decision not to make `Card` a slot.

**What editorial did not add, and why.** The plan named `DetailFrame` (a
sticky left index) and `Collection` slots. Every detail page already draws
its own two-column layout with a right-hand `<aside>`, so a frame slot would
have meant refactoring seven pages to hand their body and aside to a theme
— and the index pages differ enough (a card grid, an icon list, a table)
that a `Collection` slot would be eight page rewrites for one theme's
benefit. Both wait for the theme that needs them; the four slots plus
`[data-theme]` CSS already make editorial a different architecture at the
chrome, the front page and every page's opening. The honest limit of the
dispatcher approach, restated.

**Audited live, not only previewed.** `SITE_THEME=editorial npm run dev`
and the public routes through `npm run audit`, `AUDIT_SCHEME=dark` and
`audit:mobile` — the matrix the kill switch was designed for. A second dev
server in the same directory is refused by Next (one lock per project), so
the matrix runs one theme at a time on `:3000`.

## Datacenter — the first technology-company theme (step 3, 2026-09-16)

**The site as an operations floor.** Asked for on 2026-09-16 — "prepare
the themes which is very much related to technology company website" — so
the three themes after editorial are tech identities rather than layout
exercises: Datacenter (this one), Launch (bento/SaaS) and Terminal
(mono/CLI). Datacenter is a network-operations aesthetic: a dark header and
hero on the blueprint grid, monospace readouts where the classic site has
statistics, the NOC panel as the hero's picture, solutions listed like
racks with codes, and an accent rule where a card would have a shadow.
`theme.css` makes IBM Plex Sans the display and body face — the most
engineered of the vendored set — and every figure is already JetBrains
Mono, the site's `--font-mono`; the palette owns every colour, the
editorial rule.

**The header is two dark rows, and both are the dark-ground tokens.**
`themes/datacenter/header.tsx` (`ConsoleHeader`, a client component): a
status strip built from the site's own statistics (Site → Settings → Homepage,
the first two `value|label` rows, each with a steady dot), the telephone
number, the search field, the utility links rendered as `[Label]`, and
the support address; then the header proper — the logo on dark, the
sections as tracked capitals with a `brand-300` underline that scales in
on hover, the cart mark on Store, one `brand-600` button. `dark`,
`dark-2`, `dark-line`, `dark-ink` and `dark-muted` do not invert with the
scheme — `CtaBand`'s rule — so the header is the same dark in light and in
dark, and the contrast is arithmetic rather than a hope. `MegaMenu`,
`TopBarPanel`, `SiteSearch`, `CartBadge` and the whole `MobileDrawer` are
the classic header's, through `panel-host.ts`, as editorial's are. The
mega menu's light card reads as a window opening over the console.
`--h-site-header` is 64px under the theme, for the shop's sticky filter
bar.

**The hero is the console's own drawing, in a bezel.** The dark band
continues from the header; on the left the kicker as `// networking ·
servers …` in mono, the `display-1` headline and the lede; on the right a
"monitor" — a `dark-2` bezel with a mono label (`display-01` or `noc-01`)
and a live dot — holding the slider when one is configured (16:10, `sizes`
at half the viewport) and otherwise `NocPanel`, the topology drawing that
was the classic hero's fallback, which is the one picture on the site that
belongs on an operations floor. Under it the readout strip: every
statistic in mono with a dot, the way a status page lists services. Then
the **rack** — the first six solutions as an ordered list, `SOL-01…` in
mono, the icon tile, the name and a truncated summary, each row a link
with a surface hover — because a list of what is installed is what an
engineer reads first. The rest of the classic sections follow under the
theme's CSS: they are the same evidence whatever the room looks like.

**Every inner page opens on the dark band, never on a banner.**
Datacenter's `PageHero` draws the grid, the trail in mono on dark, the
kicker with the slash prefix and the `display-2` heading, and ignores the
section banner the page names: a photograph under a blueprint grid is two
pictures fighting, and the header and the hero should read as one panel.
`CtaBand` is a dark panel with a 4px rule down its left edge — brand on
the homepage, accent on inner pages — and `// next step` in the corner.
Cards keep their radius at 6px, lose the shadow and the lift, and carry a
2px `brand-500` rule along the top, all under `[data-theme="datacenter"]
[data-card]`.

**Audited the way editorial was.** `SITE_THEME=datacenter npm run dev`,
then the public routes through `npm run audit`, `AUDIT_SCHEME=dark` and
`audit:mobile`, with `warm-images` run three times first — the theme's
hero draws the slider at a width classic does not, so its first variants
were cold.

## Theme options — menus, section backgrounds, inner-page layouts (step 4, 2026-09-16)

**One JSON row, per theme, shape-checked by the API and resolved with
per-field fallback.** `site_theme_options` in the `themes` group, public,
`{ "<theme id>": { menu_style, hero_style, sections } }`. Per theme rather
than site-wide because a choice like "big menu" is made looking at one
theme's header and would be wrong under another's; switching theme
switches the whole look, options included. `App\Support\ThemeOptions`
checks the *shape* — a section background is one of four kinds, a colour
is `#rrggbb`, an angle is degrees, an overlay is 0–90, a picture is a
media path — and runs before `validate()` like the rich-text cleaner,
because the write loop reads the validated copy and a merge after it
changes nothing (found by the test: the first cut stored the raw bytes
under a green run). The lists — which menu styles, which hero styles,
which section ids — live in `themes/options.ts`, the motion group's rule,
and `resolveOptions()` falls back per field to the manifest's `defaults`.
A picture's `image_path` is published with an `image_url` beside it
(`ThemeOptions::withUrls`, on both the public map and the admin index),
because a path buried in JSON cannot ride the `_path` → `_url` rule.

**Options reach templates as `options`, beside the data.** `Chrome` and
`Home` take `options` as a prop the callers pass from `theme.options`;
`PageHero` and `CtaBand` get it from their dispatchers. A template that
ignores an option is fine, and says so in its manifest (`ignores`) so the
console greys the control with a sentence rather than hiding it — an
editor who cannot find "inner page heading" under Editorial concludes the
feature is broken, not that the theme opens on a headline by design.

**Menu style is one `MegaMenu` with a `style`, never four panels.**
`simple` is a fixed-width list of labels; `semi` two compact columns with
the drawer-size icon; `mega` the panel as it was; `big` spans the header.
The mechanism — hover/focus open, the `data-closed` contract, the
recursion into sub-entries, the "view all" strip — is one implementation,
and a second copy is the one that misses the next fix. `big` positions
against the header's *container*: a host passing it moves `relative` from
its `<ul>` to its `<Container>`, and `inset-x-0` on the panel spans
whatever is positioned above it. All three headers do this the same way.

**A section background is a local palette, not a colour.** `SectionBg`
wraps each homepage section — nothing at all when the section has no
custom background, which is what keeps an untouched site byte-identical —
and when it has one, sets on the wrapper the background *and* every token
the markup inside resolves: `--color-ink`, `muted`, `card`, `surface-2`,
`line`, the three coloured-text inks, and the dark-band tokens (`dark`,
`dark-2`, `dark-ink`…) so the hero and the support band show the colour
too. A custom property re-resolves wherever it is redefined, so nine
sections' existing `text-ink`/`bg-card`/`border-line` classes paint the
new palette without a line of their markup changing. The ink is
`announcementBand()`'s — pushed until it clears 4.5:1 on **every stop**,
which is exactly what the audit grades — the card is checked against the
ink again (a lifted panel is closer to the text than the ground was), and
each coloured-text ink is pushed against the stops as well as its card,
because a kicker sits on the ground. Two traps found by looking: `color`
inherits as a *computed* value, so an element with no colour class kept
`<body>`'s ink until the wrapper set `color` itself; and a kicker was
`text-secondary-ink`, so one ramp was not enough. A gradient makes `page`,
`surface` and `dark` transparent so the section's own fill is not a slab
over it; a picture sits at `1 − overlay` opacity on an opaque overlay
colour, the banner's rule the other way up. Both schemes paint a custom
section the same: the client chose a colour.

**Inner-page layouts are classic's `PageHero` reading `hero_style`.**
`banner` as before; `cover` taller with the words centred and the ramp
from below; `split` on the page's own light ground with the picture in a
frame beside the words (first on a phone), so the contrast is the page's;
`compact` opens on the headline. Editorial and Datacenter ignore it and
their manifests say so.

**The console edits every theme's options at once and posts them whole.**
The Themes screen holds one draft for all themes and shows the chosen
radio's; the JSON is one hidden `setting__site_theme_options` field, and
no control inside has a `setting__` name of its own, since
`saveSettingsAction` PATCHes every one it finds. The picture picker is
`CoverField` with a non-setting name and `onPathChange`; a proof run
uploaded a 2400px Freepik data-centre aisle through it onto the hero. The
gallery's first screenshot is `loading="eager"` now: with the options
below it the card is the screen's LCP and lazy was the dev warning.

**Stock imagery comes from Freepik through the Magnific connector**
(`stock_search` → `stock_download`, a per-item credit spend the client
authorised on 2026-09-16), resized to 2400px before upload — the original
was 9MB at 5504px, over the library's limit and far over what a
background needs.

## Launch — the second technology-company theme, and sections you can switch and sort (step 5, 2026-09-16)

**Launch is the site as a product launch page.** The SaaS identity of the
three: a **floating pill header** (sticky, 12px below the top, inset from
the sides, `bg-card/92` under a blur so the page shows past it), a
**bento** front page of unequal rounded tiles — the words as the big tile,
the slider or the theme's own network render as the picture tile, the four
statistics as small tiles on the brand wash, the support desk as a picture
tile with a card of copy over its foot, six solutions as chips — pill
buttons everywhere (`[data-theme="launch"] .btn { border-radius: 9999px }`),
cards at 20px, Sora for display and Figtree for body. Every inner page
opens on a rounded brand-wash panel with the section's picture framed
beside the words, so a photograph is never behind text; the closing band
is a rounded panel on the brand's deep steps, `text-white`, the steps the
palette gate checks under white. Two Freepik pictures ship under
`public/themes/launch/` for the tiles no CMS record feeds — resized to
1600px from 6000px originals, through `next/image` like every other
picture.

**The pill has one row, so what it holds is a function of width — and it
was measured.** The first cut let the nav run under the right-hand group
at 1440 (the nav is centred with `mx-auto`, so a right group wider than the
room it leaves overlaps it rather than pushing it). The nav is `shrink-0`
and the right group shows the last utility link from 1440, the rest from
1680 and the compact search from 1760; measured clearances of 33, 85, 38,
98 and 26px at 1280, 1366, 1440, 1680 and 1760, none negative. Below 1280
the drawer holds all of it.

**Sections can be switched off and reordered, per theme, on the same
row.** The Themes screen's "Homepage sections" list carries a Show
checkbox and `ReorderButtons` per row beside the background; the draft
stores `sections.<id>.enabled` (only an explicit `false` — a value that
arrived as `"no"` switches nothing off) and `section_order`, a list of ids
the API checks for shape and de-duplicates. On the site every theme's
`Home` builds a `SECTIONS` list of `{ id, node }` in its own order and
draws `orderSections(SECTIONS, options)`: the ids the stored order names
first, in that order, then the rest in the theme's order — so a section a
theme gains later still renders — minus the ones switched off. A theme
that does not draw a section (editorial has no "why us") never lists it,
so an order naming it changes nothing. Every section sits in a
`HomeSection` shell (`components/ui/section-bg.tsx`), which is what wraps
the background too. All four homes were restructured onto the list; the
markup inside each section did not change.

## Terminal — the third technology-company theme, and every inner page changing with the theme (step 6, 2026-09-17)

**Terminal is the site as a command line.** JetBrains Mono for every
heading, label and button; hairlines, square corners, no shadow and no
lift anywhere (`[data-theme="terminal"] [data-card]` and a rule taking the
radius off `.rounded-*`); the page's own ink on the page's own ground
with the palette's brand as the one colour. The header is one row with the
sections as paths (`/solutions`) and a brand block-cursor underline; under
it a permanent **ticker** (`themes/terminal/ticker.tsx`) — the homepage
statistics, the kicker and the phone number in mono, scrolling — which is
the brand marquee's CSS and its pause button, so it pauses on hover, on
focus and by the button, and freezes and wraps under reduced motion
through the `announcement-ticker` rule. The front page opens on two
terminal windows (a title bar of three discs and a name): the prompt with
the kicker as a `#` comment, the headline typed out and two bracketed
buttons, and beside it the slider or the NOC drawing; the statistics as
one bordered row; the solutions as a **table** (`$ ls solutions/`) where
every other theme draws cards. Every inner page opens on a prompt line and
a `#` heading; the closing band is an `ink`-on-`page` box (the two tokens
that swap with the scheme together) with `$ book --site-audit` in the
corner. `--h-site-header` is 88px, the row plus the ticker, so the shop's
filter bar sticks under both.

**Buttons are bracketed by borders, not pseudo-elements.** The first cut
put `[ ` and ` ]` on `.btn::before`/`::after`, and the computed `content`
stayed `""`: the motion styles (`shine`, `ripple`) already own the
button's pseudo-elements, at equal specificity and later in the cascade.
A `3px double` rule down each side in the button's own ink at 55% reads as
the brackets and fights nothing.

**Mono is wide, and the header was measured rather than reasoned.** With
the client's 220px logo the seven paths leave 8px beside a right group
holding the phone and a utility link at 1280 — so the CTA is
`[ engineer ]` until 1440, the phone and the last utility link show from
1600, the rest from 1760, the search from 1920, and the clearance is 62,
140, 206, 235, 167 and 121px at 1280, 1366, 1440, 1680, 1760 and 1920.

**A `sr-only` span inside a scroll box is not inside it.** The solutions
table has two visually hidden column headings; `sr-only` is `position:
absolute`, and with no positioned ancestor its containing block is the
page — so each sat as a 1px box at x=664 on a 360px screen, 304px of
overflow from a table that was correctly scrolling inside its
`overflow-x-auto` wrapper. The wrapper is `relative`. Worth knowing
generally: the mobile audit's containment check would not have named it
either, since the span's *parent* is inside the scroll box.

**Every inner page changes with the theme, by attribute.** The client
asked (2026-09-17) for inner pages to change identity with the theme,
naming the team page: round photographs, details on hover,
black-and-white that colours on hover. `TeamGrid` stamps `data-card`,
`data-team-photo`, `data-team-role` and `data-team-detail` (the bio and
the chips) on one markup, and each theme's `theme.css` redraws it —
Editorial and Terminal print the photograph in one or two inks and bring
the colour up on hover or focus-within; Datacenter prints it on a brand
tint with a mono designation; Launch draws it round on the brand wash
and slides an opaque `card` panel with the bio and the chips down over
the photograph on hover, and only under `(hover: hover)` — a phone keeps
the detail open in the body. `filter`, `translate` and `scale` only, so
the audits' colours are unchanged and nothing lays out; and the words are
the same under every theme, which is what keeps the audits and a screen
reader reading one page. The client wall and the certification cards
carry `data-card` too, so the four card treatments reach them for free.
Classic is measured unchanged.

**And each theme lays the team card out its own way** (the client,
2026-09-28: "the team design is absolutely the same in each theme" — the
prints differed, the card did not). The list is `data-team` and every
movable piece is named (`data-team-kicker`, `-name`, `-role`, `-bio`,
`-certs`, `-chip`, `-contact`, `-link`), so each `theme.css` changes the
*layout*, not just the photograph:

| Theme | The card |
|---|---|
| Classic | the portrait card, unchanged |
| Editorial | a staff box: ruled rows two across, a small square print beside a display-face name |
| Datacenter | an access badge: dark tokens (the same in both schemes), an `ACCESS · 01` strip from a CSS counter with alt text `""`, the print framed, mono name |
| Terminal | an `ls -l` listing: one row each, `~/name`, `$ role`, the bio as a `#` comment, links at the far end; stacked below 48rem |
| Launch | its rising panel, kept |
| Canvas | a centred profile: a 136px round portrait ringed in the person's hue |
| Vantage | the photograph is the card; the words on a fade to the opaque dark at its foot, with the dark band's local palette (`surface-2` included, or the chips take the light card gradient) |
| Sentinel | wide cards: the portrait the left two-fifths at full height, the rule turned into a glowing vertical seam; stacked on a phone |
| Summit | a round portrait floating over the card's top edge, ringed in the page's ground, centred |
| Keystone | a contact card: the brand-to-accent bar on top, a 72px round portrait beside name and role (`display: contents` on the body places them on the card's grid) |
| Horizon | a brand band drawn as a `::before` (a background layer would be graded as the words' ground) with the square portrait framed across it |
| Enterprise | leadership rows: a portrait column, uppercase role, the hue rule along the foot |

Every row keeps a ground (the audit's card rule), and a dark card sets its
own local palette so the words it already draws read on it.
`/theme-preview/<id>/team` draws the real team under any theme; all twelve
are clean in both schemes and at 320–414px.

**The hero cannot be switched off.** The client's rule the same day: a
homepage always opens on it. `LOCKED_SECTION` in `themes/options.ts`;
`orderSections` keeps it whatever a stored row says and the console's row
shows "Always" where the others have a checkbox.

## Enterprise, Summit and Horizon — three more technology-company themes, from three references (step 7, 2026-09-17)

The client named three sites and asked for a theme after each, with
pictures from Freepik. What each became, structurally:

**Enterprise (inspirisys.com).** A large IT-services firm: white ground,
the brand's deep steps for the bands, Inter Tight over Inter. No
photographic hero — a **statement band** on `brand-900` with the slider or
the boardroom picture framed beside the words and the four statistics
along its foot as a white strip; then the certifications as an awards
strip, three **showcase cards** with pictures (the first three solutions),
the solutions again as **tabs** with a picture beside a paragraph
(`service-tabs.tsx`, a small client island: every panel rendered and the
inactive ones `hidden`, arrow keys between tabs), the partners, the case
studies as a grid, the posts. Every inner page opens on a navy band with
an accent rule along its foot; the closing band is full-bleed navy with
the buttons on the right. Cards are square with a top rule in the brand
that turns accent on hover; buttons small caps. **The first child theme:
`extends: "classic"`**, so the two-row header with its utility strip and
the footer are inherited and only `Home`, `PageHero` and `CtaBand` are the
folder's — the registry's `LOADERS` now accept a `Partial<ThemeTemplates>`
for exactly this.

**Summit (everestims.com).** A software product company: dark at the top
— a near-black one-row header (Launch's header on the dark ground tokens,
the same measured width gates) and a **centred hero** — on a `brand-900` →
`accent-900` gradient since 2026-09-28 (the client: "other than black"), as is
every inner page's heading band; both steps stay dark in both schemes and are
the gate's `white on brand-900`/`accent-900` pairs — and every tile's name band (a
product's brand and name, a collection's heading) is `brand-900` → `brand-800`
at an angle rather than black, meeting the picture with no seam: the well's
`border-b border-line` is dropped inside a Summit tile — over a plexus
picture at 30% with the kicker as a pill (48px under the header from
`lg`, 40px on a phone — halved on 2026-09-27, the client's ask), the headline, the lede, two
buttons and a row of trust badges (the certifications; this site has no
G2 rating) under them, and the slider framed beneath like a product
screenshot when there is one — then the partners, the statistics as
tiles, the **tabbed catalogue** (solutions, product categories,
industries — the reference's "All products / SMEs / Enterprises";
`catalogue-tabs.tsx`, pill tabs, every panel rendered), the credentials,
the testimonial as a centred quote, and a "book a demo" close on a dark
rounded panel with a brand glow. Space Grotesk over Inter. The dark
ground tokens do not invert, so the top is the same near-black in both
schemes; below it the page's own ground, because an always-dark page
cannot be graded in the light scheme.

**Horizon (i2k2.com).** A hosting and cloud company: white ground with
the palette's secondary and accent as the two "separator" colours, Manrope
over Inter, another child of `classic` — the two-row header and the
**banner hero with the section's picture** are exactly the reference's
inner pages, so only `Home` and `CtaBand` are the folder's. The front page
is the hosting sequence: the slider edge to edge, or the data-centre
picture with the words on an opaque `card` panel over its left half; four
**service cards** with identity icons and "Read more"; the statistics as
a band on `secondary-800`; the client logos; **why choose us** as a bullet
list (the AMC inclusions) with the testimonial under it beside the
engineer picture; two case studies; the credentials; the partners; three
posts; and an **enquiry form on the front page** (`EnquiryForm` compact,
source `home`) above a closing card split by the two separator colours.
Cards carry a bar of the secondary along the foot that turns accent on
hover; section headings carry the two-colour rule under them.

Five Freepik photographs under `public/themes/{enterprise,summit,horizon}/`,
resized to 1800px before they were committed. Every theme lists the
`reviews` section (Site → Settings → Embeds) beside the others.

## Canvas — the client's design document as a palette and a theme (step 8, 2026-09-17)

The client attached `DESIGN-claude.md` — a warm-canvas editorial system:
a tinted cream ground, a serif display face at regular weight with
negative tracking, a humanist sans body, one coral primary reserved for
the buttons and full-bleed callout moments, dark navy "product mockup"
cards alternating with cream feature cards, a dark footer — and said "use
this for design". It is two things here, on the layering the rest of this
file argues for:

**The colours are a palette.** `canvas` in `lib/presets.ts`: background
`#faf9f5`, text `#141413`, primary `#cc785c`, secondary `#252320`, accent
`#e8a55a`, Fraunces (the vendored soft serif) over Inter. Five inputs
through `generate()` like every other preset, so the cream and the coral
pass the same gate (`npm run themes`: 31 palettes, both schemes) and the
palette stands under any theme.

**The structure is a theme.** `canvas`, a child of `classic`: the
document's `hero-band` as a 6-6 grid with the words left and the
`product-mockup-card-dark` right — a dark card with a title bar of labels
holding the site's own NOC drawing or the slider as the "product chrome"
(the document: show real product, not an illustration of one); the
statistics as `badge-pill`s; `feature-card`s three-up on `surface-2` (the
darker cream); the support desk as the dark band (the cream-to-dark rhythm
the document calls the brand's pacing); `model-comparison-card`s for the
product categories on the canvas with a hairline; and the coral
`callout-card` to close, with the inverted canvas-on-coral button. Display
type at **400, never bolder**, is the document's one non-negotiable and is
the theme's CSS, with 12px content cards, 8px buttons and inputs, pill
badges, 96px between bands at desktop, circular portraits on the team
page. Coral appears only where the document allows it: the primary
buttons and the closing band, because the palette's brand fill is what
those already are.

Choose both on the console — the theme on Themes, the palette on Colour
palette — for the page the document describes; either alone is still a
coherent site.

**The two logo strips move differently per theme (2026-09-17), and no two
themes share a motion (2026-09-18).** "Trusted by" and "Certified partner &
deployment experience across" both render through `LogoMarquee`, so the
mechanism is one `mode` on it — `StripMode` — that each theme's Home passes
to `Partners` and `TrustedBy`. Seven modes came first; with nine themes and
two strips each, three of them were carrying three themes apiece, and the
client asked that the same scrolling style not be used across themes. There
are thirteen now. Eight keep something moving by itself: `marquee` (the
strip as it shipped), `drift` (odd and even logos on two rows sliding
opposite ways), `bob` (each logo on a slow sine, a phase behind its
neighbour), `spotlight` (grey and dimmed, a band of the brand colour
sweeping across, full colour under the pointer), `parallax` (two rows the
same way, the back one drawn first, at three-fifths the pace, scaled to .7
about its **left** edge — about its centre the visible metre of a
`w-max` track lands thousands of pixels off-screen — faint and a touch
soft), `lens` (no track: each logo crosses the strip alone, launched at
`100cqw` and gone at `-100%` of itself, so the interpolation puts it dead
centre at the halfway mark where it is largest; the runners follow the
container's width through `@container`, eight down to four), `cascade`
(columns scrolling vertically, neighbours opposite, each column the whole
list started from a different logo — a round-robin split showed one brand
twice in a three-row window — joining as the Container widens, two on a
phone to five on a wide screen) and `ring` (fourteen slots on a regular
polygon's apothem, `tan()` in CSS, turning once in 40s under a 1500px
perspective, the back half hidden by `backface-visibility`). Five lay the
logos out once as a wrapped grid that enters as the section scrolls in:
`rise`, `wipe`, `pulse` (a brand ring passing from logo to logo), `flicker`
(each logo blinks on in `steps()` like a phosphor display while a scanline
crosses the grid once) and `deal` (each dealt in from above, turning eight
degrees as it lands). The grids key their entrance on the `data-aos-animate`
the reveal observer already stamps on the component's root, their hidden
start state is behind `html[data-aos-ready]` like every reveal's, and every
rule sits inside the reduced-motion guard; `lens` and `ring` render the
same wrapped grid as their markup and are positioned only inside that
guard, so a reader who has asked for less motion gets a still grid rather
than half a carousel. The stagger is `--i`, set inline, and the slot's size
travels as `--slot-w`/`--slot-h` for the two that place logos by
arithmetic.

One was tried and dropped: `runway`, the track on a plane tilted away
under a short perspective. At a tilt shallow enough to keep the logos' shape
it read as the plain strip; at one steep enough to read as a road it
sheared HPE and Cisco at the edges into smears, and brands do not lend
their marks to be distorted. Parallax gives the same depth and touches no
logo's shape.

The pairs (partners / clients): classic marquee / flip, editorial cascade /
wipe, datacenter parallax / pulse, launch lens / rise, terminal flicker /
drift, enterprise ring / cascade, summit spotlight / bob, horizon drift /
spotlight, canvas rise / deal — nine distinct partners modes and nine
distinct Trusted-by modes. `scripts/probes/strip-modes.mjs` measures it:
signs in, opens every preview, reads each strip's mode by its caption (on
Horizon the Trusted-by section comes first, which the first cut's
index-based reading got backwards), asks the Web Animations API whether
something is running and samples the moving element twice 400ms apart,
checks the document has not widened, exits non-zero on a repeated mode in
either column, and screenshots each strip. Light, dark and the four phone
widths audited clean on every preview after.

**Sentinel, Vantage and Keystone (2026-09-18) are the three themes built
from the references the client named that day** — eset.com,
technerd.altisinfonet.in ("transparent menu on full width new style
slider") and truenas.com — bringing the set to twelve. Each is a full
theme (no `extends`), each ignores `hero_style` because its page hero is
its own, and each has a footer layout, a strip pair, a display face and a
body face no other theme uses.

- **Sentinel** (eset.com) is near-black at the top on the dark ground
  tokens and on the page's ground below, the Summit rule. Its one device
  is a glowing brand hairline used as a seam — under the header
  (`.sentinel-seam`, a `box-shadow` and a `::after` gradient, so no
  computed colour the audit reads changes), around the two audience cards
  and the product cards (`.sentinel-frame`), across the closing band and
  above the `glow` footer. Display type is set **light**: Outfit at 300 on
  every `display-*` role and 400 on `h2`/`h3`, which no other theme does,
  and the statistics are huge thin numerals. The header is `bg-dark/85`
  under a blur inside a `bg-dark` sticky wrapper, so the audit composites
  it against the ground it is really over. Work Sans for the body; pills.
- **Vantage** (technerd) is the see-through header over the full-bleed
  slider. The pill is sticky with a negative bottom margin the height of
  the bar, so the hero starts under it, and it has two states decided by
  CSS rather than by the component: `[data-theme="vantage"]:has([data-vantage-dark])`
  — an attribute the theme's hero and page hero stamp — puts it in glass
  (a white hairline, an 8% white wash, white type) until the page has
  scrolled 24px (`data-scrolled`, read through `useSyncExternalStore`, so
  nothing is set from an effect); on the shop, which opens on a light
  band, or once scrolled, it is the solid card pill. In the glass state
  the wrapper takes the dark ground at zero height, which is the ground
  the translucent pill is actually over and the ancestor the contrast
  audit walks to. `:has()` on the wrapper means the server renders the
  right state on the first paint. The hero is `Slider` — not `SliderFor`:
  a fan or a stack is a well that sits *in* a page, and the corner notch
  is built on the banner's own controls — with the slide's captions, and
  the site's heading as the page's `h1` spoken rather than shown, because
  a slide's caption is a picture's caption and a page with a slider had no
  `h1` at all until this was measured. The notch is the `Slider`'s
  `sr-only` live-region counter unhidden and given a white plate with a
  slanted clip path, and its two arrow buttons moved into the plate's
  right end (`theme.css`); the dots go. Solutions as photograph cards, a
  split "about" with the statistics, the customer's words on an opaque
  panel over the darkened NOC photograph, the `contact` footer with its
  three plates. Plus Jakarta Sans and Public Sans; the accent ramp carries
  the reference's cyan; two Freepik photographs under
  `public/themes/vantage/`.

  **The hero is the window, exactly, and the ticker sits on it** (the
  client, 2026-09-28). The slider is `h-svh` (360px floor) at every width,
  from the very top of the page: the info bar stays in the flow, is lifted
  over the hero (`z-index: 41`), and the wrapper's negative margin is the
  info bar's height plus its own — zero high in glass, `--h-site-header`
  high once solid — so the page sits in the same place in both states.
  `--h-info-bar` is the bar's one-line height (24px, 27px from `sm`) and 0
  without a bar or once it is closed; the page hero's top padding adds it.
  The first version took the header's height off a wrapper that was
  already zero high: the hero started 72px above the page, painted over
  the info bar (the ticker could not be seen), ended 97–570px short of the
  window's foot, and the page jumped 72px the moment the pill turned solid.
- **Keystone** (truenas.com) is white with the sections inside one
  bordered pill and the two calls beside it. The headline's closing words
  run through a brand-to-accent gradient — `GradientHeading`, whose span
  keeps `color: brand-ink` and puts the gradient in the *fill*
  (`background-clip: text` + `-webkit-text-fill-color: transparent`), so
  the audit reads a solid graded ink and both ends of the run are inks the
  palette gate already pushes to 4.5:1 — over the product shown big in a
  frame that glows (`.keystone-frame`, box-shadow): the slider, or the
  NOC panel. "What is Technoware" is Enterprise's `ServiceTabs` with the
  theme's own `pictures` (the prop added for it) restyled to pill tabs; a
  brand-600 band carries one white card with the credentials and the
  customer's words; the closing card fades from `dark` into `brand-900`.
  Red Hat Display at 700–800, DM Sans; the `plate` footer; two Freepik
  photographs under `public/themes/keystone/`. The `plate` footer
  draws the social row once, on the right under the newsletter pill —
  `Brand` takes `social={false}` there, since it drew the row as well — and
  that column is `max-content`, so the pill never wraps inside its fixed
  40px height (2026-09-28).

**A theme's chrome is a factory call (2026-09-18).** `themes/chrome.tsx` exports `themeChrome({ Header, footer, between })`: the info bar, the header fed the assigned menu or the built-in one, `<main id="main">` under `PageEnter`, the footer fed the assigned columns. Eight `templates/chrome.tsx` files were those twenty lines around a header and a footer layout; each is now one line, Terminal's with `between` for its ticker. Every theme header takes `ThemeHeaderProps`. Classic's chrome stays its own file because it picks the footer per inheriting theme through `footerLayoutFor`. Gated on a snapshot of header, drawer and footer markup on all twelve previews before and after: identical.

**The theme headers share one module (2026-09-18).** Five theme headers
carried the same hundred lines — the section list with its panel hosts,
the utility links with theirs, the drawer's state — differing only in
class strings, a chevron size and where the cart mark sits, and three
more themes were about to copy them. `components/layout/header-parts.tsx`
holds `useHeaderNav()` (the resolved lists, the drawer's state and its
props), `PrimaryNavItems` (the `<li>`s; the caller draws the `<ul>`),
`UtilityLinks` and the three width gates (`ONE_ROW_GATE`, `TERMINAL_GATE`,
`STRIP_GATE`). The five were migrated with a snapshot of every theme's
header and drawer markup taken before and diffed after: byte-identical on
all nine. A theme still writes its own bar — the shape, the ground, the
type on the links — and passes those as props.

**Every theme has its own footer (2026-09-17).** One `layout` on
`SiteFooter` — `FooterLayout`, nine of them — composing the same brand
block, link columns, policy row, signup band and social row differently, so
a footer menu assigned in the console reaches every theme and the landmark
structure holds. Classic keeps `columns`; Editorial is a `masthead` (the
company name set huge across the top over hairline rules, on the page
ground); Datacenter a `console` (mono status line, `›` bullets, mono policy
row); Launch a `card` (one rounded brand-wash card, the policy row outside
it); Terminal a `prompt` (mono, every link printed as a path, the credit
line a prompt); Summit a `statement` (the tagline set large under an accent
rule, on the page ground); Enterprise a `split` (the brand block on a
brand-900 panel beside the columns on the dark band); Horizon `centred`
under a brand-gradient rule; Canvas `cream` (the tagline in the display
serif at 400 over a coral hairline). Three sit on the page ground and use
its inverting tokens; the dark ones keep `dark-*`, which never inverts, and
the split's brand panel takes `text-dark-muted` rather than a `brand-*`
tint that would invert under it. The chrome contract carries `themeId`, so
classic's chrome — inherited by Enterprise, Horizon and Canvas — picks
theirs through `footerLayoutFor()`; the other five pass `layout` in their
own chrome. Rendered on every preview at 1440 and 360: no overflow, no
errors.

## Collections — one anatomy, twelve idioms (2026-09-18)

The client's review: `/store` "is not similar with its parent theme", and
below the hero the Products, Certified, Industries, Web services, Support,
Case studies and Resources sections "are almost similar" across all twelve.
Both were true, and for one reason. Those sections are classic's homepage
components reused by the other eleven themes, and every one of them — and
the seven index pages behind them, the two hubs and the shop's grids — drew
its tiles as hand-rolled `rounded-lg border bg-card` markup with no
`data-card` on it. A theme's CSS reaches only markup that says what it is,
so a theme could change a corner radius and nothing else; the shop, which
said nothing at all, looked identical under every theme. Verified before the
change with a full-page shot of `/store` under Keystone and classic: the
same page.

**`components/ui/collection.tsx` is the fix.** `Collection` is the list
(`<ul data-collection="<kind>" data-cols>`), `Tile` the item — a `Link` (or
a `div`) carrying `data-card data-tile` with named parts: `data-tile-media`
(a picture or an icon well), `data-tile-body`, and inside it `-kicker`,
`-head` (`-icon` beside `-title`, with `-count`), `-summary`, `-meta` and
`-cta`. Every part is a direct child of the body, so an idiom can turn a
column into a row with one `grid-template-columns`. The home sections, the
seven index pages, the hubs and the trust strip use it; the shop's product
cards, which hold buttons and cannot be one link, stamp the same parts on
their own `<article>`; `CertificationCards`, whose portrait does not fit a
4:3 well, stamps them too. The base look is classic's, in a `.public-site
[data-tile]` block in `globals.css`.

**Each theme's `theme.css` then carries an idiom block keyed on
`[data-collection]`** — three attributes, which outranks the base whatever
the import order — and draws the same markup in its own vocabulary:

| theme | idiom |
|---|---|
| classic | the tile grid (the base; no block) |
| editorial | the paper's index: ruled rows, serif names, italic standfirsts, a monochrome plate that colours on hover; the shop as a two-column catalogue |
| datacenter | a rack: numbered units (`U01`, the collection's own counter) on a darker gutter, a mono readout for the summary, a steady green dot per row |
| launch | a bento: twelve columns, the first tile twice the size on the brand wash, pills for counts |
| terminal | `$ ls industries/` — a bordered listing with an index, a dithered plate, `// summary` and `[open]` under the pointer |
| enterprise | proof cards: the square corner and brand rule, and the closing "Learn more" shown in small capitals |
| summit | banded tiles: the head on the non-inverting dark band, the rest on the card |
| horizon | service cards: a colour bar in the tile's own identity hue, a disc for the icon, "Read more" in the secondary ink |
| canvas | the design document's feature cards: flat on the darker cream, serif at 400, the coral text link over a hairline |
| sentinel | glow-outlined panels: the brand hairline and a glow that gathers under the pointer, the light display face |
| vantage | a photo mosaic: a tile with a picture *is* the picture, the words on its foot over a gradient whose lowest stop is opaque dark; a tile without one is a big glyph; the shop stays upright |
| keystone | gradient-edged tiles: a hairline at rest, brand-to-accent under the pointer, drawn as a masked `::after` ring |

Three rules the idioms keep. **Never a card without a ground**: every idiom
keeps a background-image or an opaque colour on the tile, because the audit
fails a `data-card` whose ground is transparent — Editorial's ruled rows
keep a faint card-to-surface gradient for that reason. **The closing link is
real markup**, rendered by every caller and hidden by the base rule;
Enterprise, Horizon and Canvas show it, so what a screen reader and the
audit read is a link and not CSS content. **Keystone's gradient edge is a
pseudo-element**, not a second background layer, because the contrast audit
grades text against every opaque stop of an element's own background and a
`line-strong` border-box layer would have been read as the words' ground.

The counter is CSS (`counter-reset` on the collection, `counter-increment`
on each item), so a numbered idiom numbers by position and nothing stores an
index. The count's parentheses are `::before`/`::after` content, so a chip
idiom drops them. `--tile-hue` is the identity hue of the tile's icon, set
inline, and the base wash mixes it at 9% — `hueForIcon`'s ceiling is 14%.

**The resources hub carries a colour per tile, and every theme states how it
shows it (2026-09-21).** `/resources` was the same grey hub under every theme:
four route tiles and three lists, none passing a hue, so the base wash had
nothing to mix. Now every tile has one — the four routes by *position*
(`neon-8/6/4/5`, the support hub's exception: a set laid out in a fixed order),
a post by its category through the same `tagIndex()` its chips use so the
colour is the one the blog already gave it, a guide by `hueFor(category.slug)`,
a project by `hueForIcon(industry.icon)` — on both the `Tile` and its
`IconTile`, so the wash and the glyph agree; each list's heading has a rule of
the list's lead colour beside it and each row a rule down its left in its own
(`RULED`, a class, so it holds under every idiom). Then one block per
`theme.css` keyed `[data-collection="routes"] [data-tile]`: the classic
family a 14% wash and the hue as the top edge, Editorial and Datacenter the
rule down the left, Terminal an `ls --color` block before the entry name
(generated content), Launch an orb of the colour in the tile's corner over
the card gradient, Summit, Sentinel and Vantage the seam along the top,
Keystone the colour into the accent along its masked edge. **Grounds and
edges only, never a word's colour**: the neon set is graded for a glyph at
3:1, and `npm run audit` grades the words against whatever opaque ground is
under them — which is why Launch's orb keeps the opaque card gradient as
its second layer.

**The team card is a portrait with a colour per person (2026-09-21).** 4:5
rather than 4:3 — people are portraits, and the old well cropped every
head-and-shoulders picture at the chin; the themes that round the photograph
(Launch, Canvas, Vantage) pin `aspect-ratio: 1` themselves, so nothing became
an oval. `--member-hue` is `hueFor(name)` on the card and reaches the
initials tile, a 3px rule between photo and body, and the chips' edges —
every use a class, so a theme's own rule on the same part still wins, and
never the words. The two glyph-only 40px squares became pill links that say
"Email" and "LinkedIn"; the bio clamps at four lines with the whole text in
`title`; a grouped department heading shows its count. The attributes are
unchanged, so every theme's existing rules on `data-team-*` still apply.

**A decorative bar is a pseudo-element, never a background layer wider than
2px (Horizon, 2026-09-21).** Horizon drew its tiles' slate→blue left bar as
a `4px 100%` background layer; the first run of `/resources` under
`SITE_THEME=horizon` reported 42 contrast failures at 1.43:1, every word on
the posts, guides and case-study tiles graded against a bar nothing sits on.
`gradientStops()` drops a layer of 2px or under (Sentinel's seam) and this
one was 4. Widening the audit's threshold would widen a loophole; the bar is
a `::before` now — a box no text is inside — and the theme grades clean on
`/resources` and `/` in both schemes. The theme matrix for `/resources` and
`/team` under all twelve themes is otherwise clean, light and dark.

## A homepage section's Appear (2026-09-27)

Each section row on the Themes screen has an **Appear** select under its
background, and the choice rides in the same row of `site_theme_options`:
`"sections": {"solutions": {"kind": "default", "reveal": "fade-up"}}`.
`ThemeOptions::cleanSections()` keeps it beside what `background()` returns —
`background()` itself is shared with the builder and knows nothing of motion —
and keeps a default-ground row for it alone, as it already did for the
switch. `none` is the homepage's default and stores nothing. `HomeSection`
draws the choice as a `data-aos` wrapper inside `SectionBg`, so all twelve
themes have it without a template changing; the hero never animates and the
closing band has no control. See `docs/motion.md`, "A section's own reveal".

## Editorial: the lead fits the first screen, and the shop's products are cards (2026-09-27)

- **The nameplate is 76px from `sm` (68px on a phone)**, down from 112px, and the
  lead slider from `lg` is `max(360px, min(21:9 of the width, 100svh - 216px))`:
  216px is the info bar (reserved whether it shows or not), the dateline strip,
  the nameplate and the rail. Measured: the slider's dots are inside the
  viewport at 1280×720, 1440×800, 1707×937, 1920×960 and 2560×1300. At 112px
  and a pure 21:9 the dots sat below the fold on every one of them.
- **The shop's products are bordered cards, not ruled rows.** The index idiom
  (no edge, a ground a shade off the page, a 132px monochrome plate) left each
  product as text floating between hairlines, the picture half hidden under the
  Sale badge and the heart. `[data-collection="products"]` now gets a 1px border
  that darkens under the pointer, 20px padding (16px on a phone), a 1.25rem gap,
  and a 168px square picture in colour (112px on a phone). Square corners and the
  serif type keep it Editorial; the other collections keep the ruled index.

## Datacenter and Terminal: the shop's pictures are 168px and the heart is a button (2026-09-27)

- Both themes draw products as rack/listing rows, where a 64–76px thumbnail
  carried the Sale badge and the heart over most of it. `[data-collection="products"]`
  now gets a 168px picture (the inner well keeps its 4:3), in colour on Terminal
  too — a price needs to show what it prices; the page listings stay grey.
- **The heart moves into the row of buttons.** `ProductCard` renders a second
  `WishlistHeart` inside `[data-tile-actions]`, wrapped in
  `[data-tile-save-inline]` and `hidden` by default; the card heart carries
  `data-tile-save`. A theme that wants it in the row shows the inline one and
  sets the corner one to `display: none` — both read the one wishlist store,
  and `display: none` keeps a keyboard and a screen reader to exactly one.
  Classic and every other theme are unchanged.
- **On a phone the row stacks**: the picture at the column's full width on top,
  the words and the three buttons under it. Beside the words, three buttons left
  Add to cart 45px at 390 and nothing at 320.
- Terminal's header drops its `[ engineer ]` CTA below 360px: at 320 it pushed
  the menu button 8px off the screen (`audit:mobile` named it). The drawer
  carries contact.

## Full rows on the homepage (2026-09-28)

A homepage tile section never ends on a half-empty row, in any theme (the client, 2026-09-28: Horizon's two case studies sat in a grid of four): the six home `Collection`s pass `fill` (`data-fill="rows"`) and `components/ui/full-rows.tsx`, mounted beside `Reveal`, measures where the items landed (layout offsets, so a reveal's transform does not count) on every change of the grid's own box — a short last row under a full one is marked `data-row-cut` and hidden, a list shorter than one row gets `repeat(n)` columns inline. Measured because the columns are Collection's breakpoints *and* the themes' overrides (Datacenter's two, Launch's twelve-column bento). Never on an index page, which shows everything; without JavaScript the section is the whole selection. `scripts/probes/full-rows.mjs` checks twelve themes at four widths.

## Canvas in solid colour (2026-09-28)

Canvas's cards are solid colour (the client, 2026-09-28, chosen from three rendered options over a navy and a single-brand version): every collection tile (not the shop's products, not the resources routes) and the front page's hand-rolled cards (`data-canvas-fill`) turn through brand, accent and secondary at 600 and then 900, six to a cycle; each fill brings its own ink — the palette's `-on` on a 600, `dark-ink` on a 900 — set as a local palette (`ink`, `ink-2`, `muted`, `faint`, the coloured inks and the hairlines all become it), with `--color-card` left alone so an icon keeps its pale disc. The four statistics under the hero are Google's four colours in order, from `--color-g-*-fill`/`-on` in `globals.css` (Google's product shades with the ink each needs; yellow takes near-black). A card on a fill is never `bg-card` in the markup, or the card-ground gradient paints over it. The words under a heading are softer than it — the same hue's 100 step on a 600 fill (pale in light, dark in dark, so it softens in the right direction in both) and `dark-muted` on a 900 — and every heading sits on a solid Google-colour chip (`--color-g-*-fill` with its `-on`), paired with the fill so blue never sits on blue.
