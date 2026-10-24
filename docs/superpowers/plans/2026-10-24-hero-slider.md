# Hero slider features Implementation Plan (0.191.0)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Eight additions to every slider (fully on the `full` layout the hero uses): two buttons, a kicker, a phone picture, slow zoom, overlay strength and text colour, progress/thumbnail navigation, per-slide timing, and responsive height (a screen-height cap, a Height choice, a per-slide Fit).

**Spec:** `docs/superpowers/specs/2026-10-24-hero-slider-design.md` — it holds every value, enum and rule; each task brief points at the part it needs.

**Tech Stack:** Laravel 13 / PHPUnit 12 (api), Next.js 16 / TypeScript / Tailwind v4 (web).

## Global Constraints

- Version **0.191.0**. Branch `altis-cms`.
- **Defaults are today's behaviour**: an untouched slider renders the same markup and the public JSON gains only the new keys at their defaults.
- Enums (values verbatim): `SlideMediaEffect` none|zoom_in|zoom_out|drift (slider); `SliderNavigation` dots|progress|thumbnails|none (slider); `SliderHeight` theme|screen|fixed (slider) with `height_mobile`/`height_desktop` short|medium|tall required when fixed; `SlideTextTone` light|dark; `SlideOverlay` soft|standard|strong; `SlideFit` cover|contain. Each with `label()`, `blurb()`, `options()` sent as `meta`, the `SliderTransition` pattern; the frontend lists none of them.
- Slide fields: `kicker` ≤60, `link2_url` (`LinkPattern::RULE`) + `link2_label` ≤60 required together, `mobile_media_path` a media-library **image**, `duration_ms` null or 2000–60000.
- Caption contrast: every scrim keeps an **opaque** colour stop (the audit discards translucent stops); overlay strength moves where the opaque stop ends, never its alpha. No hex in components; new colour tokens are derived in `web/src/lib/palette.ts`.
- Motion animates the CSS `scale`/`translate` properties (never `transition-transform` with Tailwind's translate/scale utilities), only inside `prefers-reduced-motion: no-preference`, never widening the document.
- Height cap: `max-height: calc(100svh - var(--h-site-header, 0px) - var(--h-info-bar, 0px))` on every slider frame (check the real variable names in `globals.css`).
- Console: `<Form>`, existing primitives, `data-label` on table cells, `lib/dates.ts`, icons-ui in client components; if an API shape changes, `web/mock-api.mjs` changes too.
- Tests: no network; focused filters only during tasks; never two `php artisan test` at once.

---

### Task 1: API — columns, enums, validation, resources

**Files:** migration `api/database/migrations/2026_10_24_100000_add_hero_features_to_sliders.php`; enums `api/app/Enums/{SlideMediaEffect,SliderNavigation,SliderHeight,SlideTextTone,SlideOverlay,SlideFit}.php`; modify `api/app/Models/{Slider,Slide}.php`, `api/app/Http/Requests/StoreSliderRequest.php` (and `UpdateSliderRequest` if it does not inherit `sliderRules()`), `api/app/Http/Resources/{SliderResource,SlideResource}.php` and the admin slider resource/`meta` (find where `meta.transitions` is built). Test: `api/tests/Feature/SliderHeroFeaturesTest.php`.

- [ ] Write failing tests: each new field validates (second button both-or-neither; `javascript:` refused on `link2_url`; `mobile_media_path` must be a library image — a PDF path and an unknown path refused; `duration_ms` 1999 and 60001 refused, null accepted; every enum refuses an unknown; `height=fixed` without `height_mobile`/`height_desktop` refused); round-trip through admin read and public `GET /sliders/{slug}` (`mobile_url`/`mobile_alt`/`mobile_focus`/`mobile_blur` resolved like `url`); an untouched slider's public JSON carries the defaults; `meta` carries the six option lists.
- [ ] Run `php artisan test --filter="SliderHeroFeaturesTest|Slider"` — FAIL; implement; PASS; phpstan on changed files "No errors"; pint.
- [ ] Commit `"Hero slider: columns, enums, validation and resources"`.

### Task 2: Responsive height — the cap, Height, Fit

**Files:** `web/src/components/ui/slider-for.tsx`, `slider.tsx`, `cards-slider.tsx`, `fan-slider.tsx`, `cylinder-slider.tsx`, `ripple-slider.tsx`, `slide-media.tsx`, `web/src/components/store/store-hero.tsx`, `web/src/app/globals.css`, `web/src/types/api.ts` (`Slider.height/height_mobile/height_desktop`, `Slide.fit`). Probe: `web/scripts/probes/slider-height.mjs` (committed, docblock, env sign-in only).

- [ ] Cap every slider frame to the visible screen (Global Constraints); `height=screen` → exactly that height with the aspect class neutralised and a min-height floor; `height=fixed` → `data-h-mobile`/`data-h-desktop` read by one `globals.css` block (literal rem steps; desktop from `lg`), still under the cap; stacked layouts and store-hero size their stage from the frame.
- [ ] `fit=contain`: sharp picture `object-contain` above an `aria-hidden` blurred, enlarged copy (reuse the `blur` data URL where present); video `object-contain` on a dark ground.
- [ ] Probe: every theme's `/theme-preview/<id>` at 360×640, 390×844, 1280×720, 1366×650, 1920×1080 — hero slider height ≤ the visible screen below its top and `scrollWidth <= innerWidth`. Run against the dev server with a throwaway content manager (deleted after).
- [ ] `npx tsc --noEmit`, eslint on touched files. Commit `"Hero slider: never taller than the screen; Height and Fit"`.

### Task 3: Per-slide timing

**Files:** `web/src/lib/hooks/use-carousel.ts` (`useAutoplay` → a re-armed `setTimeout` reading a per-index delay, floor 2000), the four carousels that call it (`slider.tsx`, `cards-slider.tsx`, `gallery.tsx`, `store-hero.tsx`), `web/src/types/api.ts` (`Slide.duration_ms`).

- [ ] Delay = current slide's `duration_ms ?? slider.interval_ms`; hover/focus/hidden-tab/pause/reduced-motion rules unchanged; the gallery passes its own interval.
- [ ] tsc, eslint. Commit `"Hero slider: a slide can stay longer or shorter"`.

### Task 4: Caption — kicker, second button, text tone, overlay

**Files:** `web/src/components/ui/slide-caption.tsx`, `web/src/lib/palette.ts` (+ `web/src/app/globals.css` token wiring) for `--color-scrim-light` and the dark-tone ink, any layout that renders its own caption (fan, cards) for kicker + second button, `web/src/types/api.ts`.

- [ ] Kicker in the staggered caption animation; two buttons (primary + the existing outline/ghost variant reading on the scrim), wrapping below `sm`, 24px targets; `text_tone=dark` → light opaque stop + dark ink; `overlay` → where the opaque stop ends (soft/standard/strong), middle-row panel widened only.
- [ ] `npm run themes` (the contrast gate) passes if palette.ts changed; tsc; eslint. Commit `"Hero slider: kicker, second button, text colour and shade"`.

### Task 5: Media — phone picture and slow zoom

**Files:** `web/src/components/ui/slide-media.tsx`, `web/src/app/globals.css`, `slider.tsx` (active-slide key for the zoom), `web/src/types/api.ts`.

- [ ] Phone picture via one `<picture>` built with `getImageProps` (`<source media="(max-width: 767px)">`), focal point and blur per source, images only.
- [ ] Slow zoom on the active image slide only: `[data-media-effect]` keyframes on `scale`/`translate` over the slide's duration, restarted per activation, reduced-motion guarded, clipped.
- [ ] tsc, eslint. Commit `"Hero slider: phone picture and slow zoom"`.

### Task 6: Navigation — progress and thumbnails

**Files:** `web/src/components/ui/slider.tsx`, `slider-controls.tsx`, `web/src/app/globals.css`.

- [ ] `progress`: dots + a bar whose fill animates `scale` over the current slide's duration, paused with autoplay, absent under reduced motion; `thumbnails`: a strip of lazy small `next/image`s replacing dots (`aria-label` "Slide N: heading", `aria-current`), scrolling in its own `w-0 min-w-full` box; `none`: no dots.
- [ ] tsc, eslint. Commit `"Hero slider: progress line and thumbnails"`.

### Task 7: Console and mock

**Files:** `web/src/app/admin/(app)/sliders/{slider-form.tsx,slide-repeater.tsx}`, `web/src/lib/admin/*` slider types/actions, `web/src/lib/image-specs.ts` (`slide-mobile` portrait 1080×1350), `web/mock-api.mjs`.

- [ ] Slider: Picture motion, Navigation, Height (+ On phones / On larger screens when Fixed). Slide: Kicker, Second button (URL + label), Phone picture (`CoverField`, crop to the new spec), Text colour, Shade behind the words, Picture fit, Show for (seconds). Options and blurbs from `meta`; every control in the draft/restore path.
- [ ] Browser probe `web/scripts/probes/hero-features.mjs` (committed): set up `homepage-hero` with two slides using every feature, check phone loads only the phone picture, zoom `scale` changes mid-slide and is absent under reduced motion, slides advance at their own durations, progress pauses on hover, thumbnails switch, Fit=whole picture is uncropped; restore the hero after. Throwaway admin deleted.
- [ ] `php artisan test --filter=AdminNavRolesTest` unaffected; tsc; eslint. Commit `"Hero slider: console controls and mock"`.

### Task 8: Docs, version and the gate

**Files:** `docs/sliders.md`, `CLAUDE.md` (Sliders and galleries lines), `API.md` (slider fields), the manual's slider chapter, `VERSION.md`, `web/src/lib/version.ts` (0.191.0), help regeneration if a manual section id changed.

- [ ] Write; `node scripts/build-help.mjs --check`, `node scripts/help-routes.check.mjs`.
- [ ] Full API suite alone, Larastan "No errors", pint; production build + light, dark and mobile audits with a throwaway admin; the height probe again on the build.
- [ ] Commit `"0.191.0: hero slider features"`.

### Task 9: Footer social styles (runs before Task 8)

**Spec:** `docs/superpowers/specs/2026-10-24-footer-social-styles-design.md` — four more `social_style` values (circles, outline, pills, minimal), one setting for every theme.

**Files:** `api/app/Http/Controllers/Api/V1/Admin/SettingController.php` (`SOCIAL_STYLES`), `api/tests/Feature/SocialStyleSettingsTest.php`, `web/src/components/layout/social-links.tsx`, `web/src/app/globals.css` (`--color-social-<net>-fill` tokens + the four styles' rules), `web/src/app/admin/(app)/settings/settings-copy.ts` (hints). Probe: `web/scripts/probes/social-styles.mjs`.

- [ ] API options + test; the four server-rendered styles with email included, tokens only, motion in the reduced-motion guard on `scale`/`translate`, ≥24px targets; graded white-on-fill tokens (≥3:1 each, table in the report); console hints.
- [ ] Probe all 14 themes × 360/1280 × light/dark × six styles (restore the original style after).
- [ ] tsc, eslint, `--filter=SocialStyleSettingsTest`, phpstan/pint on the controller. Commit `"Footer: four more ways to show the social links"`.
