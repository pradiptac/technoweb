# Help, tours, Simple view and empty states

0.168.0, the "simple to use" release of the 2.0 roadmap. Four pieces that let a
new member of staff find out how a screen works without leaving it. Spec:
`docs/superpowers/specs/2026-10-12-simple-to-use-design.md`.

## The help drawer

**The help is the manual, built at commit time, never read at run time.**
`web/scripts/build-help.mjs` splits every `manual/NN-*.md` chapter at its `##`
headings into sections — `{id: "<stem>#<slug>", chapter, chapterTitle, title,
html, text}` — and writes `web/src/content/help.json`, which is committed. The
release staging copy has no `manual/` beside the website, and a run-time read
would be a file system call on a request path.

- `npm run help` regenerates it. `node scripts/build-help.mjs --check` exits 1
  when the committed file differs from what the manual would produce, and
  `release/build.mjs` runs it before the web build, so **a manual edited
  without regenerating the help cannot ship** (`release/RELEASING.md` step 3).
- **The converter escapes everything before it adds any markup**
  (`scripts/help-convert.mjs`): raw HTML in the manual arrives as text, and a
  link is kept only when it is `https://`, a site path, an anchor, or another
  chapter (`17-users-and-roles.md#…`, which becomes a `data-help-link` the
  drawer opens in place). That is what makes the drawer's
  `dangerouslySetInnerHTML` safe. It handles exactly what the manual uses:
  `###`/`####`, paragraphs, lists with one level of nesting (a blank line
  between numbered items keeps one list), tables, fenced code, quotes, bold,
  italic, inline code. `scripts/help-convert.check.mjs` is its fixture
  self-check — add a case when you widen it.
- **Which sections a screen shows is `web/src/lib/help-routes.ts`.**
  `HELP_ROUTES` patterns take `*` for one segment (a ticket's reference, an
  order number) and the most literal match wins — the sidebar's longest-match
  rule. A screen nobody listed falls back to its area's chapter
  (`CHAPTER_FOR_PREFIX`), so every screen shows something.
  `scripts/help-routes.check.mjs` (`node --experimental-strip-types`) fails
  when an id there is not in `help.json`: **a renamed manual heading is a
  failed check, not an empty drawer.** Rename the id in the routes in the same
  commit.
- **The manual never enters a page's JavaScript.** `GET /api/admin/help`
  (a Next route handler, staff only — 401 without the session, `no-store`)
  answers `?path=` (the screen's sections, its tour, its chapter), `?q=` (up
  to 20 sections, every word, title matches first, a 160-character excerpt),
  `?section=` and `?chapter=`.
- **The drawer** is `components/admin/help-drawer.tsx`: `Modal` with
  `size="side"` (a full-height sheet sliding from the right — `translate`, the
  v4 trap — keeping the dialog's focus trap and Escape). The "?" button is in
  the console bar from `sm`; **below `sm` the bar has no room** (it overflowed
  31px at 360–414), so the account menu carries "Help for this screen" there
  (`AccountItem.event` / `phoneOnly`). The `?` key opens it unless focus is in a
  field, where it types a question mark. `tw:help` on `window` opens it from
  anywhere (detail `{section?}`). Content loads when it opens; a failure says
  so with Retry. Not in the portal — customers have the knowledge base.

## Guided tours

- `web/src/lib/tours.ts` holds six tours — dashboard, tickets, builder,
  media, settings, portal — each a `match(path, search)` and steps whose
  **`target` is a CSS selector**: an existing stable hook where the screen had
  one (`[data-hero-band]`, `form.admin-filters`, the tick column,
  `aria-keyshortcuts`), a `data-tour` attribute where it had none. Changing
  the markup a selector names silently drops that step, so search `tours.ts`
  before renaming one of those hooks.
- **A step whose target is missing or not visible is skipped**: a role
  without the control, an empty list, a closed panel (the builder's steps wait
  for the Builder tab; Settings' first tab has no switch). A tour with nothing
  visible does not start.
- `components/ui/tour.tsx`, mounted by the console and portal layouts in a
  `Suspense`. It starts once per browser (`tw_tour:<id>` = `done` in
  `localStorage`; a storage that throws counts as seen) from 768px wide,
  **only once its first step's target is on screen**, then **after the
  screen has filled in** — every target present, or the count still for two
  seconds, at most eight — because the dashboard streams its panels after its
  shell (the first cut started at 1.2s and found 3 of 5 steps). The first-step
  rule is what keeps the builder's tour from starting, and being used up, on
  the Content tab: it starts when the Builder tab is opened, URL or click.
  It never starts over an open dialog. "Take the tour" in the help drawer
  replays it (`tw:tour-start`).
- Each step finds its target again when shown and is passed over if it has
  gone; another screen ends the tour unmarked (adjusted during render, keyed
  on path and query); while a dialog is open over it (the palette) the tour
  leaves Escape and Tab alone, and `?` does not open the drawer over a tour.
- One fixed frame with a huge shadow dims the page around the target; the
  card sits below it or above. **Nothing moves between steps** — Next and Back
  must feel instant; the card fades in once (`.tour-card`, inside the
  reduced-motion guard). Focus is on the card and trapped in it; Escape skips;
  Done or Skip hands focus back.
- **An automated browser gets no auto-started tour** (`navigator.webdriver`)
  unless `localStorage.tw_tour_force` = `1`, so the audits and every probe
  measure the screen, not a card laid over it. `scripts/probes/tours.mjs` sets
  it.

## Simple view

- A switch at the end of an entity form's tab strip hides its **SEO, AEO and
  custom-field tabs**. `buildFormTabs` marks them (`TabDef.advanced`: ids
  `seo`/`aeo`, or a group holding `custom_fields` — never the form builder's
  own "Fields" tab). Only forms built with `buildFormTabs` have it: the
  settings screen has a tab whose id is `seo` and must not lose it.
- Per browser, `tw_console_simple` = `1`, written by `setConsoleSimple()`
  (`lib/console-prefs.ts`) and stamped on `<html data-console-simple>` by the
  root layout's pre-paint script, like density.
- **The hiding is CSS on that attribute** (`globals.css`), so the strip never
  flashes the tabs before hydration, and it never hides the open tab
  (`?tab=seo` keeps SEO) or one holding a validation error (`data-has-error`)
  — a 422 on a hidden tab still badges it and opens it. **Panels stay
  mounted**, so a save never drops a hidden tab's fields.
- `scripts/probes/simple-view.mjs`.

## Empty states

- `components/admin/empty-list-action.tsx`, passed to `EmptyState`'s `action`
  on every console list: **"Clear filters"** (to the bare index) when filters
  or a search hid everything, **"Add the first …"** when the list is truly
  empty and the screen has a `new` route, nothing otherwise. A list nobody
  creates by hand (the activity log, leads, orders, submissions) says what
  will appear there in its sentence instead.
- A page's `filtered` is its own filter and search params — never `page`,
  `per_page`, `sort` or `dir`.
