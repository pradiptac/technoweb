# Menus

Four locations, record references not URLs, the flat builder, rebuild.

Moved out of `CLAUDE.md` on 2026-09-14, verbatim and in the order they were
written. Each note is a rule and the measurement behind it; the one-line
form of every rule is still in `CLAUDE.md` under "Modules". Add a new
note here **and** its one-line rule there.

**The site's own index pages are a target type, because they are not
records.** Every other `MenuItemType` resolves a row and gets a stable URL for
free. `/blog`, `/products` and `/support` are Next routes with nothing behind
them, so before `MenuItemType::Section` the only way to put one in a menu was a
**custom link** — free text, pattern-checked for *shape*, so `/blogs` saves
happily and 404s in the header of every page. Seven of the eight header links
are index pages, so building the real navigation meant typing thirty URLs by
hand. `App\Support\SiteSection` is the allowlist; the path is resolved at
render, so a route that moves is one line there rather than an unknown number
of menu rows. **A CMS page is not in it** — it is already a `page` target, and
listing it twice would make one page two different things a menu can point at.

**A section stores no morph, and that is not tidiness.** `target_type` stays
null: `enforceMorphMap` throws for an alias it does not know, and `section` is
not a model, so writing it there because every other case does would throw the
moment anything touched the relation. The key lives in its own `target_key`
column rather than in `url`, which means "a URL somebody typed" for a custom
link — one column, one meaning.

**`technoware:seed-menus` exists because the first screen was the obstacle.**
The menu module shipped complete and sat unused with `Menu::count()` at zero:
`/admin/menus` opens empty, and assigning a menu **replaces** the built-in
navigation wholesale, so taking editorial control meant rebuilding ~30 items
correctly in one sitting with a sitewide header as the blast radius. The
command writes what the site renders today — verified link-for-link, 55 links
with none lost and none gained — so the editor's first act is a small edit
rather than a rebuild. **Unassigned unless `--assign`**, the
`technoware:landing-pages` shape.

**What a seeded footer costs: three columns stop tracking the catalogue.**
Solutions, product categories and services are *generated* on every render, so
publishing a new solution puts it in the footer with nothing else happening. A
menu is a list somebody wrote: renaming a record still follows it, but a newly
published one will not appear. That is the trade of editorial control rather
than a defect, and the command prints it when it assigns.

**A menu is cached for 600s, so edit it in the console and not in the
database.** `publicApi.menu()` is `revalidate: 600`, tagged `menus`. A direct
`UPDATE` on a row does not reach the site, which cost three false readings
while this was being built — the same trap the note above about public
settings describes, and the same one the chatbot's kill switch has. Worth
knowing alongside it: the dev fetch cache lives in **`.next/cache/turbopack`**,
not `fetch-cache`, so deleting the latter clears nothing.

**The menu builder's rows wrap, and the screen had never been audited.** A row
is a handle, a label, up to three badges and six buttons — 493px of content in
a 320px viewport, measured at 183px of horizontal scroll. It survived because
the audit finds record screens by opening an index and taking the first row,
and with no menus in the database there was no row to take. Same shape as the
chat panel being audited only while closed: **a screen that needs a record to
exist is unaudited until one does.**

**A menu item resolves its icon and summary from the record too, not just its
href.** `MenuTree` had always resolved the URL — its docblock explains why — and
read `icon` and `description` from the menu item's own columns, which nothing
fills: `technoware:seed-menus` writes a reference and a label, and an editor
building a menu is naming a navigation entry rather than re-describing a
solution. So **assigning a menu silently stripped the icon and the summary from
every item in the mega panel**, two of the three things it draws, turning the
header into a plain list of links on every page of the site.

The split is the point: an icon and a summary are facts about the *record*; the
label is a decision about the *menu*. The item's own value still wins where it
has one, and it is `?:` not `??`, so a blank override falls through rather than
beating a good value.

Nothing could have caught it. The audits check contrast, headings, overflow and
structured data; none counts icons, and every link still went to the right
place. `MenuIconTest` pins it now, and reverting the fallback fails exactly two
of its four.

**A menu item stores a record reference, never a URL.** `menu_items` holds
`(target_type, target_id)` and resolves `/solutions/<current slug>` when it is
rendered; only a `custom` item has a `url` of its own. A stored URL rots the
first time somebody fixes a typo in a slug — and the navigation is on *every
page*, so that is a sitewide 404 caused by an edit made on a screen nobody
associates with menus. Same failure `RepathsLandingPages` exists for, avoided
by not storing the derived value at all. `MenuTest` pins it: rename a solution,
and the menu follows without anything touching the menu.

**Menus nest three deep, and the cap that went was a *rendering* cap.** It used
to stop at two, refused with a 422 whose sentence was the real argument: "both
places a menu can appear render two levels, so anything under this would be
saved and never shown." Raising the number alone would have made that sentence
false rather than obsolete, so the renderers were taught first — the mega panel
draws an indented rule-marked sub-list per level, the mobile drawer recurses
with an indent, and a footer column nests the same way.

**`MAX_DEPTH` is now the only limit, and it is a decision about navigation.**
Nothing below it is capped: `Menu::tree()`, `MenuTree` and all three renderers
recurse without one, so a deeper tree written straight to the database still
renders in full. Raising the constant is the whole of raising the limit — there
is no second place, which is what `test_the_public_tree_returns_every_level`
pins by writing five levels past a cap of three.

**One query, joined up in PHP.** `Menu::tree()` fetches every item at once and
sets each `children` relation by hand, because `->with('roots.children.target')`
is a depth written as a query: each level is another clause, so a fixed chain is
a fixed ceiling in a second place. `MenuTree` and `MenuItemResource` recurse
through `relationLoaded`/`whenLoaded` unchanged.

**Validation generates its rules to the depth submitted.** Laravel validates
nested arrays through wildcards and a wildcard is written per level, so a fixed
rule set would be a second ceiling — the payload is measured first, and the
constant is the only thing that refuses.

**The builder's indent stops at six levels and then shows the number.**
`depth * 28px` at nineteen is 532px of margin, which pushes a row clean off a
320px screen — and that screen has already been fixed once for overflowing.

**A menu is written wholesale, which is why it needs no cycle check.** The
console submits the tree it drew and `MenuController::syncItems()` reads
`parent_id` and `sort_order` off the *shape* of the payload rather than
trusting them in it — so a loop is not refused, it is unrepresentable in a
nested array. `Location` needs `wouldCycle()` because it is edited one row at a
time by `parent_id`, which is exactly where a loop can be written. `MenuItem`
carries a comment saying so, because the absence looks like an oversight.

**An unassigned location is a 404, not an empty menu.** `/menus/{location}`
answers 404 when nothing is assigned and the frontend falls back to `mainNav`
and the CMS-driven mega panels — so an install that never opens the menu screen
renders exactly what it renders today, and switching over is an editorial act
rather than a deploy. Same shape as the homepage hero, where an absent slider
leaves the NOC panel in place. An assigned-but-*empty* menu is a real answer and
comes back as `[]`; the frontend still falls back for it, because a header with
no links in it is indistinguishable from a broken site.

**An item whose record is gone is dropped, never rendered dead.**
`resolveUrl()` returns null when the record was deleted or lost its slug.
Emitting it anyway puts a link to `/solutions/` in the site header; emitting it
without an href puts an inert word in a navigation bar, which reads as a broken
page rather than a missing entry. The console shows those as **Broken** for the
same reason — otherwise a dead entry looks identical to a live one until
somebody notices the header is short.

**The builder is a flat list with a depth per row, not a nested drag target.**
Nesting the DOM means a drop zone inside a drop zone — the defect the media
library had to be fixed for, where both handlers fire — and it makes every drag
answer "before, after or inside?" from a pointer position, which is the part of
a hand-rolled tree that is wrong on the diagonal. One list plus an integer makes
reordering and re-parenting the same operation; `nest()` converts once, at save.
It is what WordPress does, for the same reasons. **Depth is clamped on every
change** rather than at each call site, so drag, delete and move can all be
careless about it and still leave a list `nest()` can read. Every row also
carries Up/Down/Indent/Outdent buttons: this console is gated on audits that
fail an interface a keyboard cannot drive, and dragging is never the only way.

**There are four menu locations, and one of them renders one level.** The top
bar (the dark strip above the header) and the footer's bottom row joined
`primary` and `footer`, and `MenuLocation` is still the only list — adding each
was one case plus a renderer, and the console's dropdown and its "Where menus
appear" cards both picked them up with nothing else changed. The cases are in
**page order, top to bottom**, because that list is drawn as cards an editor
reads down.

**The bottom bar is flat deliberately, and `depth()` says so.** It shares its
line with the credit line and the scheme toggle and has nowhere to put a
dropdown. `getBottomBarNav` **drops children rather than recursing** — so the
decision lives in the getter instead of being made again in the renderer — and
`hint()` says it in words, because the depth a location renders is not
something an editor can see until they have built something it silently
ignores. The three that nest answer `MenuRequest::MAX_DEPTH` rather than a
literal 3, or that constant would have a second home and the one nobody
remembers to raise.

**A top-bar item with children opens a tabbed panel, and the top bar used to
be counted flat too.** The argument was the same as the bottom bar's — a 38px
strip beside a search field has nowhere to put a dropdown — and it held until
somebody built a "Customer Zone" with a link under it and saw nothing, because
the strip has no room but the panel *beneath* it does: that is how a large
vendor's utility bar works. `components/layout/top-bar-panel.tsx` reads the
item's children as the tabs down the left and *their* children as the cards
beside them, the three levels `MAX_DEPTH` already allows; a tab is a real link
that switches the pane on hover and on focus and is followed on click. **A
panel whose tabs have nothing under them has no tab column** — its second level
*is* the cards — because three tabs each switching to an empty pane is the
worst reading of a list an editor nested one deep. It opens and closes through
`PANEL_CLASSES`, exported from `mega-menu.tsx` so the two panels share one
hover / focus-within / `data-closed` contract, and it is anchored `right-0`
because its host sits at the viewport's right edge. It is painted in the
`--color-dark-*` band tokens, so it reads as the strip unfolding; the icon
tiles keep mixing against `--color-card`, because an identity hue is
contrast-checked for the scheme's light surfaces and not for a near-black chip.
`scripts/probes/top-bar-panel.mjs` measures all of it, polling the computed
`visibility` to a bound rather than sampling once — under `next dev` the 140ms
exit was observed landing anywhere between 200 and 500ms.

**A custom item with no address is a heading, and it needs items under it.**
"For home" in a customer-zone panel goes nowhere; neither does a footer column
title. The URL rule refused `#` and the "needs an address" check refused blank,
so a heading could not be built at all — the tabs had to be pointed at some
page, which put a link where a label belonged. `#` is admitted and stored as
null, so a heading has one representation; `MenuItem::isHeading()` is how
`MenuTree` tells it from an item whose record has gone (still dropped), and it
is sent with **`href: null`** — the one null the frontend expects on a `NavNode`.
A heading over *nothing* is still refused, because an inert word in a
navigation bar reads as a broken link. Every renderer draws it as what it is:
a `<button>` that opens its panel in the two bars (focusable, so a keyboard
still gets the panel; `Link` cannot take a null href and an `<a>` without one
is not focusable), a `<button>` tab in `TopBarPanel`, a label over its list in
the mega menu, the drawer and the footer, and dropped from the bottom bar,
which renders no children. `navKey()` in `lib/nav-key.ts` is the key for lists
and lookups that used to be the href; `MenuTest` pins all three rules.

**The drawer keeps a panel-bearing item whatever its href.** It filters
`/portal/login` and `/contact` out of the top bar's links because it already
offers both as buttons, and that filter dropped a "Customer Zone" pointing at
the login page together with the three tabs and nine links beneath it — the
whole panel gone from every phone to avoid printing one link twice. An item
with `items` is kept; its tree renders through `DrawerItems`, indented under it.

**And it is kept as a heading, with the buttons' links pruned from under it.**
The client's tree — Customer Zone → /portal/login, with a "Customer login"
tab → /portal/login and Track a ticket beneath that — put Customer login on a
phone three times: the button, the bar item, the tab. A panel-bearing bar
item whose own href is one of the two buttons renders as a heading (the panel
is the thing; its title needs no link the button already is), and
`pruneOffered()` drops any link in the tree the buttons offer and hoists its
children into its place — hoisted, not kept as a heading, because a heading
reading "Customer login" over one link is still the repeat. The indent was
wrong too: a nested list started 12px in from its parent *row*, while the
parent's label sat 38px in behind its tile, so a child's text was 26px left
of its parent's and read as a sibling. Every first-level row reserves the
28px tile box and a nested list starts at `ml-[38px]`, under the label.

**The top bar's panel is one width whatever it holds.** It was `w-max`: two
cards opened 700px, the next tab's one card shrank it to 420, and a bar item
with a single link opened a sliver. `TopBarPanel` is a fixed
`min(760px, 100vw - 2rem)`, the cards sit in two equal columns however many
there are, and only the height follows the count — measured at 760px on both
tabs of the client's menu.

**And it follows the menu style, and each theme restyles it (2026-09-17).**
The client saw that one 760px tabbed sheet on every theme and under every
`menu_style`, beside a mega menu that followed both. `TopBarPanel` now takes
the same `MenuPanelStyle` every header already passes to `MegaMenu`, and it
gives four shapes on the same items: `simple` is a 300px list with each tab
as a small group label over its own links (no tiles, no summaries, no
state); `semi` is 520px with the tabs as a row of pills across the top and
the cards in one column; `mega` is the sheet above; `big` has the tab strip across the top and is exactly as wide as its
widest tab's cards — the client's "maximum of the menu's own size"
(2026-09-18) after seeing it open to a fixed 1100px over two cards. Every
tab's pane is rendered and the inactive ones sit invisible at zero height
in the same grid cell, so the widest pane sets the width once and
switching tabs changes only the height; each card is a 260px slot that
wraps at the viewport. Measured: 544px over two cards on either tab. The panel
stamps `data-topbar-style`, and every theme's `theme.css` carries a block
under `[data-theme] [data-panel="topbar"]` — Editorial square in an ink
hairline with italic display tabs marked by a rule, Datacenter a brand rule
and mono uppercase tabs with a caret, Launch the page's light tokens in a
24px pill card with a filled brand tab, Summit an accent rule down the left
and small-caps tabs, Enterprise near-square under a 3px brand rule, Horizon
a three-hue gradient rule (a pseudo-element, since `border-image` ignores a
radius), Canvas on the cream inside a coral hairline with serif tabs.
Terminal had re-tokened it since it shipped. Measured on every preview:
each panel the shape its theme's style asks for, in view, no errors.

**A bar's chrome is not its navigation, and an assigned menu must not be able
to delete it.** The top bar keeps the phone number, the email address and the
search form; the bottom row keeps the copyright line and the scheme toggle.
Only the link lists come from a menu — the same division `getPrimaryNav`
already makes, where an assigned menu replaces the links and leaves the
consultation button and the menu toggle alone. A menu that owned the search
field would be a menu that could remove the only search on the site.

**The top bar's links appear twice and only one copy is the bar.** The mobile
drawer carries them too — without it Knowledge base and Track a ticket are
unreachable on a phone — so both read one resolved list. The drawer **filters
out `/portal/login` and `/contact`**, because it already offers those as a
`ButtonLink` pair, and rendering the whole bar underneath would print Customer
login twice on every phone. Its glyphs resolve from `iconMap` **by name**, so a
configured menu keeps them: a component in the fallback and a lookup for the
menu would be two code paths for one icon, and the unexercised one is the one
that breaks. An unknown name renders no icon rather than throwing, the rule the
mega panel follows.

**All but the last link is hidden below `sm`**, which is what that bar already
did with three hard-coded links and is now a rule rather than three class
lists. Keeping the *last* visible rather than the first is deliberate: an
editor puts the thing they most want pressed at the end of a utility bar.

**Two exhaustive-over-two ternaries were silently wrong the moment there were
four.** `DefaultMenu::rebuild()` read `$kind === 'footer' ? footer : primary`,
so a top bar rebuilt to the header's four mega-panel parents inside a 38px
strip; and the controller read `$where === Footer ? 'Footer navigation' :
'Primary navigation'`, so a top bar created from nothing was named "Primary
navigation" and `technoware:seed-menus` would then have collided with it. Both
are a `match` and a `defaultName()` now. `SeedMenus` had the same shape a third
time in a literal `['Primary navigation', 'Footer navigation']` used for the
existence check *and* `--force`, which would have left the new menus outside
both — creating a second top bar on every run and reporting success.

**`saveMenuAction` called `updateTag("settings")` under a comment about the
navigation being on every page.** The menu fetch is tagged `menus`, so saving a
menu invalidated the site settings and left the menu cached for the full 600s —
and `revalidatePath("/", "layout")` beside it made it worse rather than better,
because the re-render re-read the same stale fetch entry. An editor saved,
looked at the site, and saw the old navigation. `deleteMenuAction` had the same
wrong tag, where it matters more: deleting the *assigned* menu is what falls the
site back to the built-in navigation, so the header went on rendering a menu
that no longer existed. Exactly the shape of `admin_path` spelled with the
API's resource names — two hand-written strings that have to agree, with
nothing checking them across the wire.

**The bottom bar's default points at the policy *pages*, not their URLs.**
Privacy and Terms both hold placeholder copy awaiting a legal review, which
makes them the two pages on this site most likely to be renamed — and a stored
`/privacy` would be a 404 in the footer of every page, written from a screen
nobody associates with the footer. The sitemap is the one custom link, because
it is a route handler emitting XML and there is no record to point at. Its
`sort_order` is **counted from the rows actually written** rather than
hardcoded to 2: with one page absent a literal puts two items at one position,
and MySQL is free to order equal rows differently between two reads.

**Verifying this needed a *discriminating* test, and the obvious one is
vacuous.** `technoware:seed-menus` and the Rebuild button write the navigation
the site already renders — deliberately, so assigning a menu changes nothing
visible — which means asserting the rendered bar matches the expected links
passes identically whether the menu is being read or ignored. The probe renamed
an item through the console instead, which is what fires the Server Action and
therefore the tag, and asserted the *new* label on the public page. That is how
the wrong tag was found. Two of its own first-run failures were bad scoping
rather than bugs: `Knowledge base` and `Customer login` legitimately appear in
the footer's Support column, so a page-wide count measured the wrong element —
and the walk up from `#header-q` to the bar stopped on the input itself,
because the input's class is `bg-dark-2` and `"bg-dark-2".includes("bg-dark")`
is true, which then made "the built-in label is gone" pass against an empty
list. `classList.contains`, not a substring.

**Menus were in the Phase 1 schema and unused for months.** `menus` and
`menu_items` were provisioned with the original 30 tables and nothing was ever
built on them, while the header's links stayed hard-coded in `content/site.ts`.
The migration that made them usable is an **alter**, not a second pair of
tables — a duplicate would have collided on a fresh database, which is exactly
how it was found: the first `migrate` failed on a table that already existed.

**"Open in a new tab" reaches every renderer through one helper.** The API
has always sent `new_tab`, and `toLink` (the footer's mapper) carried it —
but `toItem`, which builds the `MenuItem` the mega menu, the top bar's panel
and the drawer's nested rows all render, dropped it, so a ticked box worked
in the footer and nowhere else: the client's Webmail link opened in place.
`MenuItem.newTab` is set now and the three renderers apply
`newTabAttrs()` from `lib/nav-key.ts` (client-safe, where `navKey` lives),
which is `target="_blank"` with `rel="noopener noreferrer"` or nothing — one
helper so `rel` cannot be left off one of the four.

**A section whose page has nothing on it is not linked (2026-09-17).** The
client asked where the team page was linked from, and the answer was
"nowhere in the footer you assigned": the seeded footer's Company column
never carried Our team, Clients and Certifications, which the built-in
footer has had since they shipped. They are in `DefaultMenu` now and were
inserted into the live menu after About us. The rule that came with the
question — "add the page link if there is content" — is
`SiteSection::hasContent()`: a `section` item pointing at `team`,
`clients`, `certifications`, `careers`, `case_studies` or `blog` is
**dropped at render** by `MenuTree` when the page's own query (published
members, live certifications, open vacancies, published posts) finds
nothing, the way an item whose record was deleted is, and comes back by
itself the day the first row is published. Only pages that are lists of
records that can genuinely be empty; the catalogue, the shop and the fixed
pages are always linked. Memoised on the container per request rather
than in a `static` (the `Setting::get()` reasoning: a static survives from
one test's application to the next), with `forgetContent()` for a test
that publishes and re-reads. `MenuTest` pins it: no team members, no link;
a draft member, still no link; a published one, linked.

**The footer's columns are live lists, not copies (2026-09-20).** The seeded
footer wrote Solutions, Products and Web services as rows — seven each,
"the generated columns, frozen into a list" — so from the day a footer menu
was assigned a newly published solution appeared everywhere but the footer,
and the open item read "decide deliberately, per install". The decision is a
new item type instead: `catalogue` stores a key (`solutions`, `services`,
`industries`, `product_categories`; `App\Support\CatalogueList` is the
allowlist, `meta.catalogues` the options) and `MenuTree` expands it at render
into what is published and `show_in_menu` at that moment — the same query the
mega menu's `?in_menu=1` runs, so header and footer cannot disagree. The
item's label is the column heading and its href the index page; an empty
list drops the item whole; nothing may be nested under one (a 422 on
`children`, and the builder caps the next row's depth). The rebuild writes
three of them; a hand-picked seven is still a valid column. `MenuTest` pins
all of it, including that a solution unticked from the menu leaves the
column on the next read.

**Services open to their categories, and a service category is a menu
target** (the client, 2026-09-29). The header's panel was "Web Services" over
every service in one list, the label a leftover from when the section held
only the six web services. It is **Services → each service category → its
services** now, the grouping the Services section's tabs use
(`lib/service-groups.ts` is the one rule): a category is an entry with its
icon and description, linking to its own tab at `/services#<slug>`, its
services the plain list under it, and the uncategorised last under an "Other
services" heading. With one group or none the panel is the flat list it was.

Both paths draw it. The built-in navigation groups in `getMegaMenu()`. An
assigned menu stores it as records: `service_category` is a `MenuItemType`
whose URL is the tab, and only while the category is switched on — off, the
row and the services under it drop out like a deleted record's. `DefaultMenu`
writes the three levels on a rebuild (`MenuTest` pins it), within
`MAX_DEPTH`. **An install that already has a menu keeps the old flat list
until somebody presses Rebuild** on Site → Menus or regroups it by hand: a
menu is an editor's, and nothing rewrites one on update.

`MegaMenu` drew a three-level panel wrongly the first time it was asked to:
every entry's row carried `h-full`, which stretched the row to the grid
cell's height and pushed the list under it out through the panel's foot. An
entry with children no longer takes it.

**A row below the first carries a small glyph in its identity hue** — a
service under its category, in the panel and in the drawer — through
`MenuItem.glyph`, rendered on the server beside the tile and the drawer icon
(`IdentityIcon` at 16px, the hues already graded for both schemes). The first
level keeps its tile; a tile at every level reads as three grids.

**The top bar has a fifth panel, `columns`, and badges ride on every menu
(0.150.0, the client's reference — a customer-zone menu with a thin brand line
along the top, a small uppercase heading over each column and, under it, bold
titles with a status chip and a line of muted description).** The shape is
`components/layout/top-bar-columns.tsx`: each first-level child of a top-bar
link is a column — its label the uppercase, letter-spaced, muted heading (a
link when it has an address, a plain label when it is a heading), its children
the items, each a bold title, an outlined chip beside it and the summary under,
at most three lines; a child with no children of its own is an item in a
leading column with no heading. No icons, no cards, no tabs, everything visible
at once. Columns are a fixed 240px, at most four to a row, so the panel is
`min(count × 240 + gaps + padding, 100vw − 2rem)` wide — 832px for three — and
wraps past that; the top edge is `border-t-brand-600`, a token. Every theme's
`theme.css` states the line in its own idiom under
`[data-panel="topbar"][data-topbar-style="columns"]` (Editorial a double rule,
Terminal a double rule and `#` before each heading, Datacenter mono headings,
Horizon its three-hue rule, and so on).

**It is not a sixth `menu_style`; it is `topbar_style` (`match` | `columns`),
a theme option of its own.** `menu_style` drives the header's mega menu *and* the
top bar's panel, so adding `columns` to it would have given the mega menu a
fifth shape it has no layout for, and an install that chose `big` for its header
would have lost the choice for its top bar. `match` — the default, and what every
stored row resolves to — leaves the panel following the menu style exactly as
before; `columns` overrides it for the top bar alone. It is chosen on **Site →
Themes → Options for … → Top bar panel**, checked for shape by
`ThemeOptions::clean()` like every choice id, and resolved by `resolveOptions()`
(an unknown id is `match`). It reaches `TopBarPanel` through
`TopBarStyleProvider` (`components/layout/topbar-style.tsx`), mounted by
`themeChrome()` and classic's chrome around the header: a prop would have been
eleven edits through nine headers that each already pass `menuStyle` to two
panels, for a value one component reads.

**A badge is `menu_items.badge` (plain text, 12 characters) and `badge_tone`
(`live`, `beta`, `soon`, `new`, default `new`).** Stored as typed and upper-cased
by CSS, so "Beta" and "BETA" are one thing on the page; a blank is no badge and
the public tree sends `badge_tone: null` beside a null badge. `MenuRequest`
refuses a long badge or an unknown tone at the nested path
(`items.0.children.1.badge_tone`), `MenuItem::BADGE_TONES` is the one list, and
the builder's item panel has a text box and a tone select. It is drawn by
`MenuBadge` — an outlined chip, text and border one colour, transparent ground,
12px — inside the columns panel, every other top-bar panel shape, the mega menu
(every style, sub-items too) and the mobile drawer.

**The tones are tokens, and the top bar's ground is a setting, so its chips
cannot use the status tokens.** On a light panel (the mega menu, the drawer, the
five themes whose top-bar panel is a light card) live → `--color-ok`, beta →
`--color-tag-5` (the violet identity token, graded against the card, in preference to
`--color-info`, which is a blue), soon → `--color-muted`, new →
`--color-brand-ink`. `--color-ok` is chosen for the scheme's panels; the top bar
is the dark band or whatever colour `theme_topbar` is, in both schemes. So
`badgeInks(band, brandHue)` in `lib/palette.ts` derives
`--color-topbar-live/beta/new` per bar, each walked to 4.5:1 on the bar's raised
step (`bar2`, the lightest ground a chip sits on), SOON using the band's own
`muted`; `themeVars()` emits them beside the other five topbar tokens and
`globals.css` carries the default bar's. A theme that re-tokens its top-bar panel
to the page's tokens (Canvas, Keystone, Launch, Terminal, Vantage) re-tokens the
three chip inks in the same block — otherwise a light card would carry inks
graded for a dark one. Measured for four bars (default, navy in dark, navy in
light, cream): 6.0–9.1 : 1.
`scripts/probes/topbar-columns.mjs` is the browser half (not yet run).
