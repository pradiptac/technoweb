# Simple to use (0.168.0) — design

Status: approved in conversation on 2026-10-12. This is item A2 of the 2.0
roadmap, after Console 2.0 (0.166.0) and Portal 2.0 (0.167.0).

## Intent

The client's motto is that the CMS is "simple to use and smart". New staff
and demo audiences should be able to find out how a screen works without
leaving it, be walked through the screens they meet first, see less of a
form until they need it, and never land on an empty list with nowhere to go.

**Chosen by the client:**
- all four pieces: help drawer, tours, Simple view, empty states
- tours on key screens only
- Simple view defaults to Advanced, switched per person
- help built from the manual, not read at runtime

**Success means:**
- every console screen's "?" shows relevant manual text
- six screens have a tour that runs once and can be replayed
- an editor can hide SEO, AEO and custom fields with one switch, without
  losing a save or a validation error
- every console list says what to do when it is empty
- no audit regresses: light, dark, phone widths, CSP, console errors
- no new npm dependency

## 1. The help drawer (console only)

**Source.** `web/scripts/build-help.mjs` reads `manual/*.md` and splits each
chapter at every `##` into sections. Each section is
`{id, chapter, chapterTitle, title, html, text}`:
- `id` is `<chapter file stem>#<slugified heading>`, for example
  `08-tickets#the-ticket-queue`.
- `html` is a converter's output for exactly what the manual uses:
  - `###` and `####` headings
  - paragraphs
  - `-` and `1.` lists, one level of nesting
  - GitHub-style tables
  - `**bold**`, `*italic*` and inline code
  - fenced code blocks
  - `[text](url)` links
  - `>` quotes
- Text is HTML-escaped before markup is applied. Links are kept only when
  they are `https://`, a site-relative path, or `#`; anything else becomes
  plain text.
- A link to another manual chapter (`17-users-and-roles.md#…`) becomes a
  help link that the drawer opens in place.
- `text` is the plain text, for search.

Output goes to `web/src/content/help.json`, which is committed.

- **`npm run help`** regenerates it.
- **`npm run help -- --check`** exits non-zero when the committed file
  differs from what the manual would produce. It joins the checklist in
  `release/RELEASING.md` and `release/build.mjs` runs it before building, so a
  stale help file cannot ship.

**Mapping.** `web/src/lib/help-routes.ts`:
- **`HELP_ROUTES`** is a list of `{ prefix: string; sections: string[] }`.
  The longest matching prefix wins, the sidebar's rule.
- **`CHAPTER_FOR_SECTION`** maps a sidebar section id to a chapter stem, as
  the fallback for a screen with no entry. For example tickets → `08-tickets`,
  store → `07-store`, site → `15-appearance`, system → `18-settings`.
- **`helpFor(path)`** returns the sections, falling back to the chapter's
  first three sections.
- A unit self-check (run with `node --experimental-strip-types`) asserts that
  every id in `HELP_ROUTES` exists in `help.json`, so a renamed heading fails
  the check instead of showing an empty drawer.

**Delivery.** A route handler reads the JSON on the server, so the manual
never enters a page's JavaScript:
- **`GET /api/admin/help?path=/admin/tickets`** returns this screen's
  sections, plus `tour` (the id of a tour for this screen, if any) and
  `chapter` (stem and title).
- **`GET /api/admin/help?q=word`** returns up to 20 sections matching the
  words (every word in the title or text, case-insensitive, title matches
  first), each with a 160-character excerpt.
- **`GET /api/admin/help?section=<id>`** returns one section, for links
  inside the drawer.
- The handler answers 401 without a staff session (the `tw_admin_session`
  cookie, checked with `getCurrentStaff()`). It sends `Cache-Control: no-store`.

**The drawer.**
- **Opening:** a "?" button in the console top bar (`aria-label="Help for this
  screen"`, also shortcut `?` when focus is not in a field) opens a right-hand
  sheet. It uses the existing modal component (`components/ui/modal.tsx`),
  which gains a `side` variant: a full-height panel of `min(28rem, 100vw)`
  sliding from the right. That keeps the dialog's focus trap, Escape and
  inert page.
- **Contents:** the screen's sections, rendered with the existing `Prose`
  styles. A search box sits at the top; typing replaces the list with
  results, and clearing it brings the screen's sections back.
- **Footer:** "Take the tour" when the screen has one, and "Open this chapter",
  which lists that chapter's sections in the drawer.
- **Links:** inside the drawer, a link to another section opens that section
  in place, with a Back button. External links open in a new tab.
- **Loading:** content loads when the drawer opens, with a skeleton
  meanwhile. A failure says "Help could not be loaded." and offers Retry.

## 2. Guided tours

**Steps.** `web/src/lib/tours.ts` exports
`TOURS: Record<string, { match: (path: string) => boolean; steps: TourStep[] }>`.
`TourStep` is `{ target: string; title: string; body: string }`, where
`target` is the value of a `data-tour` attribute. There are six tours:

| Tour | Screen | Steps |
|---|---|---|
| `dashboard` | `/admin` | the hero band · the "at a glance" tiles · Customise · the search (Ctrl/⌘ K) |
| `tickets` | `/admin/tickets` | the filters · a ticket row · the selection bar's checkbox · Table view |
| `builder` | `/admin/pages/{id}` with `?tab=builder` or the Builder tab open | Add a section · a section card · its Style panel · the live preview · Save |
| `media` | `/admin/media` | Upload · a file · the Edit button |
| `settings` | `/admin/settings` | the tabs · a switch · Save |
| `portal` | `/portal` | the quick actions · the tiles · Need help? |

The `data-tour` attributes are added to the elements those steps name.

**Behaviour** (`components/ui/tour.tsx`, a client island mounted by the
console and portal layouts):
- **When it starts:** on the first visit to a screen whose tour has not been
  seen in this browser (`localStorage` `tw_tour:<id>` = `done`), from 768px
  wide, 1.2s after the page settles. It never starts while a dialog is open.
- **The highlight:** each step dims the page with one fixed overlay whose
  cut-out frames the target (a large `box-shadow` on a positioned frame), and
  shows a card beside the target: below it, or above it when there is no
  room.
  - The card holds the step count, the title, the body, Back, Next or Done,
    and "Skip tour".
  - It scrolls the target into view (`block: "center"`).
- **Movement:** the frame and the card move between steps with no animation;
  the tour is driven by the keyboard and pointer, and stays instant. The card
  fades in once, at the start, inside the reduced-motion guard.
- **Focus:** it moves to the card on each step and is trapped inside it.
  Escape skips. Done or Skip writes `done` and hands focus back to where it
  was.
- **Missing targets:** a step whose target is absent or not visible (a role
  without that control, an empty list) is skipped silently. A tour with no
  visible step does not start.
- **Replay:** the help drawer's "Take the tour" starts it again, whatever the
  stored value.

## 3. Simple view

- **Where:** the `Tabs` component (`components/admin/tabs.tsx`) used by the
  entity forms. A switch, "Simple view", appears in the tab strip's row when
  any tab is advanced.
- **Remembered:** per browser, `localStorage` `tw_console_simple` = `1`,
  stamped before paint on `<html data-console-simple>` by the root layout's
  script, like density. Default off.
- **Advanced tabs**, defined once in `Tabs` (`isAdvanced(tab)`):
  - `id === "seo"`
  - `id === "aeo"`
  - a tab whose `fields` include `"custom_fields"`
- **Shown regardless:** in Simple view an advanced tab is hidden unless it
  holds a validation error (the badge count from `form-tabs`) or is the
  active tab. Opening with `?tab=seo` keeps SEO visible.
- **Saving:** panels stay mounted exactly as today, so a save never drops a
  hidden tab's fields.
- **Implementation:** a class on the hidden tab button (the `hidden` class,
  not the attribute, per the Tailwind v4 preflight rule), decided at render
  from the stored preference through a `useSyncExternalStore` hook in
  `lib/console-prefs.ts` (`useConsoleSimple`/`setConsoleSimple`).

## 4. Empty states

- **Index screens:** every console index screen whose `EmptyState` has no
  action gets one.
  - **No filters:** "Add the first …" (a `ButtonLink` to that screen's `/new`
    route) when the screen has one, and the signed-in role can reach it. The
    route is already gated by `requireScreen`, so a role that cannot open it
    never sees the list.
  - **Filters or search active:** the title becomes "Nothing matches" and the
    action is "Clear filters", a link to the bare index path.
  - **Nothing to create** (activity log, client errors, chat conversations,
    unanswered questions, form submissions, event registrations, comments,
    leads): no button, and a sentence saying what will appear and when.
- **Copy:** sentence case, active voice, naming the thing. "Add the first
  vacancy", never "Create new".
- **Detail screens:** empty states inside them are left as they are.

## Files

**New:**
- `web/scripts/build-help.mjs`
- `web/src/content/help.json`
- `web/src/lib/help-routes.ts`
- `web/src/app/api/admin/help/route.ts`
- `web/src/components/admin/help-drawer.tsx`
- `web/src/lib/tours.ts`
- `web/src/components/ui/tour.tsx`
- probes `web/scripts/probes/{help-drawer,tours,simple-view}.mjs`
- `docs/help-and-tours.md` and its CLAUDE.md lines

**Changed:**
- `components/ui/modal.tsx` (the `side` variant)
- the console layout (the "?" button and tour mount) and the portal layout
  (tour mount)
- `components/admin/tabs.tsx`
- `lib/console-prefs.ts`
- the root pre-paint script
- the elements that carry `data-tour`
- about 45 console index pages (empty states)
- `web/package.json` (`help` script)
- `release/RELEASING.md` (the help check)
- VERSION.md and `lib/version.ts`; the 0.168.0 notes also cover the Themes
  row layout and the assistant header colour committed since 0.167.0

## Testing

- **Converter self-check:** a fixture string covering every supported
  construct and escaping (`<script>`, `javascript:` links), compared with
  expected HTML.
- **Routes self-check:** every `HELP_ROUTES` id exists.
- **`npm run help -- --check`** passes.
- **Probes:**
  - `help-drawer.mjs`:
    - "?" opens the drawer and focus moves into it
    - `/admin/tickets` shows "The ticket queue"
    - a search finds a section
    - an internal link opens in place and Back returns
    - Escape closes the drawer and focus returns to the button
    - the help route answers 401 without a session
  - `tours.mjs`:
    - the dashboard tour starts on the first visit and not the second
    - Next and Back move through the steps
    - Skip stores the tour as done
    - "Take the tour" replays it
    - a step with a missing target is skipped
    - nothing starts at 390px wide
  - `simple-view.mjs`:
    - the switch hides SEO and AEO on a blog post form and persists
    - a save with a missing title still shows its error
    - `?tab=seo` still shows SEO
    - switching off restores the tabs
- **Audits:** `npm run audit` (light, dark, admin and portal) and
  `npm run audit:mobile` stay clean; the audit never opens the drawer or a
  tour, so the probes check them.

## Out of scope

- Tours on other screens.
- Help in the portal: customers keep the knowledge base.
- Translating the manual.
- Help text written separately from the manual.
- A server-side record of who has seen which tour.
