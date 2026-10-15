# Look and feel: textures, illustrations, progress, onboarding, corners, spacing

0.101.0–0.103.0 (2026-10-05), the visual track of the October roadmap.

## Card surfaces and card motion (0.103.0)

- **`theme_surface`** (`flat`, `elevated`, `outline`; appearance, offered as
  options, 422 outside): `flat` stamps nothing. The others set only
  `box-shadow` and `border-color` on `[data-card]`/`[data-tile]` under
  `.public-site[data-surface]` — the same specificity as a theme's idiom
  selector, later in the file, so it wins the tie — and never the card's
  ground, so no surface can fail "never a card without a ground".
- **`motion_cards`** (`lift`, `tilt`, `float`, `still`; motion group,
  shape-checked like the other motion ids, resolved by `motionFor()` and
  stamped as `data-motion-cards`): `lift` is the hover cards always had.
  `tilt` is `components/ui/card-tilt.tsx`, one delegated, rAF-throttled
  pointer listener mounted by the public layout (and the theme preview) only
  when chosen; it writes `--tilt-x/--tilt-y` and `data-tilting`, and the CSS
  turns them into a `transform` — never `translate`, which the hover lift
  already owns. Every effect sits inside `(hover: hover) and (pointer: fine)`
  and `prefers-reduced-motion: no-preference`: a phone sees still cards.
- A spotlight that follows the pointer was considered and not built: it
  needs a pseudo-element, and Datacenter, Horizon, Keystone and Terminal
  already draw their tiles' rules and corner marks with `::before`/`::after`.
- Looks carry a surface (Corporate and Editorial outline, Modern and Bold
  elevated). The live preview sends it with the rest.
- Probe: `scripts/probes/cards.mjs` (`HOLD=1`, `RESTORE=1`). A dev page needs
  a few seconds to hydrate before the pointer is moved, or the listener is
  not attached yet.

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

## Heading size and two more card finishes (0.121.0)

The last of the roadmap's visual track. What was listed there as "elevation,
glass and fluid-type tokens, and a classic refresh" turned out to be mostly
built already, and one part of it should not be built:

- **Fluid type was already there** — `.display-1/2/3` have been `clamp()`s
  since the type roles were written. What was missing is a way to move the
  whole scale, which is `theme_type_scale`.
- **Glass is on every floating header already** (classic, Editorial, Launch,
  Keystone, Vantage and Sentinel all blur what scrolls under them). Glass
  *cards* were considered and refused: a translucent card is a card without a
  ground — the client's rule of 2026-09-18, which the audit enforces — and
  the contrast audit cannot grade ink through a translucent stop.
- **Classic has no CSS of its own**; everything it paints is the shared
  settings. So "refreshing classic" is these opt-in controls, and they reach
  the other eleven themes too.

**`theme_type_scale`** (`standard`, `compact`, `large`; `appearance`, public,
offered as options, 422 outside). One custom property: `--type-scale` is .88,
1 or 1.16, and the three display roles are
`calc(clamp(…) * var(--type-scale, 1))`. Unset, `calc(x * 1)` computes to the
pixels it always did, which the probe asserts (42px at 1440, 27px at 360).
`lookAttrs()` stamps `data-type-scale` on the same wrappers as the radius and
density, and nothing for `standard`.

**Large is 1.16× from `md` and 1.06× below it.** A 36px headline is already
most of a 320px line, and "Infrastructure" set 16% bigger is the long word
that runs through the right edge.

**Every rule that re-sizes a display role carries the multiplier.** The
builder's per-section heading sizes (`[data-heading="s"|"l"]`) and Terminal's
own scale each write `font-size` on a `.display-*` at higher specificity; a
rule without `* var(--type-scale, 1)` would silently opt that heading out. A
theme that sizes a hero by its own class, not a display role, keeps its size:
the setting is about the roles.

**`soft` and `glow`** joined `theme_surface`, under the rule the first three
keep: `box-shadow` and `border-color` only, never the ground.

- `soft` — the border goes transparent and the card rests on a wide, low
  shadow mixed from `--color-ink`, so it darkens with the scheme rather than
  being a fixed black.
- `glow` — the same shape in `--color-brand-600`, the fill step, which is
  bright in dark: a halo reads best exactly where a neutral shadow is
  invisible. The border takes a fifth of the brand, more under the pointer.

The border is `transparent`, never `none`: `none` drops the border's width
and every card would change size between finishes.

**Looks** carry `typeScale` now. *Statement* is new (emerald, Sora, round,
airy, glow, large); *Calm* moved to `soft` and *Editorial* to `compact`,
which is what those two were describing all along.

Measured by `scripts/probes/look-finish.mjs`, through the real settings form.
Under Glow + Large: `npm run audit` clean in light and dark and
`audit:mobile` clean on eight public routes, and no sideways scroll or
heading past the edge in any of the twelve themes at 360 or 1440.
