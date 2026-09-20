# 001 — FAQ `<details>` opens and closes instead of snapping

- **Status**: DONE
- **Commit**: cf293f2
- **Severity**: MEDIUM
- **Category**: Missed opportunity — preventing a jarring change
- **Estimated scope**: 1 file, ~15 lines of CSS

## Problem

`web/src/components/ui/faq.tsx:17-29` renders every FAQ as a native
`<details class="group">`. The plus icon in its `<summary>` rotates 45° over
`--duration-base`, but the answer panel appears at full height on the first
frame after the click (measured 2026-09-20: 43px on frames 0–3 with only the
summary's `background-color` and the icon's `rotate` transitions running). A
control that animates while the thing it controls snaps reads as broken. This
component is on every solution, service and product page in all twelve themes.

```tsx
{/* web/src/components/ui/faq.tsx:17-29 — current, unchanged by this plan */}
<details key={f.id} className="group">
  <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4.5 …">
    {f.question}
    <svg … className="ml-auto size-4 shrink-0 text-brand-ink transition-[rotate] duration-(--duration-base) group-open:rotate-45" …>
  </summary>
  <div className="px-5 pb-5 text-14-5 leading-[1.62] text-muted">{f.answer}</div>
</details>
```

## Target

The panel's height and opacity transition over `--duration-base` on
`--ease-brand`, using the `::details-content` pseudo-element and
`interpolate-size: allow-keywords` so `height: auto` can be animated. Browsers
without `::details-content` (Firefox, Safari before 2025) keep today's snap —
the rule is purely additive.

```css
/* web/src/app/globals.css — target, inside the existing
   @media (prefers-reduced-motion: no-preference) arrivals block */
details.group { interpolate-size: allow-keywords; }
details.group::details-content {
  height: 0;
  opacity: 0;
  overflow: clip;
  transition:
    height var(--duration-base) var(--ease-brand),
    opacity var(--duration-base) var(--ease-brand),
    content-visibility var(--duration-base) allow-discrete;
}
details.group[open]::details-content { height: auto; opacity: 1; }
```

## Repo conventions to follow

- Tokens only: `--duration-base` (200ms) and `--ease-brand` (`cubic-bezier(.2,.7,.3,1)`) from `web/src/app/globals.css` `@theme`.
- The rule sits inside `@media (prefers-reduced-motion: no-preference)` — the global `reduce` block zeroes every transition, and a panel left at `height: 0` outside the guard would never open. Exemplar: `dialog.dialog-motion` in the same file.
- `height` is animated here deliberately, though the repo animates `transform`/`opacity` elsewhere: a disclosure has to move the content below it, and the native interpolation is the one case where the browser does it without layout thrash per frame.

## Steps

1. In `web/src/app/globals.css`, in the arrivals block added by plan 002 (or, if executing this plan alone, a new `@media (prefers-reduced-motion: no-preference) { … }` block placed directly after the `dialog-motion` rules), add the three rules from **Target** with a short comment naming the measurement above.

## Boundaries

- Do NOT touch `faq.tsx` — no markup change, no `open` state in React.
- Do NOT add a JS height animation or a `max-height` hack.
- Do NOT add new tokens.

## Verification

- **Mechanical**: `cd web && npx tsc --noEmit && npm run lint` — clean. `MSYS_NO_PATHCONV=1 node scripts/audit.mjs /solutions/networking` — no new failures.
- **Feel check**: open `/solutions/networking`, click a question. The answer unfolds over ~200ms and the plus rotates in step with it; click again and it folds over the same time. Spam-click: the transition retargets from wherever it is (it is a transition, not a keyframe). DevTools → Animations at 10%: `height` and `opacity` run together, the icon's `rotate` alongside.
- **Reduced motion** (Rendering panel): opens and shuts instantly, fully visible — never stuck at height 0.
- **Done when**: a Playwright sample of `details.group > div` on consecutive frames after the click shows the height climbing across frames rather than arriving in one, in Chromium; and the audit routes are clean.
