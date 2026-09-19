# 005 — The mobile drawer's section unfolds

- **Status**: DONE
- **Commit**: cf293f2
- **Severity**: MEDIUM
- **Category**: State indication — the chevron already promises it
- **Estimated scope**: 2 files — `globals.css` (one rule set), `components/layout/mobile-drawer.tsx`

## Problem

In the drawer, a section's chevron rotates over `--duration-base`
(`mobile-drawer.tsx:293`) while the list it reveals is a conditional render
that mounts in one frame — measured at 390px: 90px → 528px between two
consecutive frames. Every theme's header opens this drawer.

```tsx
// web/src/components/layout/mobile-drawer.tsx:299-309 — current
{section && isOpen && (
  /* … comment … */
  <DrawerItems items={section.items} onNavigate={() => onClose()} />
)}
```

## Target

The subtree unfolds: a grid wrapper whose row goes `0fr → 1fr` with opacity,
over `--duration-base` `--ease-brand`, from `@starting-style`; folding is the
same back over `--duration-exit` `--ease-exit`, after which the subtree
unmounts (so the closed drawer's DOM, focus order and the audit's counts are
exactly what they are today). Vertical only — the drawer is a
`translate-x-full` panel and nothing may widen the document.

```css
/* web/src/app/globals.css — target, in the arrivals block */
.unfold {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows var(--duration-base) var(--ease-brand), opacity var(--duration-base) var(--ease-brand);
}
.unfold > * { min-height: 0; overflow: hidden; }
@starting-style { .unfold { grid-template-rows: 0fr; opacity: 0; } }
.unfold[data-leaving] {
  grid-template-rows: 0fr;
  opacity: 0;
  transition: grid-template-rows var(--duration-exit) var(--ease-exit), opacity var(--duration-exit) var(--ease-exit);
}
```

```tsx
// mobile-drawer.tsx — target
// inside the .map, where `isOpen` is computed:
const presence = sectionPresence[key]   // see Steps — one usePresence per section is not possible in a map,
                                        // so the section list is rendered by a small child component
```

Because hooks cannot be called inside `.map`, the row becomes its own
component: `DrawerSection` receives `{ isOpen, section, … }`, calls
`usePresence(isOpen)`, and renders:

```tsx
{section && mounted && (
  <div className="unfold" data-leaving={leaving || undefined}>
    <div><DrawerItems items={section.items} onNavigate={onNavigate} /></div>
  </div>
)}
```

## Repo conventions to follow

- `usePresence` from `web/src/lib/hooks/use-presence.ts` (plan 002).
- Tokens only; arrivals `base`/`brand`, exits `exit`/`exit`.
- Start state inside the `no-preference` guard; under `reduce` the section is present or absent, as today.
- The drawer's own panel is the exemplar for "exit shorter than arrival" (`mobile-drawer.tsx:184-211`).
- The file's own comment on the subtree ("The whole subtree, not one level of it…") must survive the move.

## Steps

1. `globals.css`: add the `.unfold` rules to the arrivals block.
2. `mobile-drawer.tsx`: extract the `<li>` body of the primary-nav `.map` into a `DrawerSection` component in the same file (props: the item, `section`, `isOpen`, `onToggle`, `onClose`), preserving every class, `aria-*` and comment. Inside it, `const { mounted, leaving } = usePresence(isOpen);` and render the subtree as in **Target**.
3. Confirm the `expanded`/`setExpanded` state stays in the parent (only one section open at a time is a property of that state).

## Boundaries

- Do NOT change the drawer panel's own transitions, the focus hand-off, `inert`, or the scroll lock.
- Do NOT animate horizontally.
- Do NOT keep the subtree mounted after the fold completes.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npm run lint`; `npm run audit:mobile` (covers the drawer) clean; `node scripts/probes/drawer-focus.mjs` still passes (focus hand-off unchanged).
- **Feel check**: at 390px open the menu, tap a section's chevron: the links unfold over ~200ms in step with the chevron; tap again: they fold over ~140ms and the chevron turns back. Tap a different section while one is open: the old folds as the new unfolds (two transitions, no jump). No horizontal scroll at any point (`documentElement.scrollWidth === innerWidth`).
- **Reduced motion**: appears/disappears instantly.
- **Done when**: a frame sample of the unfolding wrapper shows the height climbing across several frames; `documentElement.scrollWidth` never exceeds `innerWidth` mid-flight; the closed section's links are absent from the DOM 200ms after closing.
