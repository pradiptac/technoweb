# 003 — `.btn` press feedback

- **Status**: DONE
- **Commit**: cf293f2
- **Severity**: MEDIUM
- **Category**: Physicality — press feedback
- **Estimated scope**: 1 file, ~8 lines of CSS

## Problem

Every button and `ButtonLink` in the product carries `.btn`
(`web/src/components/ui/button.tsx:104-112`). Hovered it lifts 1px
(`hover:-translate-y-px` on `primary`, line 10); pressed it does nothing more —
measured mid-press on the live `shine` family and on the Enterprise, Keystone
and Summit previews: `translate: 0 -1px`, `scale: none`, identical to hover.
Only the `soft` variant presses (`active:translate-y-0 active:shadow-[…]`,
lines 85-87) and only the `scale` motion family adds `:active { scale: .97 }`
(`globals.css` ~957). The press is the one moment the user is *touching* the
interface and it answers with nothing.

```css
/* web/src/app/globals.css ~943-959 — current, the motion families */
[data-motion-buttons="flat"] .btn:hover { translate: none; box-shadow: none; }
…
[data-motion-buttons="scale"] .btn:hover { translate: none; scale: 1.03; }
[data-motion-buttons="scale"] .btn:active { scale: .97; }
[data-motion-buttons="scale"] .btn:disabled { scale: none; }
```

## Target

A near-imperceptible press on every family except `flat` (which means "no
button motion") and `scale` (already `.97`): `scale: .98`, the hover lift
cancelled while pressed, over `--duration-fast`. Release follows the base
`transition-all duration-(--duration-base)` already on `.btn`, so leaving the
pressed state is the slower half — correct for a press.

```css
/* web/src/app/globals.css — target, placed immediately BEFORE the
   [data-motion-buttons="flat"] .btn:hover rule so the families' later
   equal-specificity rules win where they differ */
.btn:active:not(:disabled) {
  scale: .98;
  translate: none;
  transition: scale var(--duration-fast) var(--ease-brand), translate var(--duration-fast) var(--ease-brand);
}
[data-motion-buttons="flat"] .btn:active { scale: none; }
```

`.98`, matching `components/velora/shimmer-button.tsx:20`'s `active:scale-[0.98]`; never `.95`.

## Repo conventions to follow

- Tokens only (`--duration-fast` = 150ms, inside the 100–160ms press budget; `--ease-brand`).
- `scale`/`translate` individual properties, never `transform` (the v4 trap).
- Unlayered, beside the motion families, so it beats the `@layer utilities` `transition-all` for the pressed frame only.
- No `no-preference` guard needed: nothing is hidden; under `reduce` the global rule drops the transition and the press simply snaps to `.98` and back, which is feedback, not decoration.

## Steps

1. In `web/src/app/globals.css`, find `[data-motion-buttons="flat"] .btn:hover { translate: none; box-shadow: none; }`. Insert the two rules from **Target** directly above it, with a comment naming the measurement.

## Boundaries

- Do NOT edit `button.tsx`, the `soft` variant or `shimmer-button.tsx`.
- Do NOT change hover rules or the `scale` family's `.97`.

## Verification

- **Mechanical**: `npm run lint`; `MSYS_NO_PATHCONV=1 node scripts/audit.mjs /contact /store` clean (a pressed frame changes no colour, so contrast is unaffected).
- **Feel check**: hold the pointer down on any primary button: it settles down to 98% and its hover lift drops; release: it returns over ~200ms. Under `motion_buttons=flat` (Settings → Motion) nothing happens on press; under `scale` it still goes to `.97`.
- **Done when**: `getComputedStyle(btn).scale` reads `0.98` ~120ms into a `mousedown` on `/contact` and `none` after `mouseup`; `1` on a `flat` install.
