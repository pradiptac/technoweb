# Look and feel: textures, illustrations, progress, onboarding, corners, spacing

0.101.0–0.102.0 (2026-10-05), the visual track of the October roadmap.

## Corners, spacing, looks and the live preview (0.102.0)

Two `appearance` settings, `theme_radius` (`soft`, `sharp`, `round`) and
`theme_density` (`comfortable`, `compact`, `airy`), offered by the API as
`options` and refused outside them (`SettingController::RADII`/`DENSITIES`),
resolved by `lib/look.ts`.

- **The defaults stamp nothing.** `soft` and `comfortable` are what the site
  drew before; `lookAttrs()` returns no attribute for them, and `.section-y`
  multiplies by `var(--density, 1)`, which computes to the old pixels. An
  install that never opens the control is unchanged.
- **Where they apply.** `data-radius` / `data-density` on the public site's
  wrapper, the theme preview's and the portal's — never the console's.
  Radius re-points the `--radius-*` tokens every `rounded*` utility reads
  (`rounded-full` is a shape and stays); density scales section padding only.
- **Looks** (`LOOK_PRESETS`): Corporate, Modern, Bold, Calm, Editorial — a
  palette preset, two fonts, corners and spacing set together on the
  appearance tab, a starting point to nudge before saving.
- **The live preview** frames `/theme-preview/current` (the active theme)
  under the palette picker, with Homepage/Inner page and Desktop/Phone
  toggles. The picker posts `{type: "tw:look", css, radius, density}`;
  `components/layout/preview-bridge.tsx` replaces the frame's
  `#theme-tokens` text and the two attributes. The CSS is
  `themeTokensCss()` — the function the root layout renders with — so the
  frame cannot show a palette the site would not. Same-origin, framed and
  shape-checked messages only; nothing is saved until Save.
- Probe: `scripts/probes/look.mjs` (`HOLD=1` keeps Round + Airy for an
  audit run, `RESTORE=1` puts them back).

## Section textures

A sixth property on the shared section background (`SectionBackground.texture`,
`ThemeOptions::TEXTURES`): `grain`, `mesh`, `glow`, `grid`, `dots`, or none.
Offered on every ground but the theme's own, on the Themes screen (homepage
sections) and in the page builder (`background-field.tsx`), validated by the
one rule both use, `ThemeOptions::background()`; `none` stores nothing.

- **Drawn as a sibling, never an ancestor.** `SectionBg` puts an empty
  `<span data-texture>` between the picture and the content. The contrast
  audit reads the backgrounds of a text's ancestors, so it still grades the
  ink against the ground — a texture cannot be what fails it, and cannot hide
  a failure either.
- **Inside the local palette.** The span sits in the section's wrapper, so
  `--color-ink`, `--color-brand-500` and the rest are the section's own: a
  grid on a navy band is drawn in the band's ink.
- **A whisper.** Every layer is low alpha; the mesh pools sit in the corners,
  away from the words; grain is `overlay` blended at 16%. Nothing moves.
- CSS: `[data-texture="…"]` at the end of `globals.css`. Probe:
  `scripts/probes/textures.mjs` (sets three through the real Themes form;
  `RESTORE=1` puts them back).

## Spot illustrations

`components/ui/illustrations.tsx`: ten scenes (`empty`, `search`, `inbox`,
`chart`, `calendar`, `people`, `document`, `offline`, `lost`, `done`) drawn in
the icon set's hand, every colour a token mixed into `--color-card`, so each
follows the palette and the dark scheme with no second set. No text inside,
always `aria-hidden`.

`EmptyState` draws `empty` by default (an `icon` still wins), takes
`illustration` to choose, and `compact` for a panel inside a card — where the
title is a `<p>`, because the card's own heading is the section's. The ground
is the surface, not a dashed border: a dashed box reads as a drop zone.

**A spread after a prop overrides it.** `fill={X} {...stroke}` lost every fill
because `stroke` carries `fill: "none"`; `tsc` caught it (TS2783). Spread
first, then the override.

## The ticket stepper

`components/ui/stepper.tsx` with `ticketSteps()` in `lib/progress.ts`, on the
portal's ticket page: received → with an engineer → being worked on →
resolved → closed, `pending_customer` drawn as *waiting for you* in the warn
tone. Across the card from `sm`, down it on a phone. Not drawn for a merged
ticket. Orders already had their own (`components/store/order-timeline.tsx`,
which reads the stamps as well as the status), used by both order pages —
there is deliberately no second order mapping.

## Getting started

`GET /admin/onboarding` (`role:admin`, `App\Support\Onboarding`): ten steps,
each answered from real state — the seeded phone number, address, figures and
social URLs are recognised by their exact values, so a step goes green when
the sample is replaced and not before. The dashboard draws
`components/admin/onboarding-card.tsx` above the tiles while anything is
outstanding; folding it away is this browser's choice (`localStorage`, read
through `useSyncExternalStore`, server snapshot "open"), and folded it is one
line with the count. `OnboardingTest`.
