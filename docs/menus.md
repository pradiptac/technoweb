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
