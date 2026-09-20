# 004 — The search listboxes grow from the input

- **Status**: DONE
- **Commit**: cf293f2
- **Severity**: LOW
- **Category**: Physicality & origin — a popover should come from its trigger
- **Estimated scope**: 3 files — `globals.css` (one rule set), `components/layout/site-search.tsx`, `components/store/store-search.tsx`

## Problem

Both suggestion listboxes are toggled with `display: none` and carry no
transition (computed `transition-property: all 0s`; measured at 1900px on the
header search, 2026-09-20). A box that pops in under an input has no spatial
story — nothing says it came from what was typed.

```tsx
// web/src/components/layout/site-search.tsx:137-145 — current
<div id={listId} role="listbox" aria-label="Suggestions"
  className={cn(
    "absolute right-0 top-full z-50 mt-1.5 w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line-strong bg-card p-1.5 text-13-5 text-ink shadow-2",
    !expanded && "hidden",
  )}
>
```

```tsx
// web/src/components/store/store-search.tsx:156-161 — current
<ul id={listId} role="listbox" aria-label="Matching products"
  hidden={!expanded}
  className="absolute inset-x-0 top-full z-40 mt-1.5 max-h-[60vh] overflow-y-auto rounded-lg border border-line-strong bg-card p-1.5 shadow-2"
>
```

## Target

Open: `opacity 0 → 1`, `scale .98 → 1` from the top edge nearest the input
over `--duration-fast` `--ease-brand`, via `@starting-style`. Close: the same
back over `--duration-exit` `--ease-exit`, with `display` transitioned under
`allow-discrete` so the box is still painted while it fades. Both keep the
Tailwind `hidden` **class** (the store search moves from the attribute to the
class — Tailwind's preflight makes `[hidden]` `!important`, and the class is
what `site-search` already uses). No per-row motion: rows re-render per
keystroke.

```css
/* web/src/app/globals.css — target, in the arrivals block */
.popover-motion {
  opacity: 0;
  scale: .98;
  transition:
    opacity var(--duration-exit) var(--ease-exit),
    scale var(--duration-exit) var(--ease-exit),
    display var(--duration-exit) allow-discrete;
}
.popover-motion:not(.hidden) {
  opacity: 1;
  scale: 1;
  transition:
    opacity var(--duration-fast) var(--ease-brand),
    scale var(--duration-fast) var(--ease-brand),
    display var(--duration-fast) allow-discrete;
}
@starting-style { .popover-motion:not(.hidden) { opacity: 0; scale: .98; } }
```

```tsx
// site-search.tsx — target: add the class and the origin
className={cn("popover-motion origin-top-right absolute right-0 top-full …", !expanded && "hidden")}
// store-search.tsx — target: class toggle instead of the attribute, origin top
className={cn("popover-motion origin-top absolute inset-x-0 top-full …", !expanded && "hidden")}
```

## Repo conventions to follow

- The exact shape of `dialog.dialog-motion` in `globals.css` (`display … allow-discrete`, `@starting-style`, exit tokens on the closed state, arrival tokens on the open one).
- `origin-top-right` / `origin-top` are Tailwind's `transform-origin` utilities; the individual `scale` property honours `transform-origin`.
- `aria-expanded` / `aria-controls` untouched; the box is still `display: none` when closed, so the audit's overflow and tap-target counts see nothing.

## Steps

1. `globals.css`: add the three `.popover-motion` rules to the `no-preference` arrivals block.
2. `site-search.tsx`: prepend `popover-motion origin-top-right` to the listbox's class string.
3. `store-search.tsx`: remove `hidden={!expanded}`; change `className="…"` to `className={cn("popover-motion origin-top absolute inset-x-0 top-full …", !expanded && "hidden")}` (import `cn` from `@/lib/utils` if absent). Update the comment above it: still `display: none` while closed, now by class.

## Boundaries

- Do NOT animate the rows or the `active` highlight.
- Do NOT change keyboard handling, ids or ARIA.
- Do NOT touch `VanishInput` / `CyclingPlaceholder`.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npm run lint`; `MSYS_NO_PATHCONV=1 node scripts/audit.mjs / /store` clean.
- **Feel check**: at ≥1900px on Sentinel (or any width on Classic) type two letters in the header search: the box scales in from its top-right corner over ~150ms. Blur: it fades out over ~140ms before disappearing. On `/store` the box grows from its top edge. Spam-typing never restarts it from zero.
- **Reduced motion**: appears and vanishes instantly, fully opaque.
- **Done when**: a frame sample on `[role="listbox"]` right after it un-hides shows `opacity < 1` on frame 0 in Chromium, and `display: none` once closed.
