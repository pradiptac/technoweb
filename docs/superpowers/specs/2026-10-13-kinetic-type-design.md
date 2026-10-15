# 0.171.0 — Kinetic type and micro-interactions (A4)

Approved in conversation on 2026-10-13. Roadmap 2.0, track A, release A4.

## Intent

The client wants the product to feel "simple, smart, eye-catching and
animated". This release adds two things:

- **Headings that move:** a hero heading can rotate words, type itself, decode, or draw a highlight under a word.
- **Small "alive" feedback** on every surface — the public site, the customer portal and the console — so that pressing, copying, switching and saving each answer visibly.

Success means:

- An editor picks a heading effect site-wide or on one hero, and it plays on the next page load.
- Nothing moves under reduced motion, nothing shifts the layout, and the page reads correctly with no JavaScript.
- Every audit stays green.

## The client's decisions

- **Scope:** the public site, the portal and the console.
- **Effects:** rotating words, typewriter, decode (scramble) and highlight draw — all four.
- **Control:** a site-wide default plus a per-hero override.
- **Micro-interactions ship on by default (Lively).** This is a deliberate exception to the rule in `motion-choices.ts` that the first choice is "the site as it moved before". The client asked for an animated feel, and every effect is small.

## Binding constraints

These are existing rules, not new ones:

- **The finished heading is the server's HTML.** The `h1` holds the real text, and the animation is a decorative copy on top of it. Search engines, screen readers, no-JS visitors and reduced-motion visitors all get the final words.
- **No layout shift.** Every letter's and word's box is at its final size from the first frame.
- **Motion properties:** `transform`/`translate`/`scale`/`opacity` only. Transition `translate` and `scale`, never `transform` (the Tailwind v4 trap). Never a horizontal movement that can widen the document.
- **Reduced motion:** every animation sits inside the reduced-motion guard. A hidden start state lives only inside `prefers-reduced-motion: no-preference`.
- **The audits:**
  - Automated browsers see final states, the `tw_tour_force` pattern: `KineticText` renders the finished heading when `navigator.webdriver` is true, unless `localStorage.tw_kinetic_force === "1"`.
  - Contrast is graded on token colours only.
- **Moving content that can last more than 5 seconds carries a Pause button** (rotating words).
- **No new dependency.** CSS plus one small client island.

## 1. Kinetic headings

### Effects

`KINETIC` in `web/src/lib/motion-choices.ts` is the one list:

| id | What it does | Needs words? |
|---|---|---|
| `none` | Static. The site as before | no |
| `rotate` | The last word of the heading cycles through the alternatives | yes, 1–6 alternatives |
| `type` | The heading types itself in once, with a blinking caret that fades after it finishes | no |
| `decode` | Each letter flickers through random glyphs and settles, left to right | no |
| `highlight` | A brand-coloured marker stroke draws itself under a word | optional: the word to mark (default: the last word) |

### Settings and data

- **`motion_headline`** (motion group, public): the site-wide default.
  - Choices: `none`, `type`, `decode` or `highlight`. `rotate` needs words, so it is not offered site-wide.
  - Seeded `none`.
  - Shape-checked by `SettingController::validateMotion` (added to `$ids`).
- **`hero_kinetic`** (homepage group, public):
  - Choices: `default` (follow the site), `none`, `rotate`, `type`, `decode` or `highlight`.
  - Seeded `default`. Shape-checked the same way.
- **`hero_kinetic_words`** (homepage group, public, text): one alternative per line, or the word to mark.
  - At most 6 lines of at most 40 characters each, else 422 "Up to six words or short phrases, one per line."
  - Blank lines are dropped.
- **Builder hero section (`PageSectionType::Hero`):**
  - `kinetic` is nullable and shape-checked (`^[a-z][a-z0-9-]{1,31}$`). `default` is not stored.
  - `kinetic_words` is nullable, at most 300 characters, held to the same 6 × 40 rule in `checkData`.
  - Both pass through `normalise()` and the public read unchanged.
  - **Not** in `inlineFields()`: the words are not on the page as one run.
- **Resolution, frontend only, in `kineticFor(siteDefault, override, words)`:**
  - `default` or blank means the site's choice.
  - An unknown id means `none`.
  - `rotate` with no words means `none`.
  - The result is `{ effect, words }`.

### Rendering

- **`HeroTitle`** (`lib/hero-heading.tsx`) gains an optional `kinetic?: { effect, words }` prop. When the effect is not `none` and `children` is a plain string, it renders `<KineticText text effect words />` inside the same tag. Otherwise it renders exactly what it does today. The classic hero, which splits its last word into a coloured span, passes the plain heading plus `effect` and lets `KineticText` keep that colour split: the last word carries `text-brand-ink` as it does today.
- **The homepage heroes of all twelve themes** pass `kinetic` from the settings. Every theme's `Home` already receives the settings through `HomeData`, so a helper `heroKinetic(data)` saves twelve copies of the logic.
- **The builder hero section** passes `kinetic` from its `data`, with the site default from the settings, which the page already loads.

### `components/ui/kinetic-text.tsx` (client)

- **Server render:** the final text, wrapped as `<span class="kinetic" data-kinetic="<effect>">`. A word is a `<span data-k-word>`; a letter is a `<span data-k-char>` for `type` and `decode` only. The whole text is also in a `sr-only` span, and the animated spans are `aria-hidden`. The server HTML therefore reads finished, with nothing hidden.
- **When it starts:** on mount, if motion is allowed (`useMotionOk()` from `lib/hooks/use-carousel.ts`) and the browser is not automated, it sets `data-kinetic-run`. CSS hides the start state only under `[data-kinetic-run]` inside the no-preference guard. It starts once the heading is at least 50% in view (IntersectionObserver), and plays once.
- **`type`:** letters are revealed by toggling `data-on` per character on an interval of about 38ms per character, capped at 1.6s total. The caret is a `::after` on the last revealed character's wrapper that blinks, then fades out after 1.2s.
- **`decode`:** each character's visible glyph is an absolutely positioned overlay `<span data-k-glyph>` over the transparent final glyph, which holds the box. For about 600ms (staggered by 30ms per character) the overlay shows random characters from `A–Z0–9#%&*`, then it is removed. This is rAF-driven, cancelled on unmount, and paused while the document is hidden.
- **`rotate`:**
  - The last word becomes an `inline-grid` slot. Every alternative, the original included, is stacked in the same grid cell, so the slot is as wide as the widest.
  - Each word fades and rises in (`translate: 0 .4em`, `opacity`) for 2.4s, then swaps.
  - It stops after one full cycle, back on the original word.
  - It pauses while hovered, while focus is within, and while the document is hidden.
  - A Pause/Play button (`IconPause`/`IconPlay`, 24px, with an `aria-label`) sits after the heading. It is rendered only once the run starts and removed when the cycle ends.
  - A slot wider than the heading's line wraps as a whole word (`white-space: nowrap` on the slot only), so the overflow check is safe at 320px.
- **`highlight`:** the marked word, matched case-insensitively (first match, else the last word), is wrapped in `<span data-k-mark>` with an inline SVG path below it (`aria-hidden`, `preserveAspectRatio="none"`, `stroke: var(--color-brand-600)`, opacity .55). The path draws with `stroke-dashoffset` over 700ms after a 250ms delay. The text colour is untouched, so contrast is unaffected.
- **Theme fit:** the colours are tokens only. Terminal and Datacenter use their own mono face automatically, because the text inherits.

## 2. Micro-interactions — site and portal

- **`motion_micro`** (motion group, public): `lively` (the default, seeded) or `none`. It is shape-checked.
- **Where the attribute goes:** `motionAttrs()` stamps `data-motion-micro` on the marketing and portal wrappers. Every rule is keyed on `[data-motion-micro="lively"]`, inside the reduced-motion guard, and unlayered, like the other motion rules.

The effects:

1. **Link underline:**
   - Applies to links inside `Prose`, and to footer and inline text links that carry no class of their own.
   - The underline is a `linear-gradient` background in `currentColor`, sized `0 1px` at rest and `100% 1px` on hover or focus-visible.
   - It transitions `background-size`. This is paint only, which is accepted for inline text, and is the one non-transform property here; the spec names it.
   - Links that already have a hover underline (nav underline, buttons) are excluded by selector.
2. **Arrow nudge:**
   - An `svg[data-icon="arrow-right"]` inside `.btn` or `a` moves `translate: 3px 0` on hover or focus-visible, at `--duration-fast`.
   - `IconArrowRight` gains `data-icon="arrow-right"`, a harmless attribute.
   - Vertical movement is not required: 3px happens inside the button's own padding, so the document never widens.
3. **Switch spring:**
   - The thumb's translate uses `cubic-bezier(.34,1.56,.64,1)` (an overshoot) when `lively`.
   - The track colour stays on `--ease-brand`.
4. **Checkbox pop:**
   - A native checkbox `scale`s from .85 to 1 when it becomes `:checked`, with a 160ms animation keyed on `:checked`.
   - Radio buttons do the same.
5. **Copy confirmation:**
   - In `CopyLink` and `CopyText`, the tick or "Copied" state renders inside `<span data-copied>`, which runs a `scale` .8 → 1 plus `opacity` arrival through `@starting-style`.
   - The state machine and live region are unchanged.
6. **Icon pop:** on a fine pointer, `[data-tile]:hover [data-tile-icon]` scales to 1.08 at `--duration-base`. This is skipped in themes whose idiom hides the icon (it is harmless anyway).
7. **Refused field:** a control that gains `aria-invalid="true"` plays one `field-refused` animation, a `box-shadow` ring in `--color-err` at 35% expanding and fading over 600ms. It runs once, because the rule starts matching only when the attribute appears.

## 3. Micro-interactions — console

The console is keyed on `[data-console]`. **Subtle** (`html[data-console-motion="subtle"]`) keeps colour and ring feedback and drops movement. The command palette and keyboard shortcuts never animate, unchanged.

1. **Switch spring, checkbox pop, copy confirmation and refused-field ring:** the same CSS as the site, scoped `[data-console]`. Under Subtle, the spring becomes the plain ease and the pop is dropped.
2. **"Saved ✓" on the Save button:**
   - The toast provider dispatches `window` `tw:saved` when it raises an `ok` toast.
   - `FormActions` records the time of its form's last submit. If `tw:saved` arrives within 15s of it, it shows "Saved" with `IconCheck` in its submit button for 1.6s, then the label returns.
   - The button's width is held, because the label is swapped in a grid cell that holds both labels.
   - The live region is unchanged: the toast already announces it.
3. **New-items badge pop:** when a poll raises a sidebar "N new" count, `new-since.tsx` sets `data-bumped` on that badge for 400ms. The CSS plays a `scale` 1 → 1.25 → 1 pop over 300ms on `[data-bumped]`. It does not play on first render, because only an increase after hydration sets the attribute.

## 4. Console screens

- **Site → Settings → Motion tab:** two new rows, drawn by the generic settings renderer from `settings-copy.ts`.
  - "Hero heading" (`motion_headline`, choices from `KINETIC` minus `rotate`).
  - "Small interactions" (`motion_micro`).
  - Each tile previews the real rule, the existing picker pattern.
- **Site → Settings → Homepage tab:** "Hero heading effect" (`hero_kinetic`) and "Words" (`hero_kinetic_words`, a textarea with a hint that depends on the effect).
- **Builder hero editor:** an "Effect" select and a "Words" textarea, shown for `rotate` and `highlight`.

## 5. Testing

- **API (`KineticSettingsTest`):**
  - shape checks for `motion_headline`, `motion_micro` and `hero_kinetic`
  - the 6 × 40 rule on `hero_kinetic_words`
  - the builder hero's `kinetic`/`kinetic_words` rules and normalisation (`default` not stored)
  - the public read passing them through
- **Probe `scripts/probes/kinetic-type.mjs`** (sets `tw_kinetic_force`). For each effect on a throwaway builder page, created through the API and deleted after:
  - the heading's text in the server HTML is the full heading
  - the `h1` box does not change height or width while it plays (sampled ten times)
  - `type` and `decode` finish within 2.5s
  - `rotate` shows the alternatives, pauses on the button, ends on the original word, and has no overflow at 320
  - `highlight` draws, with its path's `stroke-dashoffset` sampled mid-flight
  - reduced motion: no `data-kinetic-run`, final text
  - no console errors
- **Probe `scripts/probes/micro-interactions.mjs`:**
  - the arrow nudge sampled mid-transition
  - the link underline's `background-size` grows
  - the copy confirmation arrives
  - the console's Save shows "Saved" after a real save on a throwaway draft, then deletes it
  - Subtle removes the spring
  - `motion_micro=none` removes the site rules
- **Audits:** `npm run audit` (light and dark, admin and portal credentials) and `npm run audit:mobile` on the changed routes. Heroes are judged by eye in Classic, Terminal and Launch at 360, 768, 1280 and 1920.
- **Gates:** `php artisan test`, `composer analyse`, `npx tsc --noEmit`, `npm run lint`.

## 6. Docs and release

- `docs/motion.md` gets two new sections, "Kinetic headings" and "Micro-interactions".
- `docs/console-portal.md` gets the console half.
- CLAUDE.md gets module lines under Motion and The console and portal shell.
- API.md gets the settings and builder hero fields.
- `mock-api.mjs` gets the new settings.
- The manual gets the motion settings chapter, then `npm run help`.
- VERSION.md and `version.ts` move to 0.171.0.

## Also in this release (from the 0.170.0 verification)

- `/admin` has 95px of sideways scroll at 768px (dashboard-view probe). Find the element with `audit:mobile`-style measurement and fix it.
- The ai-badge probe accepts a sweep that has already `finished` by the time it samples. The sweep ran; the slow server made it finish before the sample.

## Not in scope

- Cursor effects.
- Kinetic type on non-hero headings. Section headlines already have rise, wipe and shimmer (0.114.0).
- Lottie and 3D (A3).
