# Hero slider: eight new features (0.191.0) — design

## Context

The client wants the homepage hero slider to be richer. Today a slide has one picture/video/YouTube, a heading, a caption, ONE link and a caption position; a slider has a layout, a transition, a text animation, autoplay and one interval for all slides. Text is always white on a dark scrim, the picture is always a static `object-cover`, and navigation is arrows + dots. The user chose seven additions:

1. **Two buttons per slide** — a primary and a secondary call to action.
2. **Kicker line** above the heading.
3. **Separate phone image** — a portrait crop shown below `md`.
4. **Slow zoom (Ken Burns)** — the picture drifts/zooms while on screen.
5. **Overlay strength & text colour** per slide.
6. **Progress bar / thumbnails** navigation.
7. **Per-slide timing** — a slide may stay longer/shorter than the slider's interval.
8. **Responsive height** — no slider ever runs past the visible screen. Today each theme fixes the shape with an aspect ratio and nothing caps the height: Atelier's `aspect-[4/5]` hero at 46vw is ~830px tall on a 1440×800 screen, Launch's `aspect-[4/5]` on a phone pushes the page below the fold, and the cards/fan/cylinder stacks inherit the tall shape. Fix: a screen-height cap on every slider, a per-slider Height choice, and a per-slide Fit choice.

These are general slider features (every slider gets them, not only `homepage-hero`), rendered fully by the `full` layout (`Slider`) that the hero uses by default; other layouts get what they can show (see "Layouts").

## Data (api)

New migration `api/database/migrations/2026_10_24_100000_add_hero_features_to_sliders.php`:

- `slides`: `kicker` (string 60, null), `link2_url` (string 2048, null), `link2_label` (string 60, null), `mobile_media_path` (string, null — image only), `text_tone` (string 10, default `light`), `overlay` (string 10, default `standard`), `duration_ms` (unsigned int, null = the slider's interval).
- `sliders`: `media_effect` (string 20, default `none`), `navigation` (string 20, default `dots`), `height` (string 20, default `theme`), `height_mobile` (string 10, null), `height_desktop` (string 10, null).
- `slides`: also `fit` (string 10, default `cover`).

New enums beside the existing ones (`api/app/Enums/SliderTransition.php` is the pattern — `label()`, `blurb()`, `options()` sent as `meta`):
- `SlideMediaEffect`: `none`, `zoom_in`, `zoom_out`, `drift` (slider-level; the slow zoom).
- `SliderNavigation`: `dots` (today), `progress` (dots + a progress line), `thumbnails` (a strip of small pictures under the slider), `none` (arrows only).
- `SlideTextTone`: `light` (white words on the dark scrim — today), `dark` (dark words on a light scrim).
- `SlideOverlay`: `soft`, `standard` (today), `strong`.
- `SliderHeight`: `theme` (the theme's aspect ratio, now capped — default), `screen` (exactly the visible screen below the header), `fixed` (uses `height_mobile` / `height_desktop`, each `short` | `medium` | `tall`, required when `fixed`).
- `SlideFit`: `cover` (fill and crop around the focal point — today), `contain` (the whole picture, centred over a blurred, enlarged copy of itself so there are no bare bars).

Files to change: `api/app/Models/Slide.php` / `Slider.php` (fillable, casts), `api/app/Http/Requests/StoreSliderRequest.php` (`sliderRules()`: kicker ≤60; `link2_url` via `LinkPattern::RULE`, `link2_label` ≤60, each required with the other; `mobile_media_path` must be a library **image** (mirror how `media_path`/`poster_path` are checked); `duration_ms` integer 2000–60000 nullable; the four enums), `api/app/Http/Resources/SlideResource.php` (`kicker`, `link2_url`, `link2_label`, `mobile_url` + `mobile_alt`/`mobile_focus`/`mobile_blur` via `MediaMeta`/`MediaUrl` exactly like `url`, `text_tone`, `overlay`, `duration_ms`), `SliderResource.php` (`media_effect`, `navigation`) and the admin resource/`meta` (option lists). Defaults are the current behaviour, so an untouched slider renders byte-identically.

## Console (web/src/app/admin/(app)/sliders/)

- `slider-form.tsx`: selects — "Picture motion" (`media_effect`), "Navigation" (`navigation`), "Height" (`height`; when Fixed, two more selects "On phones" / "On larger screens"), blurbs from `meta`, beside Transition/Text animation.
- `slide-repeater.tsx` also gets "Picture fit" (Fill the frame / Show the whole picture).
- `slide-repeater.tsx` per slide: Kicker; a second Link URL + Link label pair ("Second button"); "Phone picture" (`CoverField`, image only, hint from `lib/image-specs.ts` — add a `slide-mobile` spec, portrait 1080×1350, so crop-before-upload offers that ratio); "Text colour" (Light/Dark) and "Shade behind the words" (Soft/Standard/Strong) selects; "Show for" seconds (blank = slider default). Every new control goes in the repeater's draft/restore path like the existing fields.
- `web/src/types/api.ts` (`Slide`, `Slider`), `web/src/lib/admin/*sliders*` types, `web/mock-api.mjs` slider shapes.

## Rendering (web/src/components/ui/)

- **Buttons + kicker** — `slide-caption.tsx`: kicker as a small uppercase line above the heading (part of the existing staggered `caption-anim-*`); two buttons in a row, the first the existing primary style, the second the outline/ghost button variant that reads on the scrim (`Button`/`ButtonLink` variants already in `components/ui/button.tsx` — reuse, `onDark` where the tone is light). Buttons wrap below `sm`; each keeps the 24px tap rule.
- **Text tone + overlay** — `slide-caption.tsx` `SCRIM`/panel: `light` keeps `from-scrim` + white text; `dark` uses a light opaque stop (a new non-inverting token `--color-scrim-light`, derived in `web/src/lib/palette.ts` beside `--color-scrim`, so no hex in components) + `text-dark-ink`-style dark text. Overlay strength changes how far the **opaque** stop reaches (e.g. `via-scrim via-30%/45%/60%` before fading), never its alpha — the audit only sees opaque stops (CLAUDE.md "A slide's caption gradient must use an opaque colour stop"). The middle-row panel keeps its opaque panel; strength widens its padding/size only.
- **Phone image** — `slide-media.tsx`: when `mobile_url` is set on an image slide, render one `<picture>` built with Next's `getImageProps` (a `<source media="(max-width: 767px)">` for the phone image, the `<img>` for the wide one) so only one file downloads; focal point and blur per source. Video/YouTube slides ignore it.
- **Slow zoom** — `slide-media.tsx` + `globals.css`: `[data-media-effect="zoom_in|zoom_out|drift"]` on the slide's picture wrapper, animating the CSS **`scale`/`translate` properties** (the Tailwind v4 trap: never `transition-transform`) over the slide's duration, restarted per active slide (key on the active index), inside `@media (prefers-reduced-motion: no-preference)`, on the current slide only; the wrapper `overflow: hidden` so nothing widens the document. Not applied to video/YouTube.
- **Per-slide timing** — `web/src/lib/hooks/use-carousel.ts` `useAutoplay`: switch from one `setInterval` to a `setTimeout` re-armed per tick, reading the delay from a `delayFor(index)` value (current slide's `duration_ms ?? interval_ms`, floor 2000). The four carousels pass the current index; behaviour with no `duration_ms` is unchanged.
- **Progress / thumbnails** — `slider.tsx`: `navigation=progress` adds a thin bar under the dots whose fill is a CSS animation of `scale` over the current slide's duration, paused with the autoplay pause (hover, focus, hidden tab, Pause button, reduced motion → no bar); `thumbnails` replaces dots with a horizontal strip of small `next/image` thumbnails (lazy, 64–96px, `aria-label` "Slide N: heading", `aria-current`), scrollable inside its own `w-0 min-w-full` container so it never widens the page; `none` hides dots (arrows + Pause remain). Tokens only, 24px targets.

- **Responsive height** — `slider-for.tsx` (the one entry every theme and the builder call) wraps the frame:
  - **The cap, always on, every layout:** `max-height: calc(100svh - var(--h-site-header, 0px) - var(--h-info-bar, 0px))` on the slider frame (`svh`, so mobile browser bars do not make it jump). The theme's `aspect-*` still sets the shape; when that shape would be taller than the screen, the frame stops at the screen and the media crops around its focal point. Nothing distorts and nothing crosses the viewport. Check the variable names actually used in `globals.css` (Vantage's hero already uses `--h-site-header` + `--h-info-bar`).
  - `height: screen` → `height: calc(100svh - header - info bar)` with the aspect class ignored (`aspect-auto`); a `min-height` floor (e.g. 22rem) so a landscape phone stays usable.
  - `height: fixed` → `data-h-mobile` / `data-h-desktop` attributes read by one `globals.css` block (literal rem values per step, desktop from `lg`), also under the cap.
  - The stacked layouts (cards, fan, cylinder) and `store-hero.tsx` honour the same frame height: their inner stage sizes from the frame, not from a width-derived aspect. Implementer verifies each at 360/768/1280/1920 and on a short 1366×650 screen.
  - `height` is a slider property, so the Atelier/Launch portrait heroes stop overflowing with no setting changed (the cap); the console can then choose Screen or Fixed.
- **Fit** — `slide-media.tsx`: `fit=contain` renders the picture `object-contain` above a second, blurred, `scale`d copy (`aria-hidden`, `object-cover`, a `blur()` filter — reuse the slide's `blur` placeholder data URL as that background where present to avoid a second download); video gets `object-contain` on a `bg-dark` ground. Slow zoom applies to the sharp picture only.

### Layouts
- `full` (`slider.tsx`) — all seven.
- `split` (`store-hero.tsx`), `cards`, `fan`, `cylinder`, `ripple` — kicker, second button, text tone and per-slide timing where they draw a caption/autoplay; slow zoom, phone image, progress/thumbnails are documented as `full`-only (the console blurb says so). Implementer confirms each layout's caption path shares `slide-caption.tsx`; where it does not, add kicker + second button there.

## Docs and version
`docs/sliders.md` (a "Hero features (0.191.0)" block: the opaque-stop rule for the dark tone, the one-download `<picture>`, the `scale` animation, the timeout autoplay), CLAUDE.md "Sliders and galleries" lines, API.md slider fields, `manual/` slider chapter (find the existing one), VERSION.md 0.191.0, `web/src/lib/version.ts`.

## Execution
Subagent-driven, as C6/C7: 1) API (migration, enums, requests, resources, tests); 2) **responsive height: the cap, Height, Fit** (first on the web side — it fixes the overflow on every theme and the other features build inside the capped frame); 3) autoplay hook + per-slide timing; 4) caption: kicker, second button, tone, overlay (+ token); 5) media: phone image, slow zoom; 6) navigation: progress, thumbnails; 7) console form + types + mock; 8) docs/version + gate. Task review after each, final whole-branch review, then merge on the user's word.

## Verification
- API: new `tests/Feature/SliderHeroFeaturesTest.php` — each field validates (second button needs both halves; `javascript:` refused; phone image must be a library image; `duration_ms` bounds; enums refuse unknowns) and round-trips through the admin and public resources; an untouched slider's public JSON gains only the defaults. `php artisan test --filter="Slider"`, then the full suite once; `composer analyse` "No errors".
- Web: `npx tsc --noEmit`, eslint on touched files.
- Browser: a throwaway admin sets up `homepage-hero` with two slides using every feature (dark tone, strong overlay, two buttons, kicker, phone image, 3 s and 9 s durations, zoom_in, thumbnails), then a probe `web/scripts/probes/hero-features.mjs` checks: phone width loads only the phone image (network log); the zoom's computed `scale` changes mid-slide and is absent under reduced motion; the second slide advances after ~3 s and the next after ~9 s; the progress bar pauses on hover; thumbnails switch slides. Restore the hero afterwards.
- Height: a probe (`web/scripts/probes/slider-height.mjs`) opens `/theme-preview/<id>` for all fourteen themes at 360×640, 390×844, 1280×720, 1366×650 and 1920×1080 and fails if the hero slider's bottom edge is below `innerHeight` measured from its top (i.e. its height exceeds the visible screen) or if `documentElement.scrollWidth > innerWidth`; then with Height = Screen and Fixed on `homepage-hero`. A portrait picture with Fit = whole picture shows uncropped.
- Audits against a production build: `npm run audit` light and `AUDIT_SCHEME=dark` on `/` and `/admin/sliders/*`, `npm run audit:mobile` at 320–414 — zero contrast, overflow and tap-target failures (dark tone text must pass on its light stop).
