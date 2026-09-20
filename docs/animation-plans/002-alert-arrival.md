# 002 — The inline `Alert` arrives and leaves (and the shared pieces every later plan uses)

- **Status**: DONE
- **Commit**: cf293f2
- **Severity**: MEDIUM
- **Category**: Missed opportunity — preventing a jarring change; spatial consistency
- **Estimated scope**: 3 files — `globals.css` (one new block), `lib/hooks/use-presence.ts` (new), `components/ui/alert.tsx`

## Problem

`web/src/components/ui/alert.tsx` is mounted by 81 `{state.error && <Alert…>}` /
`{state.ok && <Alert…>}` sites — every public form's refusal and every success
screen (`components/forms/enquiry-form.tsx:20-25`, `form-block.tsx:34-37`,
`careers/[slug]/apply-form.tsx:37-41`, the portal's ticket-created notice). It
mounts at `opacity: 1` with no transform and no `transition-property`
(measured on `/contact`, 2026-09-20), and on success the whole form is replaced
by the box in the same frame. Dismissing it returns `null` at once.

```tsx
// web/src/components/ui/alert.tsx:39 and :66,89-93 — current
const [gone, setGone] = useState(false);
…
if (gone || asToast) return null;
…
<div
  role={tone === "err" ? "alert" : "status"}
  className={cn("mb-2.5 flex items-start gap-3 rounded border px-4 py-3.5 text-sm", tones[tone])}
>
```

## Target

Arrival: `opacity 0 → 1`, `translate 0 4px → 0` over `--duration-base`
`--ease-brand`, from `@starting-style` so no JS runs for it. Leaving (the ×):
the same path back over `--duration-exit` `--ease-exit`, and *then* the node
is removed. The toast bridge (`asToast`) is untouched — it already has the
toast's motion.

```css
/* web/src/app/globals.css — target: one new block after dialog-motion */
@media (prefers-reduced-motion: no-preference) {
  .settle-in {
    transition: opacity var(--duration-base) var(--ease-brand), translate var(--duration-base) var(--ease-brand);
  }
  @starting-style { .settle-in { opacity: 0; translate: 0 4px; } }
  .settle-in[data-leaving] {
    opacity: 0;
    translate: 0 4px;
    transition: opacity var(--duration-exit) var(--ease-exit), translate var(--duration-exit) var(--ease-exit);
  }
}
```

```ts
// web/src/lib/hooks/use-presence.ts — new
// { mounted, leaving }: mounted stays true for `exitMs` after `present` goes
// false (0 under reduced motion), leaving is true during that window.
```

```tsx
// web/src/components/ui/alert.tsx — target
const [dismissed, setDismissed] = useState(false);
const { mounted, leaving } = usePresence(!dismissed);
…
if (!mounted || asToast) return null;
…
<div role=… data-leaving={leaving || undefined} className={cn("settle-in mb-2.5 …", tones[tone])}>
  … <button onClick={() => setDismissed(true)} …>
```

## Repo conventions to follow

- Tokens only; exits faster than arrivals (`--duration-exit`/`--ease-exit`), the rule `dialog-motion` and the toast follow.
- Hidden start state only inside the `no-preference` guard (the global `reduce` rule would otherwise leave it at `opacity: 0`).
- `translate`, never `transform` — Tailwind v4's utilities set the individual property and the two must not fight (CLAUDE.md, "Motion and the Tailwind v4 transform trap").
- No synchronous `setState` inside an effect (`react-hooks/set-state-in-effect`). The hook derives "present just changed" during render (React's documented previous-value pattern) and only sets state from a timer.
- Exemplar for the exit-then-unmount shape: `web/src/components/ui/toast.tsx:188-205` (`EXIT_MS = 140`, `leave()`), and `components/store/cart-line-controls.tsx:95-115` for reading `prefers-reduced-motion` to shorten the wait to 0.

## Steps

1. Create `web/src/lib/hooks/use-presence.ts`:
   ```ts
   "use client";
   import { useEffect, useState } from "react";
   export const EXIT_MS = 140; // --duration-exit
   export function usePresence(present: boolean, exitMs = EXIT_MS) {
     const [prev, setPrev] = useState(present);
     const [leaving, setLeaving] = useState(false);
     if (present !== prev) { setPrev(present); setLeaving(!present); }
     useEffect(() => {
       if (!leaving) return;
       const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
       const t = setTimeout(() => setLeaving(false), reduced ? 0 : exitMs);
       return () => clearTimeout(t);
     }, [leaving, exitMs]);
     return { mounted: present || leaving, leaving: !present && leaving };
   }
   ```
2. In `web/src/app/globals.css`, directly after the `dialog-motion` block, add a commented `@media (prefers-reduced-motion: no-preference)` block containing the `.settle-in` rules above. (Plans 005 and 006 add `unfold` and `rise-in` to the same block; 001 adds the `details` rules; 004 adds `popover-motion`.)
3. In `alert.tsx`: import `usePresence`; replace `gone`/`setGone` with `dismissed`/`usePresence` as in **Target**; add `settle-in` to the root `className` and `data-leaving={leaving || undefined}`; the × sets `dismissed`.

## Boundaries

- Do NOT change the toast bridge (`asToast`, `AlertsAsToasts`) or the effect that raises the toast.
- Do NOT change `role`, `aria-label` or the dismiss button's size (the 24px is an audit rule).
- Do NOT touch the 81 call sites.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npm run lint` clean. `MSYS_NO_PATHCONV=1 node scripts/audit.mjs /contact /portal/login` clean.
- **Feel check**: on `/contact`, submit with a required field blank. The red panel settles into place from 4px below over ~200ms — it does not pop. Press ×: it fades and drops 4px over ~140ms, then the layout closes. Submit correctly (or on the mock): "Message sent" arrives the same way where the form was. DevTools Animations at 10%: `opacity` and `translate` only.
- **Reduced motion**: the panel is simply there and simply gone; never stuck invisible.
- **Done when**: a frame sample of `[role="alert"]` right after mount reads opacity < 1 on frame 0 and 1 by ~frame 12 in Chromium; the dismissed node is absent ~140ms after the click.
