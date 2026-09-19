# Animation-opportunity audit — 2026-09-20

A sweep of the whole frontend — the public site under all twelve themes, the
customer portal and the admin console — for moments that would genuinely
benefit from motion, run with Emil Kowalski's `find-animation-opportunities`
skill. The skill is a filter as much as a finder: every candidate has to
survive four questions (how often is it seen, what is the motion *for*, can it
stay inside 300ms, does it help or hinder on this kind of UI), and most do
not. It proposes; it does not implement, and nothing under `web/src/` changed
for this document. Its sibling, `review-animations`, is for judging motion that
already exists — a few of those questions came up on the way and are handed
over at the end rather than answered here.

The premise is "you don't need animations": a short list of high-conviction
seams beats a wishlist, and daily use argues for less motion, not more.

> **Implemented the same day, 0.69.0.** All seven rows shipped as the plans in
> [`animation-plans/`](animation-plans/README.md) and were verified mid-flight in
> both motion modes; the note in `docs/motion.md` ("Nothing arrives at full
> opacity in the frame it was asked for") is the standing rule.

## Method

**Sampled in a browser** (Playwright against the running dev server, live
theme `sentinel`, `motion_reveal=lift`, `motion_buttons=shine`,
`motion_page=fade`). Each seam was triggered and its target read on the first
frames after the trigger — computed `opacity`, `translate`, `scale`, box
height, `transition-property`, and `document.getAnimations()` — so "snaps"
below means *measured arriving in one frame with no transition on the
element*, not inferred from a class name:

- FAQ `<details>` open on `/solutions/networking`; the mobile drawer's section
  accordion at 390px; the header search's listbox at 1900px (Sentinel hides it
  below that); Add to basket on `/store/products/fortinet-fortigate-40f`; the
  refused submit's `Alert` on `/contact`; the compare tray on `/products`;
  `.btn` under the pointer, hovered and mid-press.
- Every theme's preview (`/theme-preview/<id>` and `/specimen`, signed in as a
  throwaway content manager, deleted after): running animations at rest after
  settle, a tile hovered, a button pressed, the phone drawer opened; and the
  tab switch on the Enterprise, Keystone and Summit fronts.

**Judged from code**, and said so in the row: the cookie-consent banner (this
install has no analytics ID, so it never mounts), the portal's ThreadRefresh
pill (no portal session in this run), the chat thread's message entrance
(sent, but the sampler's selector did not catch the new node), and the whole
console — where the seams are `hidden`-attribute toggles, which cannot
transition by construction, and where the frequency gate decides the answer
before feel could.

**The vocabulary every recipe extends** (`web/src/app/globals.css` `@theme`):
`--duration-fast/base/slow/exit` = 150/200/300/140ms, `--ease-brand` =
`cubic-bezier(.2,.7,.3,1)`, `--ease-exit` = `cubic-bezier(.4,0,1,1)`; the
`@starting-style` + `transition-behavior: allow-discrete` pattern already in
`dialog-motion` (globals.css ~2577–2616); the `data-leaving` + wait-out-the-exit
pattern in `components/store/cart-line-controls.tsx:95-107`. One repo rule
shapes every reduced-motion line: the global `prefers-reduced-motion: reduce`
block sets `animation: none; transition: none` on everything, so **a hidden
start state must live only inside `@media (prefers-reduced-motion:
no-preference)`** or it stays hidden for those users. "Gentler under
reduce" therefore means "static and visible", which is what each recipe says.

## Part 1 — Opportunities

Ordered by leverage. Each is one change in one shared file that reaches every
theme, because the twelve themes share every component named here.

| # | Location | Today (measured) | Purpose | Frequency | Suggested motion |
|---|---|---|---|---|---|
| 1 | `web/src/components/ui/faq.tsx:17-29` — the FAQ `<details>` on every solution, service and product page, in all twelve themes | The answer is at full height on the first frame after the click. The only transitions running are the summary's background colour and the plus icon's `rotate` — the icon animates, the panel it points at does not | Preventing a jarring change | Occasional | One rule in `globals.css`, inside `no-preference`: `details.group { interpolate-size: allow-keywords }` and `details.group::details-content { height: 0; opacity: 0; overflow: clip; transition: height var(--duration-base) var(--ease-brand), opacity var(--duration-base) var(--ease-brand), content-visibility var(--duration-base) allow-discrete }`, with `details.group[open]::details-content { height: auto; opacity: 1 }`. Progressive: a browser without `::details-content` keeps today's snap. Under reduce: nothing — the panel opens as it does now |
| 2 | `web/src/components/ui/alert.tsx:89` — the inline `Alert`, mounted by 81 `{state.error && …}` / `{state.ok && …}` sites; every public form's refusal (`/contact` measured) and every success screen (`components/forms/enquiry-form.tsx:20-25`, `form-block.tsx:34-37`, `careers/[slug]/apply-form.tsx:37-41`, the portal's `?created=1` on `tickets/[reference]/page.tsx:57`) | Appears at `opacity: 1`, no transform, no `transition-property` on frame 0. On success the whole form is replaced by the box in the same frame. Dismiss returns `null` (line 66) | Preventing a jarring change; spatial — it belongs to the form it sits above | Occasional (a refusal) to rare (a success) | In `no-preference`: `@starting-style { opacity: 0; translate: 0 4px }` → settled (4px *up* into place — the site's own `fade-up` idiom at a fraction of its distance), `transition: opacity var(--duration-base) var(--ease-brand), translate var(--duration-base) var(--ease-brand)`. Only on the inline render — the toast bridge (`asToast`) already has the toast's motion. Dismiss leaves the same way it came: `opacity: 0; translate: 0 4px` over `var(--duration-exit) var(--ease-exit)`, unmounting on the transition's end (the toast's `EXIT_MS` shape at `toast.tsx:188-205`). `role="alert"`/`"status"` untouched. Under reduce: mounts visible, as today |
| 3 | `web/src/components/ui/button.tsx:104-112` — the `.btn` shared class, every button and `ButtonLink` in the product | Hovered: `translate: 0 -1px`. Mid-press: `translate: 0 -1px`, `scale: none` — identical to hover. No `:active` rule for `primary`, `secondary`, `ghost`, `destructive`, `warn`, `onDark`; only `soft` presses (line 85-87), and `scale` only when that motion family is chosen (globals.css ~957-959). Measured on the live `shine` family and on Enterprise, Keystone and Summit | Feedback | Tens/day → near-imperceptible only | One unlayered rule beside the motion families: `.btn:active:not(:disabled) { scale: .98; translate: 0; transition: scale var(--duration-fast) ease-out, translate var(--duration-fast) ease-out }`. `translate: 0` matters — pressing a button while it is lifted by hover reads wrong. Skip `[data-motion-buttons="flat"]` (that family means no button motion) and `[data-motion-buttons="scale"]` (already `.97`). Release follows the base 200ms `transition-all`, which is fine — leaving can be slower than arriving here. `.98`, matching `shimmer-button.tsx:20`; never `.95` |
| 4 | `web/src/components/layout/site-search.tsx:137-145` and `components/store/store-search.tsx:152-160` — the search suggestions listbox | Toggled with `hidden`; the box carries no `transition-property` (`all 0s` computed). Height 0 → populated in one frame | Spatial consistency — it grows out of the input | Occasional (a search is a task, not chrome) | Replace the `hidden` toggle with `display` under `transition-behavior: allow-discrete`: closed `opacity: 0; scale: .98; display: none`, `@starting-style` the same, open `opacity: 1; scale: 1`, `transform-origin: top right` (site) / `top left` (store); in `var(--duration-fast) var(--ease-brand)`, out `var(--duration-exit) var(--ease-exit)`. `aria-expanded` and the `hidden` semantics stay (use `[hidden]` selectors or `inert`). No per-item motion — the rows re-render on every keystroke, which is the typing tier |
| 5 | `web/src/components/layout/mobile-drawer.tsx:299` — a section's links under the drawer's accordion, `{section && isOpen && <DrawerItems/>}` | Measured: the list goes from 90px to 528px between two consecutive frames while the chevron beside it rotates over 200ms — the control promises a motion the panel does not deliver | State indication (the chevron has already started it) | Occasional (phone navigation) | Keep the subtree mounted and wrap it: `grid transition-[grid-template-rows,opacity] duration-(--duration-base) ease-brand`, `grid-rows-[0fr] opacity-0` closed / `grid-rows-[1fr] opacity-100` open, inner `min-h-0 overflow-hidden`, and `inert` while closed so the hidden links cannot take focus (the drawer already uses `inert` on its own closed panel). Vertical only — the drawer sits in a `translate-x-full` container and nothing may widen the document. Under reduce: `grid-rows-[1fr]` applies at once |
| 6 | Fixed-bottom surfaces: the compare tray `web/src/components/product/compare.tsx:54-57`; the portal's ThreadRefresh pill `components/portal/ticket-live.tsx:90-93`; the cookie banner `components/layout/cookie-consent.tsx:29,45` | Tray measured: mounts at full opacity on the first tick, unmounts on the last untick with no exit. Pill and banner judged from code — both `return null` on one side and mount `fixed` on the other | Spatial consistency — a surface pinned to an edge should enter and leave through that edge | Occasional (tray, pill) / rare (banner, once) | `@starting-style { translate: 0 100%; opacity: 0 }` → `translate: 0 0; opacity: 1` over `var(--duration-slow) var(--ease-brand)`; leave the same way over `var(--duration-exit) var(--ease-exit)`, which for the tray means the `data-leaving` + wait pattern from `cart-line-controls.tsx:95-107` before the last item's `return null`. Percentages, never pixels, so the box's own height is the distance. Under reduce: static. The pill's `pointer-events-none` wrapper is untouched |
| 7 | The themed tab controls: `web/src/themes/enterprise/service-tabs.tsx:64-67` (Enterprise and Keystone fronts), `themes/summit/catalogue-tabs.tsx:60-63`, and the top bar's panes `components/layout/top-bar-panel.tsx:176` | Measured on Keystone and Summit: the entering panel goes `hidden` → 375px / 447px at `opacity: 1` in one frame; the ten-plus transitions running at that moment are the tab buttons' colours. Every panel is rendered and the inactive ones are `hidden`, deliberately | Preventing a jarring change — a picture and a paragraph swap under the pointer | Occasional (a front page, a few presses per visit) | Crossfade the *entering* panel only: `[role="tabpanel"]:not([hidden]) { @starting-style { opacity: 0; translate: 0 6px } transition: opacity var(--duration-base) var(--ease-brand), translate var(--duration-base) var(--ease-brand) }`. No exit — the leaving panel is `hidden` in the same frame and a two-way crossfade needs both mounted in flow, which the `hidden` design rightly avoids. Keep `hidden`; a `@starting-style` on the un-hidden state is enough. The top-bar panes use `invisible h-0` for the same reason and take the same rule. Under reduce: static |

All seven animate `opacity` and `transform`-family properties (`translate`,
`scale`, and `height` only where the browser interpolates it natively) — the
Tailwind v4 rule in `CLAUDE.md` applies: transition `translate`/`scale`, never
`transform`, when a v4 utility set the value. None involves hover, so no
`(hover: hover)` gating is needed; row 3 is `:active`, which is a press on
every pointer.

## Part 2 — Rejected candidates

Considered, with evidence, and deliberately not proposed. This is the half that
keeps the list above from being a wishlist.

- `web/src/app/admin/(app)/command-palette.tsx:154-162` — the console's Ctrl/⌘ K
  palette. **Rejected: keyboard-initiated, 100+ times a day. Never animate.**
  It currently carries `dialog-motion` (a 200ms scale-and-fade in, 140ms out),
  which is the opposite question — see the hand-off in Part 3.
- `web/src/app/admin/(app)/admin-nav.tsx:203` (sidebar accordion, `hidden`
  toggle beside a rotating chevron — the drawer's seam, one area over) and
  `components/admin/tabs.tsx:172-223` (entity-form tabs: `hidden` panels, no
  sliding indicator). **Rejected: the console is worked for hours a day; these
  are tens to hundreds of presses a day.** The same seam that earns a row on
  the public site earns nothing here, and the file's own comment ("hidden, not
  unmounted") is a performance decision the gate agrees with.
- Count-up on the console's `StatTile` (`components/admin/stat-tile.tsx:56`),
  the basket count (`components/store/basket-bar.tsx:126-149`) and the compare
  tray's "Comparing N of 4". **Rejected: functional data the user is reading.**
  A number that rolls is a number that has to be waited for. The public
  `CountUp` sites are marketing figures and stay as they are.
- `web/src/components/store/add-to-basket.tsx:134-154` — the Button →
  "Added · View basket" swap, measured arriving in one frame. **Rejected:
  feedback must be immediate, and a crossfade would delay the one word the
  press is waiting for.** The basket ring already pulses on the count
  (`basket-bar.tsx:114-123`); that is the bridge.
- `web/src/components/chat/chat-widget.tsx:491-571` — messages, chips and the
  lead form appending with no entrance. **Rejected: tens of times within one
  conversation, and the typing dots (`chat-message.tsx:171-172`) already bridge
  the wait.** A slide-in per bubble is what makes a chat feel slower than it is.
- The ~25 `window.confirm` deletes in the console, and the media library's
  plain `Dialog` (`app/admin/(app)/media/item-menu.tsx:155-231`). **Rejected:
  hold-to-confirm on top of a confirm dialog is a double confirmation** — the
  slip it prevents is already prevented. The `Dialog` lacking the
  `dialog-motion` every other confirm has is a consistency note for
  `review-animations`, not an opportunity.
- Per-item stagger on the index grids that reveal as one block
  (`solutions`, `services`, `industries`, `case-studies`, `knowledge-base`,
  `clients`, `team`… each a single `data-aos="fade-up"` on the container).
  **Rejected: function.** The client's verdict of 2026-09-15 — a reveal on
  every section "reads generated" — is the finding this skill would have
  made; the three grids that do stagger (`product-grid.tsx:44`, `brands`,
  `locations`, 75/150ms) are the ceiling, not the floor.
- `components/ui/input.tsx:56-58,103-105` — the `Field` error paragraph
  appearing under a control. **Rejected: the typing tier.** It appears on blur
  and on every keystroke of a re-validation; the input's own `aria-invalid`
  ring already transitions over `--duration-base`.
- `app/admin/(app)/menus/menu-builder.tsx:249-275` — a FLIP on the drag-reorder.
  **Rejected: console, tens/day, and the `over`/`dragging` colour states are
  the feedback that matters.**

## Part 3 — Verdict

This interface needs very little more motion than it has, and most of what it
has is right for the reasons this skill would give: the dialogs, toasts,
drawer, popup, mega menu and sliders all enter and leave on the repo's own
tokens; the homepage's sections were stopped from revealing by the client
before this audit could suggest it; the console — the surface used most — is
almost entirely static, which is correct. What the sweep found is one family
of defect repeated across shared components: **state that teleports**. A
`hidden` toggle, a `return null`, a conditional render — each is a thing that
arrives at full opacity in the same frame it was asked for, on surfaces seen
occasionally, where a 150–200ms bridge is what separates "it responded" from
"it flickered". Seven rows, seven files, and every theme inherits all of them.

The highest-leverage row is **#1, the FAQ `<details>`**: it is on every
detail page of the marketing catalogue in all twelve themes, it is the one
place a control (the rotating plus) already promises a motion its panel does
not deliver, it is a single CSS rule with a built-in fallback, and it touches
no component code. **#2, the `Alert` entrance**, is the broadest — 81 mount
sites and every success screen in one change — and the one place this product
renders its rare, end-of-task moments flat. If a delight-budget item is wanted
at all, it belongs there and nowhere else: a check glyph that draws itself
once when "Message sent" appears — `pathLength="1"`, `stroke-dasharray: 1`,
`stroke-dashoffset: 1 → 0` over 600ms `--ease-brand` through
`@starting-style`, server-rendered, no library (animate-ui's `icons-check`
with `animateOnView` and `strokeWidth={1.7}` is the ready-made version, at the
cost of a client island). It was not given a row because it is optional, and
because the enquiry, application and ticket screens are the *only* tier where
it passes.

Three things this sweep saw that belong to `review-animations`, handed over
rather than ruled on: the command palette's `dialog-motion` on a
keyboard-initiated surface; the media library's `Dialog` opening and closing
without the motion every other confirm has; and the at-rest animation count
on two fronts — Summit runs **52** animations continuously and Vantage **57**
(the `bob` strip mode, one per logo, on top of the marquee, the aurora and the
cart burst), against 5–12 on every other theme. Decoration that never stops is
the case the repo's "three times and stop" rule was written for.

To turn any row into work: `improve-animations plan <row>` — for example
`improve-animations plan FAQ details open/close (row 1)`.

## Per theme

Every theme shares the seven rows above; the second column is what is
specific to it. "At rest" is `getAnimations()` running after the page settled,
home / specimen, with the cart burst (4), the brand marquee (1+) and the
assistant launcher present on all of them.

| Theme | Theme-specific seam | At rest |
|---|---|---|
| classic | None. The base for rows 1–6 | 15 / 9 (aurora ×3, retro grid, shimmer) |
| editorial | None; its own transitions are `filter` and `text-decoration-color` on tokens | 11 / 5 (vertical marquee ×5) |
| datacenter | None | 11 / 8 |
| launch | None; the `lens` strip runs 6 loops | 12 / 5 |
| terminal | None; the ticker is the marquee, paused by its own toggle | 11 / 7 |
| enterprise | Row 7 — `ServiceTabs` on the front (six tabs, `hidden` panels). The sampler's click did not land within its window; the component is Keystone's, whose switch was measured | 12 / 6 |
| summit | Row 7 — `CatalogueTabs` (three tabs; 0 → 447px in one frame). **At rest 52**: `strip-bob` ×40 on the trust strip, for `review-animations` | 52 / 8 |
| horizon | None (classic child) | 11 / 6 |
| canvas | None (classic child) | 7 / 9 |
| sentinel | None; the header hides the search below 1900px, so row 4 applies from there; `sentinel-breathe` runs once | 11 / 9 |
| vantage | None beyond the shared rows; the glass→solid header already transitions. **At rest 57**: `strip-bob` ×48, for `review-animations` | 57 / 5 |
| keystone | Row 7 — `ServiceTabs` with its own pictures (0 → 375px in one frame) | 11 / 5 |

The mobile drawer (row 5) is reachable from every theme's header — all twelve
render the `mobile-menu` trigger at 390px — and the press finding (row 3) held
on every front sampled.
