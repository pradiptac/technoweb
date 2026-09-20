# 007 — Tab panels crossfade in (theme fronts and the top bar)

- **Status**: DONE
- **Commit**: cf293f2
- **Severity**: LOW
- **Category**: Missed opportunity — preventing a jarring change
- **Estimated scope**: 3 files — `themes/enterprise/service-tabs.tsx` (also drawn by Keystone), `themes/summit/catalogue-tabs.tsx`, `components/layout/top-bar-panel.tsx`; uses `.settle-in` from plan 002

## Problem

Three tabbed controls swap a picture and a paragraph, or a card grid, in one
frame. Measured on the Keystone and Summit previews: the entering panel goes
`hidden` → 375px / 447px at `opacity: 1` between two frames; the only
transitions running are the tab buttons' colours.

```tsx
// web/src/themes/enterprise/service-tabs.tsx:62-68 — current
<div key={s.slug} role="tabpanel" id={`${id}-panel-${i}`} aria-labelledby={`${id}-tab-${i}`}
  hidden={i !== active}
  className="grid items-center gap-8 pt-8 lg:grid-cols-2 lg:gap-14"
>
```

```tsx
// web/src/themes/summit/catalogue-tabs.tsx:58-64 — current
<ul key={g.id} role="tabpanel" id={`${id}-panel-${i}`} aria-labelledby={`${id}-tab-${i}`}
  hidden={i !== active}
  className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
>
```

```tsx
// web/src/components/layout/top-bar-panel.tsx:170-177 — current
className={cn(
  "content-start gap-0.5 p-2.5",
  …
  pane.key !== activeKey && "invisible h-0 overflow-hidden py-0",
)}
```

## Target

Only the *entering* panel animates: `opacity 0 → 1`, `translate 0 4px → 0`
over `--duration-base` `--ease-brand`. The leaving panel is `hidden` in the
same frame — a two-way crossfade needs both in flow, which the `hidden`
design (every panel rendered, pictures pre-decoded, all copy readable by a
crawler) rightly avoids. `.settle-in`'s `@starting-style` fires whenever an
element goes from `display: none` to rendered, which is exactly what removing
`hidden` does, so the two theme controls need only the class.

The top-bar panes never leave `display`, so `@starting-style` cannot fire for
them; they get `opacity-0` while inactive and the class's transition carries
them to 1 on switching. The leaving pane is `invisible h-0` at once, as today.

```tsx
// service-tabs.tsx and catalogue-tabs.tsx — target
className="settle-in grid items-center gap-8 pt-8 lg:grid-cols-2 lg:gap-14"
className="settle-in mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"

// top-bar-panel.tsx — target
className={cn(
  "settle-in content-start gap-0.5 p-2.5",
  …
  pane.key !== activeKey && "invisible h-0 overflow-hidden py-0 opacity-0",
)}
```

## Repo conventions to follow

- `.settle-in` (plan 002) — tokens, guard, `translate` not `transform`.
- The top bar's `panel-drop` swap rule (`nav[data-panel-swap] … { transition-duration: 0s }`) is about moving between two *panels*, not the panes inside one; it targets `.panel-drop` and does not reach the pane, so the two do not fight.
- Keep `hidden` on the theme tabs and `invisible h-0` on the panes — no structural change.

## Steps

1. `service-tabs.tsx`: prepend `settle-in ` to the tabpanel's className.
2. `catalogue-tabs.tsx`: prepend `settle-in ` to the tabpanel's className.
3. `top-bar-panel.tsx`: prepend `settle-in ` to the pane's base classes and add `opacity-0` to the inactive class string.

## Boundaries

- Do NOT add exit motion, a sliding indicator, or a height animation.
- Do NOT touch the tab buttons, keyboard handling or ARIA.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npm run lint`; `MSYS_NO_PATHCONV=1 node scripts/audit.mjs /` clean under the Enterprise, Keystone and Summit previews (`/theme-preview/<id>`, signed in) and `node scripts/probes/top-bar-panel.mjs` still passes.
- **Feel check**: on the Keystone or Enterprise front, click the second service tab: the new picture-and-paragraph settles in over ~200ms; arrow keys between tabs: same, never restarting from zero mid-way. Summit's catalogue grid: same. In the top bar's panel, hovering another tab fades its cards in.
- **Reduced motion**: instant, opaque.
- **Done when**: a frame sample of the entering `[role="tabpanel"]` reads `opacity < 1` on frame 0 after the click in Chromium.
