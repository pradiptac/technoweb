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

**The stat tile is a raised card.** `bg-card shadow-2`, edged in its tone,
with the tone's `*-soft` wash moved into the icon disc. The figure counts
through `CountUp`, which leaves a non-number alone. The prop API did not
change, so every caller got the new tile.

**The Activity panel reads two existing endpoints.** An administrator gets
`GET /admin/activity?per_page=8`; anyone else on the dashboard (the desk)
gets the eight newest tickets. A failure leaves the panel out. It is a
`WIDGETS` key, so it can be hidden and reordered like the rest;
`dashboard-view.mjs` counts eight panels.

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
