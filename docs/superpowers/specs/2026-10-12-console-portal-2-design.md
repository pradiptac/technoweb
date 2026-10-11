# Console & Portal 2.0 — design

Status: approved in conversation on 2026-10-12. Releases: **0.166.0** (console shell and dashboard) and **0.167.0** (portal). This is the first item of the 2.0 roadmap, Track A: look and feel first.

## Intent

**What the user said:**
- The console "looks plain in a demo" and "feels static".
- The dashboard needs to be "more polished and attractive".
- The customer portal should be "attractive".

The audience is corporate buyers watching a demo, plus the staff and customers who use these screens every day.

**Not problems, so out of scope:** finding screens, information density, the sidebar's structure.

**Success means:**
- Both areas look modern and brand-lit in the first 30 seconds of a demo.
- Everyday motion is crisp and never tiring.
- No audit regresses: contrast (light and dark), overflow at 320–414, one `h1`, tap targets, CSP and console errors.
- The console's JavaScript grows by no more than about 3KB gzipped.

## Decisions

| Question | Answer |
|---|---|
| Visual direction | **Brand-lit.** The customer's theme colour leads: a glass top bar, a dashboard hero band washed in the brand gradient, raised cards and live charts. Every white-label install's console carries its own colours. |
| Sidebar | **Labelled and collapsible.** The same sections and accordion, redrawn with identity icons, a sliding active pill and count badges. Folds to a 64px rail with hover and focus flyouts; the choice is remembered. |
| Portal home | **Welcome hero plus live tiles.** The company name, quick actions, four live tiles, one activity timeline and a help card. |
| Motion | **Crisp, with signature moments.** Everyday motion at 150–250ms. Expressive entrances on the dashboard and portal home only, once per session. Per-person Full or Subtle. The command palette stays unanimated. |
| Build approach | **Shared shell pieces** in `components/app-shell/`, wired into the existing layouts. No switch between old and new. |

## 1. Shell components: `web/src/components/app-shell/`

| Component | Purpose | Notes |
|---|---|---|
| `TopBar` | A glass sticky bar with slots: brand on the left, actions on the right. | `bg-card/80` with `backdrop-blur`. The bottom hairline appears only after the page has scrolled (a 1px sentinel watched by an `IntersectionObserver` in a small client island). Height `h-13` as today. |
| `AccountMenu` | An avatar disc with initials, plus name, roles or company, Profile, View site and Sign out. | A real `<button aria-expanded>` and popover; Escape closes it and focus returns to the button. It replaces the loose name, View site and Sign out controls, which also frees room at 320px. Sign out stays a `<form action>`. |
| `SideNav` | Navigation for both areas. The console uses accordion sections; the portal a flat list. | Takes the rows `renderNav()` / `portalLinks()` already build, with the icon as rendered JSX. It is a client component importing glyphs from `icons-ui` only. The sliding active pill is one absolutely positioned element moved by `translate` (Tailwind v4 trap: transition `translate`, not `transform`). Count badges come from data the layout already has. Folding is described below. |
| `HeroBand` | A brand gradient wash with a greeting, a summary line and quick actions. | Uses the non-inverting dark-band tokens (`bg-dark` → `brand-900`/`accent-900` stops, the first stop opaque so the audit can grade it). Text is `text-white` or `dark-muted`. A mesh layer drifts once and then rests; it sits on a sibling element so it never becomes an ancestor of the text. |
| `MetricTile` | A raised tile with an icon disc, a figure, a label, a sparkline and a delta. | Wraps the existing `StatTile` API (`spark`, `delta`) so callers do not change. The figure counts up once through `components/ui/count-up.tsx`. A tile with an `href` is a whole-tile link. |
| `ActivityFeed` | A vertical timeline: dot, line, verb, subject link, relative time. | Server-rendered list. Dates come from `lib/dates.ts` (en-IN, so the server and client agree). |

**Folding the sidebar** (console only)
- **Storage:** a cookie `tw_console_nav=rail`, read by the root layout's script before paint and stamped as `html[data-console-nav="rail"]`. This is the same mechanism as `tw_console_density`, so the page never jumps.
- **Flyouts:** while folded, hovering **or focusing** a rail icon opens that section's flyout; Escape closes it. Every icon has an accessible name.
- **Phone width:** below `lg` the existing drawer behaviour is unchanged.

**Unchanged:**
- **Access:** `requireScreen`, `renderNav` role filtering and `AdminNavRolesTest`.
- **Rows and tools:** the `nav-items.tsx` rows and the `nav-match.ts` longest-match rule; `TableView`, `CommandPalette`, `SchemeToggle`, `NewSincePoller`, `ToastProvider`, `AlertsAsToastsProvider`.
- **Content and footer:** `<main id="main">` and the footer credit line.

## 2. Console dashboard (0.166.0)

**Layout from the top:**
1. `HeroBand`
2. the "At a glance" `MetricTile` row
3. the existing widgets, restyled
4. a new **Activity** widget

**The hero band**
- **Greeting:** "Good morning / afternoon / evening, <first name>", from the time in IST, worked out on the server.
- **Summary:** one sentence built only from figures the role's dashboard response already holds, for example "4 tickets due today · 12 new leads · 3 orders to ship". A figure the role's answer does not include is never mentioned. With nothing to report: "All quiet. Nothing is waiting on you."
- **Quick actions:** up to three, chosen per role from existing `nav-items` rows: support → Queue and Overdue tickets (`/admin/tickets?overdue=1`); sales → Leads; store → Orders; content → New page and Media; admin → a mix.

**The tiles and widgets**
- **Tiles:** the existing glance tiles become `MetricTile`s, with sparklines from `metrics.volume`, `leads.series` and the like, and deltas from `previous`. Missing data means no sparkline, never a zero line.
- **Widget surfaces:** every panel gets one surface (`bg-card`, `--shadow-2`, a title row with an icon disc) through a `Panel` wrapper inside `app-shell`. The chart internals are unchanged; they already animate.
- **The Activity widget:**
  - It is added to `WIDGETS` in `lib/dashboard-view.ts`, so it can be hidden or reordered and is stored in the same cookie.
  - Administrators see the latest eight activity-log entries.
  - Other roles see the latest new tickets and replies their role can see.
  - It reads existing endpoints only: administrators `GET /admin/activity?per_page=8`; support roles `GET /admin/tickets?sort=created&dir=desc&per_page=8`; any other role sees the widget left out. No new API.

**Unchanged:** `?volume=` period links, the per-account order cookie, `DashboardSkeleton`, and the phone layout (one column, the hero's actions wrapping).

## 3. Customer portal (0.167.0)

**The layout** (`portal/(app)/layout.tsx`)
- `TopBar` with the website's logo (`Logo` with the settings logo), the push bell (the current condition stays) and `AccountMenu`. "Back to site" and Sign out move inside the menu.
- The "Support portal" heading goes. Every portal page keeps exactly one `h1`; pages titled with `h2` under the old layout heading (docs/downloads.md) are promoted, and the audit confirms it.
- `SideNav` in flat mode with count badges (open tickets, orders on the way), from the summary the layout loads.
- The "View as" banner stays on top.
- `motionAttrs` and `lookAttrs` stay: the portal keeps following the site's motion and look settings.

**The home page** (`portal/(app)/page.tsx`): one `Promise.all` over existing reads (`getTicketSummary`, `getTickets`, `getMyOrders`, visits, meetings, wishlist). Each read has its own `.catch` returning empty, so one failure drops one tile and does not take the page down.

- **Hero:**
  - "Hello <first name>", plus the company when set.
  - One status line, in this order of preference: the next confirmed visit or meeting, else the latest order status, else "How can we help today?".
  - Quick actions: Raise a ticket (always); Book a visit (only when `visits_enabled`); Book a meeting (only when `meetings_enabled`).
- **Four live tiles, each a link.** A tile with nothing to show is left out rather than showing 0:
  - open tickets, with "N awaiting you"
  - orders on the way
  - the next appointment
  - wishlist price drops
- **Activity timeline:** up to ten events (ticket replies, order status changes, visits and meetings), merged and sorted on the server.
- **Help card:** a knowledge-base search (a plain GET to `/knowledge-base?q=`) and up to five articles from the existing public read.
- **A brand-new customer** with no activity gets an illustrated empty state ("Here's what you can do") with the same quick actions.

**Other portal pages:** list rows, the order and ticket detail headers and forms take on the new surfaces. The ticket chat thread, `Stepper` and `OrderTimeline` are unchanged.

## 4. Motion

**Console:** one CSS block in `globals.css`, scoped to `[data-console]` and outside `@layer`, as the existing area rules are. Existing tokens only (`--duration-fast/base/slow`, `--ease-brand`, `--ease-exit`).

| Interaction | Motion |
|---|---|
| Press on a `.btn` or row action | `scale(.97)` over `--duration-fast` |
| Side nav and tab active pill | `translate` over `--duration-base` with `--ease-brand` |
| Route change | A 160ms opacity crossfade through the existing `PageEnter` view-transition path (the console gets a `fade` page id) |
| Table rows | Fade plus 6px rise, 40ms stagger, first 12 rows, first load of a screen only |
| Skeleton to content | Crossfade |
| Dashboard and portal home entrance | Hero wash → tiles rise (40ms stagger) → figures count → charts draw. About 900ms, once per session (a `sessionStorage` flag), full page loads only |
| Command palette, keyboard-initiated actions | **None** (the client's ruling; and the Emil rule: keyboard actions are never animated) |

**Full / Subtle:** a per-staff choice on Profile. A cookie `tw_console_motion=subtle`, read before paint, stamped as `html[data-console-motion="subtle"]`. Subtle keeps opacity changes and drops all movement. `prefers-reduced-motion: reduce` implies Subtle. Any hidden start state lives only inside `prefers-reduced-motion: no-preference`.

**Portal:** keeps following the site's `motion_*` settings (the stamped wrapper). The home entrance uses the same sequence as the dashboard.

## 5. Surfaces, accessibility, errors

- **Tokens only, no hex.** Every palette and both schemes work because everything is a token.
- **Card ground:** every card keeps a ground.
- **Glass bar:** its text is graded against `--color-card`.
- **Hero band:** text uses the non-inverting dark tokens.
- **Accessibility:**
  - one `h1` per page
  - real buttons with `aria-expanded`
  - flyouts reachable by keyboard
  - badges carry screen-reader text ("4 open")
  - visible focus rings
  - targets of 24px or more at 320px
- **Hydration:** greetings and relative times are computed on the server, and client relative times use `lib/dates.ts`, so the first render matches.
- **Errors:** a failed read drops its tile, line or widget. The hero falls back to "Welcome back, <name>". Nothing raw reaches the screen.

## 6. Files

**New:**
- `web/src/components/app-shell/{top-bar,account-menu,side-nav,hero-band,metric-tile,activity-feed,panel}.tsx`
- probes `web/scripts/probes/{console-shell,portal-home}.mjs`
- `docs/console-portal.md` (the module note) and its CLAUDE.md lines

**Changed:**
- `app/admin/(app)/{layout,admin-nav,page,metrics}.tsx`, `lib/dashboard-view.ts`, the profile screen (motion choice)
- the root layout's pre-paint script (two cookies)
- `app/portal/(app)/{layout,portal-nav,page}.tsx`, portal page titles
- `globals.css`
- VERSION.md and `lib/version.ts`
- `mock-api.mjs` only if the activity widget's existing reads are missing from the mock

## 7. Testing

- **API:** `php artisan test` and `composer analyse` (no API change is planned).
- **Type and lint:** `npx tsc --noEmit` and `npm run lint`.
- **Audits:**
  - `npm run audit` in light and dark, with admin and portal credentials, over every console and portal route
  - `npm run audit:mobile` at 320, 360, 390 and 414
- **Probes:**
  - `console-shell.mjs`: the fold persists across a reload with no jump; a flyout opens on keyboard focus and closes on Escape; the pill's `translate` sampled mid-flight differs from its start and end; Subtle stops `translate`.
  - `portal-home.mjs`: the seeded customer sees tiles and the timeline; a throwaway new customer sees the empty state; a feature switched off hides its quick action.
- **Performance:** `npm run perf` against `npm run start`, comparing console JavaScript bytes before and after (no more than about 3KB gzipped added).
- **By eye:** every theme × light and dark × 360, 768, 1280 and 1920 for the dashboard and portal home.

## Out of scope

- Guided tours and the help drawer (A2, next release).
- Lottie and 3D.
- New themes.
- Any change to the sidebar's structure, nav rows or role gating.
- Animation for the command palette.
