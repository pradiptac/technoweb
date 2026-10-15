# The console and portal shell (Console 2.0)

0.166.0 (console) and 0.167.0 (portal). Spec:
`docs/superpowers/specs/2026-10-12-console-portal-2-design.md`. The pieces
both areas share live in `web/src/components/app-shell/`.

## What is where

| Piece | File | Used by |
|---|---|---|
| Glass top bar | `app-shell/top-bar.tsx` (+ `top-bar-edge.tsx`) | both layouts |
| Account menu | `app-shell/account-menu.tsx` | both layouts |
| Nav row look and the sliding pill | `app-shell/nav-classes.ts`, `app-shell/nav-pill.tsx` | `admin-nav.tsx`, `portal-nav.tsx` |
| Hero band | `app-shell/hero-band.tsx` | dashboard, portal home |
| Entrance | `app-shell/entrance.tsx` | dashboard, portal home |
| Panel surface | `app-shell/panel.tsx` | dashboard panels |
| Activity timeline | `app-shell/activity-feed.tsx` | dashboard, portal home |
| Fold and motion preferences | `lib/console-prefs.ts` | sidebar, Profile |

## Rules

**The fold and motion choices are `localStorage`, stamped before paint.**
`tw_console_nav=rail` and `tw_console_motion=subtle`, read by the root
layout's blocking script exactly as `tw_console_density` is, and written by
`lib/console-prefs.ts`. A folded sidebar therefore never paints expanded
first. Nothing server-side needs them, so they are not cookies. Change the
keys in both places together.

**The active row keeps its own fill except while the pill moves.** The pill
is one absolutely positioned element behind the rows, moved with the
`translate` property (Tailwind v4: transition `translate`, never
`transform`). The rows drop their fill only while `data-moving` is on the
list, which the pill sets on `transitionrun` and clears on
`transitionend`/`transitioncancel`. The contrast audit reads a text's
ancestors, and the pill is a sibling, so with a permanently transparent row
the resting active row graded 1.06:1 (white on the card). It is measured by
`usePillBox()`. A row that is not rendered (a shut section, the folded rail)
has no `offsetParent`, so there is no pill and the row's own fill stands.

**The rail is CSS, from `lg` only.** `html[data-console-nav="rail"]` narrows
`[data-console-grid]` to 64px. Each label (`.rail-label`) is visually
hidden, not removed, so it stays the row's accessible name. Do not add an
`aria-label` to the rows: it would override the new-items badge's
"N new". Each section's `[data-flyout]` is rendered only while folded and
shown on `:hover` **and** `:focus-within`; Escape blurs. Below `lg` the
sidebar is the drawer, and folding means nothing there.

**The hero band uses only non-inverting tokens.** `brand-900 → accent-900`
with white text, because `npm run themes` checks white on both stops for
every palette, and nothing else. `dark-muted` is gated on `dark` only, so it
is not used here. The drifting wash is a sibling layer and never an ancestor
of the words. The band's title is a `<p>`; the page keeps its own `h1`.
`text-brand-900` on `bg-white` is the primary action (non-inverting both
ways); its hover dims rather than taking `brand-50`, which inverts.

**The entrance runs once per session, decided before paint.** The root
script stamps `html[data-entrance]` on a full load of `/admin` or `/portal`
while `tw_entrance_console` / `tw_entrance_portal` is absent from
`sessionStorage`. `<Entrance>` sets the key and clears the attribute after
1.4s. Stamping after hydration would paint the page, blank it and fade it
back in. The keyframes are `from`-only and live inside the no-preference
guard. Tiles take part through `data-entrance-item` and `--i`.

**The console has its own motion, and the palette is not in it.** One block
in `globals.css` scoped to `[data-console]`, using the existing tokens:
- press `scale(.97)`
- the route fade (`PageEnter` under `data-motion-page="fade"`, 160ms)
- the first 12 table rows arriving with a 40ms stagger, `from`-only, once
  per insertion

Subtle keeps opacity and drops movement. The public `motion_*` settings
never reach the console. The command palette and keyboard actions are never
animated.

**The stat tile counts only plain figures.** `lib/countable.ts`: a count or a percentage, ungrouped or grouped in threes. A price, an "x of y", a timing or an Indian-grouped figure is shown as it is — `CountUp` regroups in threes, so `₹1,23,456` would have been left as `₹123,456` (review, 2026-10-12).

**The stat tile is a raised card.** `bg-card shadow-2`, edged in its tone,
with the tone's `*-soft` wash moved into the icon disc. The figure counts
through `CountUp`, which leaves a non-number alone. The prop API did not
change, so every caller got the new tile.

**The Activity panel reads two existing endpoints.** An administrator gets
`GET /admin/activity?per_page=8`; anyone else on the dashboard (the desk)
gets the eight newest tickets. A failure leaves the panel out. It is a
`WIDGETS` key, so it can be hidden and reordered like the rest;
`dashboard-view.mjs` counts eight panels.

**"AI Powered" sits in the version chip (0.169.0, the client's ask).** A pill
after the version — a sparkle and the words — in `.ai-badge` (globals.css):
a `brand-50` → `accent-50` wash under gradient ink (`brand-ink` →
`accent-ink`, the stops the audit grades), and one light sweep when the
console loads and on hovering the logo, drawn by `::after` so the ground the
audit reads never moves. Inside the reduced-motion guard; Subtle drops the
sweep. From `sm` with the chip; `IconSparkle` lives in `icons-ui.tsx`.

## The portal (0.167.0)

**The portal's bar is the console's, with the site's own logo.** The "Support
portal" heading is gone. Every portal page names itself with its own `h1`
(the twelve `display-3` titles were promoted from `h2`), and headings under
it moved up a level with them: a ticket's subject in the list, "Conversation",
and the downloads list (`headingLevel={2}`).

**Each read on the home page fails on its own.** The `.catch()` is inside the
`Promise.all`, so a refused read (meetings switched off answers 403) drops one
tile and never the page.

**A tile with nothing to show is left out, never drawn as a zero.** The tiles
take as many columns as there are (`--tiles`), so a row is never half empty.
One or two tiles lie on their side from `lg`, the icon beside the figure.
Below `lg` the grid is two across, and an odd last tile spans the row. A
customer with nothing at all gets one "Here's what you can do" empty state.

**The hero's buttons follow the switches.** "Book a visit" shows only with
`visits_enabled` on and "Book a meeting" only with `meetings_enabled` on.
"Raise a ticket" always shows. The visible greeting is the band's; the page's
`h1` is a visually hidden "Dashboard".

**The clock is read outside the component.** `soonest()` lives at module
level because `react-hooks/purity` refuses `Date.now()` in a component body.

**The account menu's icons come from the server.** `AccountItem.icon` is
rendered in each layout from `@/components/icons` and passed in as an
element, because a client import of that module ships the whole map.

**`npm run audit` covers the portal when `PORTAL_LOGIN_EMAIL` and
`PORTAL_LOGIN_PASSWORD` are set.** It signs in through the portal's own form
and audits nine signed-in routes. Until 0.167.0 nothing checked the portal's
contrast.

## Probes

- `web/scripts/probes/console-shell.mjs` checks:
  - the account menu
  - fold and reload, with no expanded first frame
  - the keyboard flyout
  - the pill sampled every frame
  - Subtle
  - the hero band and one `h1`
  - no overflow at 360 and 1280
  - the Activity panel
- `web/scripts/probes/portal-home.mjs` covers the portal (0.167.0).

## Saved on the button, a badge that pops (0.171.0)

**"Saved ✓"**
- **The signal.** The toast provider dispatches `window` `tw:saved` on every `ok` toast and remembers the moment (`lastOkToastAt()`).
- **Which bar takes it.** `FormActions` keeps the time of the last submit **at module scope**, not in the component: a create redirects to the record's edit screen, and that screen's bar is a new instance.
- **When it shows.** For 1.6s on the submit button, when an `ok` toast arrives within 15s of a submit, or arrived less than 3s before the bar mounted. The second case exists because the redirected screen's toast can fire before its bar starts listening.
- **How it draws.** DOM only, as a `[data-saved]` overlay with the button's own background, because a `Button`'s label is a bare text node.
- The toast is still what announces it.

**The badge pop.** `NewBadge` in `admin-nav.tsx` sets `data-bumped` for 400ms when a poll raises a queue's count. It never fires on first render, and not under Subtle.

**Under Subtle** the console drops the arrow nudge, the switch spring, the tick-box pop and the copy, refused-field and Saved animations. Colour and ring feedback stay.

**The AI badge** is drawn from `lg`. Drawn from `sm`, it pushed the bar 95px past a 768px screen.
