# 006 — Fixed-bottom surfaces enter and leave through the edge they sit on

- **Status**: DONE
- **Commit**: cf293f2
- **Severity**: LOW
- **Category**: Spatial consistency
- **Estimated scope**: 4 files — `globals.css` (one rule set), `components/product/compare.tsx`, `components/portal/ticket-live.tsx`, `components/layout/cookie-consent.tsx`

## Problem

Three surfaces pinned to the bottom of the viewport mount and unmount with no
edge to come from:

```tsx
// web/src/components/product/compare.tsx:54-57 — current (measured: full opacity on frame 0)
if (items.length === 0) return null;
return (
  <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4" data-compare-tray>
    <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-line-strong bg-card px-3 py-2 shadow-float">
```

```tsx
// web/src/components/portal/ticket-live.tsx:90-93 — current (judged from code)
if (fresh === 0) return null;
return (
  <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center">
    <button … className="pointer-events-auto rounded-full bg-brand-600 …">
```

```tsx
// web/src/components/layout/cookie-consent.tsx:29,45 — current (judged from code: no analytics id on this install)
if (choice !== null) return null;
…
<div role="region" aria-label={title} className="fixed inset-x-0 bottom-0 z-50 border-t …">
```

## Target

Enter: `translate 0 100% → 0` with opacity over `--duration-slow`
`--ease-brand` (a surface, so the modal/drawer budget); leave the same way over
`--duration-exit` `--ease-exit`, then unmount. Percentages, never pixels — the
box's own height is the distance.

```css
/* web/src/app/globals.css — target, in the arrivals block */
.rise-in {
  transition: opacity var(--duration-slow) var(--ease-brand), translate var(--duration-slow) var(--ease-brand);
}
@starting-style { .rise-in { opacity: 0; translate: 0 100%; } }
.rise-in[data-leaving] {
  opacity: 0;
  translate: 0 100%;
  transition: opacity var(--duration-exit) var(--ease-exit), translate var(--duration-exit) var(--ease-exit);
}
```

Each component: `const { mounted, leaving } = usePresence(<present>)`; render
while `mounted`; put `rise-in` and `data-leaving={leaving || undefined}` on the
*visible box* (the tray's inner card, the pill's button, the banner's root),
leaving the `pointer-events-none` wrappers as they are.

## Repo conventions to follow

- `usePresence` (plan 002); tokens only; start state inside the `no-preference` guard.
- `translate`, never `transform`.
- The cookie banner's first client render already knows the stored choice through `useSyncExternalStore`, so a returning visitor never sees it arrive — `usePresence` initialises from its first `present` value and only animates a *change*.

## Steps

1. `globals.css`: add the `.rise-in` rules to the arrivals block.
2. `compare.tsx` `CompareTray`: `const { mounted, leaving } = usePresence(items.length > 0); if (!mounted) return null;` — add `rise-in` and `data-leaving` to the inner `pointer-events-auto` card. The tray's *contents* while leaving are whatever the last render had; that is fine for 140ms.
3. `ticket-live.tsx` `ThreadRefresh`: `usePresence(fresh > 0)`; same on the `<button>`.
4. `cookie-consent.tsx`: `usePresence(choice === null)`; `rise-in` + `data-leaving` on the root `<div role="region">`.

## Boundaries

- Do NOT change what the surfaces say or do, their z-indexes, or the pill's `scrollIntoView`.
- Do NOT touch the compare store (`lib/compare.ts`) or the consent store.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npm run lint`; `MSYS_NO_PATHCONV=1 node scripts/audit.mjs /products` clean; `node scripts/probes/compare.mjs` still passes.
- **Feel check**: on `/products`, tick Compare on a card: the tray rises from below the viewport over ~300ms; untick the last one: it drops out over ~140ms. In the portal, a ticket thread's "New reply" pill rises the same way (simulate by letting the 60s refresh find a new reply, or temporarily set `fresh`). With an analytics id set, the cookie banner rises on first visit and drops on Accept/Reject.
- **Reduced motion**: present or absent, instantly.
- **Done when**: a frame sample of `[data-compare-tray] > div` right after the first tick reads `translate` non-zero on frame 0 and `0px` after ~300ms; the tray is absent ~140ms after the last untick.
