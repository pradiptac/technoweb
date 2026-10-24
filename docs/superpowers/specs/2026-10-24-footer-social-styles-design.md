# Footer social icons: four more display styles

## Context

The footer's social row has two styles today — the "CONTACT" flip tiles (default) and a magnifying dock — chosen by one setting, `social_style`, in Settings → Social profiles. The client wants more ways to show the icons. Chosen: **brand-colour circles**, **outline that fills on hover**, **labelled pills**, and a **minimal icon row**, all selected by the same one setting for every theme (no per-theme defaults). Flip and dock stay as they are; flip stays the default.

Everything already funnels through one component: every one of the 14 footer layouts in `web/src/components/layout/site-footer.tsx` renders `<SocialLinks settings={settings}/>` (`web/src/components/layout/social-links.tsx`), which reads `social_style` and the seven profile URLs. So each new style is one branch in that component plus its CSS, and one more option in the API's list.

This work joins the open **0.191.0** release (the hero slider), before its docs/version task, so one final gate covers both.

## API (one list, one rule)

- `api/app/Http/Controllers/Api/V1/Admin/SettingController.php`: add four entries to `SOCIAL_STYLES` (line ~218), in this order after `flip`, `dock`: `circles` "Brand-colour circles", `outline` "Outline, fills on hover", `pills` "Labelled pills", `minimal` "Minimal icon row" — each with a one-sentence description in the existing voice. The validation at line ~942 already refuses anything outside the list; nothing else changes (`social_flip_word` still applies to flip only).
- `api/tests/Feature/SocialStyleSettingsTest.php`: the four values save; an unknown one is still refused; the options list carries all six in order.

## Website

`web/src/components/layout/social-links.tsx` — `SocialLinks` dispatches on `social_style`: flip (default/fallback) and dock unchanged; `circles`, `outline`, `pills`, `minimal` each a small **server** component in the same file (no client JS needed — hover is CSS). All four:
- use the existing `PROFILES` table (key, label, icon) and the existing filtering (blank URLs dropped, nothing rendered when none set), and **include the email** link the flip style already appends (same source);
- are a `<ul>` of links with an accessible name per link ("LinkedIn", … — the same labels/`aria-label` pattern flip uses), `target="_blank" rel="noopener"` as the existing styles do, ≥24px targets (aim 40px; 36px below `sm`), wrap onto a second line rather than overflow, and keep the global focus ring;
- take colour from tokens only; every motion (lift, fill) inside `@media (prefers-reduced-motion: no-preference)`, animating the CSS `scale`/`translate` properties (never `transition-transform`, the Tailwind v4 trap), and changing only a pseudo-element's opacity/scale so the audit's computed `color`/`background-color` reading is not disturbed.

The four styles:
1. **circles** — 40px discs filled with the network's **graded fill** and a white glyph at rest; hover/focus lifts 2px. Needs a white-glyph-safe fill per network (WhatsApp's `#25D366` is only ~2:1 under white): add `--color-social-<net>-fill` tokens in `globals.css` (`@theme`) for linkedin, x, facebook, instagram, youtube, whatsapp, reddit, email — each measured ≥ 3:1 white-on-fill (WCAG 1.4.11; the blog sidebar's `#D93A00` Reddit is the precedent), and non-inverting (same in both schemes). The disc itself must clear 3:1 against the footer ground or carry a 1px ring in the footer's ink at /25 so it reads on light footers too.
2. **outline** — 40px circles drawn as a 1.5px ring in the footer's current ink (`currentColor`, so it follows every layout's light or dark ground), glyph in the same ink; on hover/focus a `::before` with the network's fill token rises from the bottom (`scale: 1 0` → `1 1`, origin bottom) and the glyph turns white. Under reduced motion the fill appears without the rise.
3. **pills** — icon + network name ("LinkedIn", "YouTube", "Email") in a rounded pill with a 1px border in the footer's line/ink token, text in the footer's ink (graded by the audit like any footer text); hover tints the border with the network's fill token. Wraps on phones; never truncates a name.
4. **minimal** — plain glyphs in the footer's muted ink, 24px glyph in a 40px target; hover/focus brightens to the footer's ink and draws a 2px bar under the glyph in the network's fill colour (decorative — the glyph's own colour never depends on a brand hex, so no contrast risk on any ground).

Nothing else in the footer moves: `Brand`'s `social` part and the layouts that draw the row themselves (`Plate`, `rule`, the standalone calls) need no change because they all call `SocialLinks`.

## Console
- `web/src/app/admin/(app)/settings/settings-copy.ts` (~lines 868–876): the `social_style` hint becomes style-neutral ("How the footer shows your social profiles…"), and the `social_flip_word` hint says it applies to Flip tiles only. The select itself is built from the API's options — no list in TypeScript.

## Docs (in the 0.191.0 docs task)
`docs/site-chrome.md` (the social section: the six styles, the fill tokens and why they are graded), CLAUDE.md "The public site's chrome" line about the footer's social links, `API.md` (the `social_style` values), `manual/18-settings.md` (the style choice), VERSION.md 0.191.0 bullet.

## Execution
Folded into the hero-slider SDD run as a new task before its docs task: implementer (API options + test; social-links.tsx four styles; globals.css tokens and rules; settings-copy hints), task review, fix rounds as needed. Then the existing 0.191.0 docs + gate task covers it.

## Verification
- API: `php artisan test --filter=SocialStyleSettingsTest`; Larastan/Pint on the controller.
- Web: `npx tsc --noEmit`, eslint on touched files; `npm run themes` if any palette file changes (it should not — tokens live in globals.css).
- Probe `web/scripts/probes/social-styles.mjs` (committed; env sign-in only): sets `social_style` to each of the six in turn (restoring the original after), with at least four profile URLs set, and on `/theme-preview/<id>` for all 14 themes at 360×800 and 1280×800 in light and dark: the footer's social links exist, each ≥24×24 px, `scrollWidth <= innerWidth`, the hover state on one link applies (computed style changes), and under `reducedMotion: 'reduce'` no transition runs.
- Contrast: each new fill token measured white-on-fill ≥ 3:1 (a small table in docs/site-chrome.md); then `npm run audit` light and `AUDIT_SCHEME=dark` and `npm run audit:mobile` on the homepage and a few public routes with the circles and pills styles active (the footer is on every page) — zero failures. These run against a production build in the 0.191.0 gate.
