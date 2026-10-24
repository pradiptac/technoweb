# Fluid motion Implementation Plan (0.192.0)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let an administrator make the public site move "fluidly" — springy, physical motion — from Settings → Motion, for the site as a whole and per component: buttons, cards, headings and small interactions.

**Spec:** this plan is the spec (the client said "go" without a design round; every choice below is the controller's call, recorded as such).

## The choices (controller's calls)

Two new settings and four new choices on existing ones. **Every first entry stays the default and today's behaviour**, so nothing moves on deploy.

| Setting | New ids | What it does |
|---|---|---|
| `motion_feel` (new) | `standard` (default), `fluid` | Under `[data-motion-feel="fluid"]` the site's own easing tokens become spring curves: `--ease-brand` → a CSS `linear()` spring with a small overshoot, and the base/slow durations lengthen slightly (e.g. 200→320ms, 300→450ms) so the overshoot can be seen. Every existing transition that uses the tokens (buttons, cards, menus, drawers, reveals, toasts) becomes springy at once. `--ease-exit` is left alone — leaving stays quick and accelerating. |
| `motion_buttons` | `spring`, `magnetic` | **Spring**: on hover the button rises 2px with an overshooting spring; on press it squashes to `scale: .95` and springs back past 1 on release. **Magnetic**: under a fine pointer the button drifts up to 6px towards the pointer while it is over it and springs back when it leaves (a tiny client island, the `CardTilt` pattern, writing CSS custom properties read by `translate`). |
| `motion_cards` | `spring` | A card rises 6px on a spring and its picture (`[data-tile-media] img`, `[data-card] img`) eases to `scale: 1.04`; back on a spring when the pointer leaves. |
| `motion_text` (new) | `none` (default), `rise`, `blur`, `wave` | How section headings (`SectionHead`'s word spans, which it always renders) arrive when their section is revealed: **Rise** — words rise 0.4em one after another on a spring; **Blur** — words sharpen from a 6px blur one after another; **Wave** — words rise and settle with a stagger that ripples left to right with overshoot. Keyed on the reveal observer's `data-aos-animate` on the section (or the heading itself), so text that is never revealed is never hidden. A section with its own `style.headline` keeps that. |
| `motion_micro` | `fluid` | Everything `lively` does, plus: a prose/footer/nav link's underline grows from the side the pointer entered (`scale` on a `::after`… only where the element does not already use its pseudo-elements — otherwise a background-size underline), arrows and card icons on the spring curve. |

## Global Constraints

- Version **0.192.0** (after 0.191.0, which is in flight). Branch `altis-cms`.
- **Defaults unchanged**: an install that never opens Motion renders byte-identical markup apart from the two new attributes at their default values.
- The API checks a motion id's **shape** only (`SettingController`'s `$ids` list, `^[a-z][a-z0-9-]{1,31}$`-style rule already there); the lists live in `web/src/lib/motion-choices.ts`, which falls back per field. Seed `motion_feel` = `standard` and `motion_text` = `none` in the public `motion` group (`SettingsSeeder`, `updateOrCreate`).
- All motion inside `@media (prefers-reduced-motion: no-preference)`; a hidden start state (text) lives **only** inside that guard and inside `html[data-aos-ready]`, so no-JS and reduced-motion visitors see the words.
- Animate the CSS `scale`/`translate`/`opacity`/`filter` properties, never `transform` with Tailwind's translate/scale utilities, never `transition-transform`. Nothing widens the document (vertical moves and scale-down/up within the element's own box only; text rise is vertical).
- Never change a computed `color` or `background-color` (the contrast audit reads those).
- Keyed on the wrapper attributes `motionAttrs()` stamps (`.public-site` and the portal), never `<html>`, so the console is excluded. Do not add rules on a tile's `::before`/`::after` (four themes draw with them).
- `linear()` springs: provide a `cubic-bezier(.34,1.56,.64,1)` fallback first and the `linear()` value under `@supports (transition-timing-function: linear(0, 1))`.
- Magnetic: `"use client"`, mounted once in the marketing layout only when `buttons === "magnetic"`, fine pointer + motion allowed (`useMotionOk()`), one delegated `pointermove` listener on the wrapper (no per-button listeners), rAF-throttled, writes `--mx`/`--my` on the hovered `.btn`; imports no icon map.
- Console: the Motion tab's `motion-picker.tsx` draws the two new settings like the existing ones (tiles carrying the real `data-motion-*` attribute for a live preview). Options come from `motion-choices.ts` (the existing pattern for motion — the API sends no list for these).
- Tests: no network; focused filters only; never two `php artisan test` at once. Full suite and audits only at the release gate, in the background.

---

### Task 1: API — two new motion settings

**Files:** `api/app/Http/Controllers/Api/V1/Admin/SettingController.php` (`$ids` list ~line 839), `api/database/seeders/SettingsSeeder.php`, `api/app/Support/PublicSettings.php` only if the `motion` group is not already published whole. Test: `api/tests/Feature/MotionFluidSettingsTest.php`.

- [ ] Failing test: after seeding, `GET /api/v1/settings` carries `motion_feel=standard` and `motion_text=none`; `PATCH /admin/settings` saves `motion_feel=fluid`, `motion_text=wave`, `motion_buttons=magnetic`, `motion_cards=spring`, `motion_micro=fluid`; a badly shaped id (`"Fluid Feel!"`) is a 422 on the row for each of the two new keys.
- [ ] Implement; `php artisan test --filter=MotionFluidSettingsTest` PASS; pint; phpstan on changed files.
- [ ] Commit `"Motion: two new settings, feel and headings"`.

### Task 2: Website — the choices, the CSS, the magnetic island, the picker

**Files:** `web/src/lib/motion-choices.ts` (lists `FEELS`, `TEXTS`; `spring`/`magnetic` in `BUTTONS`; `spring` in `CARDS`; `fluid` in `MICRO`; `Motion.feel`/`Motion.text`; `motionAttrs()` adds `data-motion-feel`, `data-motion-text`), `web/src/app/globals.css` (one new block "Fluid motion" beside the existing motion rules, plus the new button/card/micro ids next to their siblings), `web/src/components/ui/magnetic-buttons.tsx` (new), `web/src/app/(marketing)/layout.tsx` (mount it), the portal layout gets the attributes through `motionAttrs()` only, `web/src/app/admin/(app)/settings/motion-picker.tsx` (two new rows), `web/src/app/admin/(app)/settings/settings-copy.ts` if the Motion tab's field list is declared there, `web/mock-api.mjs` (the two settings in `/settings`). Probe: `web/scripts/probes/fluid-motion.mjs` (committed, docblock, env sign-in only).

- [ ] Notes for each new id written in the lists' existing voice ("… The current behaviour." stays on the first entries).
- [ ] CSS per the table above. Check `SectionHead`'s word-span markup and the reveal observer's attribute names before writing the text rules; stagger by a `--i` index if the spans carry one, else `:nth-child()` up to 12 words then the rest together.
- [ ] Probe (dev server, `/theme-preview/classic` and one more theme, 1280 and 390): with each new id set (restore originals after) — a mid-flight sample shows `scale`/`translate` overshooting past the rest value for spring buttons and cards; magnetic `translate` is non-zero with the pointer near a button's edge and returns to `none` after leaving; a revealed section heading's words end at opacity 1 / no transform / no filter; under `reducedMotion: 'reduce'` words are visible at once and nothing transitions; `scrollWidth <= innerWidth`; no console errors.
- [ ] `npx tsc --noEmit`, eslint on touched files. Commit `"Motion: fluid feel, spring and magnetic buttons, spring cards, moving headings"`.

### Task 3: Docs and version

**Files:** `docs/motion.md` (a "Fluid motion" section: the token remap and why exit stays, each new id, the magnetic island, the text start state), CLAUDE.md "Motion — docs/motion.md" one line, `API.md` (the two keys in the `motion` group paragraph), `manual/` motion chapter (the two new rows and four new choices), `VERSION.md` + `web/src/lib/version.ts` 0.192.0.

- [ ] Write; `node scripts/build-help.mjs --check`, `node scripts/help-routes.check.mjs`.
- [ ] Commit `"0.192.0: fluid motion"`. The release gate (full suite, Larastan, build + light/dark/phone audits) runs once in the background with 0.191.0's or right after it.
