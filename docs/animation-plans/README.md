# Animation plans

Written by `improve-animations plan` on 2026-09-20 from the seven rows of
[`../animation-audit-2026-09-20.md`](../animation-audit-2026-09-20.md). Each plan is
self-contained: an executor with no other context can carry it out. Kept
under `docs/` because that is where this repository keeps every document.

| # | Plan | Severity | Status |
|---|---|---|---|
| 001 | [FAQ `<details>` opens and closes](001-faq-details-transition.md) | MEDIUM | DONE |
| 002 | [Inline `Alert` arrives and leaves](002-alert-arrival.md) | MEDIUM | DONE |
| 003 | [`.btn` press feedback](003-button-press.md) | MEDIUM | DONE |
| 004 | [Search listboxes grow from the input](004-search-listbox.md) | LOW | DONE |
| 005 | [Drawer accordion unfolds](005-drawer-accordion.md) | MEDIUM | DONE |
| 006 | [Bottom surfaces enter and leave through the edge](006-bottom-surfaces.md) | LOW | DONE |
| 007 | [Tab panels crossfade](007-tab-panels.md) | LOW | DONE |

## Order and dependencies

1. **000 — shared pieces first** (part of 002): the `usePresence` hook at
   `web/src/lib/hooks/use-presence.ts` and the three arrival classes in
   `web/src/app/globals.css` (`settle-in`, `rise-in`, `popover-motion`, plus
   `unfold`). 002, 005, 006 and 007 all depend on them.
2. 001 and 003 are pure CSS and independent.
3. 004 depends on `popover-motion`; 007 on `settle-in`; 005 on `unfold` and
   `usePresence`; 006 on `rise-in` and `usePresence`.

## The two repo rules every plan obeys

- **Tokens, never literals.** `--duration-fast/base/slow/exit` = 150/200/300/140ms,
  `--ease-brand` = `cubic-bezier(.2,.7,.3,1)`, `--ease-exit` = `cubic-bezier(.4,0,1,1)`,
  all in `web/src/app/globals.css` `@theme`. Arrivals use `base`/`brand`,
  exits `exit`/`exit`. No new curves.
- **A hidden start state lives only inside `@media (prefers-reduced-motion:
  no-preference)`.** The global `reduce` block sets `transition: none !important`
  on everything, so anything left at `opacity: 0` outside the guard stays
  there. Under reduce every one of these surfaces is simply present or absent,
  which is what it was before the plans.

## Verification that was run

`npx tsc --noEmit`, `npm run lint`, `npm run audit` on the affected public
routes and `npm run audit:mobile`, and a throwaway Playwright probe sampling
each surface mid-flight (computed `opacity`/`translate`/`scale`/height on
consecutive frames after the trigger). See the audit document's method note
for what "measured" means.
