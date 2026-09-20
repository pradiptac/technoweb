import type { MouseEvent, SyntheticEvent } from "react";

/**
 * The two halves of the `data-closed` contract a hover panel's host keeps.
 * Shared by `SiteHeader` and any theme's chrome that hosts the same panels;
 * the CSS side is `PANEL_CLASSES` in `mega-menu.tsx`. The notes below are
 * the header's, moved with the functions on 2026-09-16.
 */
/*
 * The mega panel is opened by CSS alone — `group-hover` and
 * `group-focus-within` on the `<li>` — which needs no state and is right until
 * somebody clicks a link inside it. The header lives in the layout, so a
 * client-side navigation never remounts it: the clicked link is still
 * `document.activeElement` and the pointer is still over the panel, so both
 * conditions hold and the panel sat open over the page it had just navigated
 * to. Measured: `visible` after the route changed, and still `visible` after
 * the mouse moved away, because focus never left the link.
 *
 * So a click on any link in the group marks it `data-closed` — the panel's
 * variants are `group-[:hover:not([data-closed])]`, so hover and focus both
 * stop counting — and blurs the link, which is what a full page load would
 * have done to focus anyway.
 *
 * The mark is lifted when the pointer **enters the trigger link**, and not
 * when it leaves the `<li>`, which was the first cut and a feedback loop:
 * hiding the panel removes the element under the cursor, so the browser
 * fires `pointerleave` on the `<li>` *because of* the close, the handler
 * released the mark, and the panel came straight back. Firefox does that
 * synchronously and showed it on every click; Chromium's synthesised move
 * came 300ms later, after the pointer had a page under it, so it only looked
 * fixed there. The trigger's own visibility never changes, so entering it
 * cannot be caused by anything this code does — and it is also the one
 * gesture that unambiguously means "open it again". Focus into the group
 * lifts it too (`onFocus` is `focusin`, so any descendant counts), or a
 * keyboard user who never touches the pointer would find the panel closed to
 * Tab for good.
 */
export function closePanelOnNavigate(e: MouseEvent<HTMLElement>) {
  const link = (e.target as HTMLElement).closest("a");
  if (!link || !e.currentTarget.contains(link)) return;
  e.currentTarget.dataset.closed = "";
  link.blur();
}

// The host is found by attribute rather than by tag: the header's hosts are
// `<li>`s and the top bar's are `<div>`s, and a `closest("li")` from a top-bar
// link would walk up to nothing and release nothing — a panel closed by a
// click that never opened again.
export function releasePanel(e: SyntheticEvent<HTMLElement>) {
  delete (e.currentTarget.closest("[data-panel-host]") as HTMLElement | null)?.dataset.closed;
  // A panel is (about to be) open: mark the nav so the *next* host's panel
  // arrives without a transition. See `markPanelSwap` below.
  stampSwap(e.currentTarget);
}

/*
 * Moving from one panel to the next is a swap, not a close and an open.
 *
 * The client saw the menu "flicker" between Solutions and Products
 * (2026-09-17, twice). The first fix made the panel being *left* vanish at
 * once; measured afterwards, the panel being *entered* still faded in from
 * nothing -- and a CSS transition holds its start value until its first
 * frame, so for a frame or more after the hover there was no panel at all,
 * then a 150ms fade. Blank, then fade, is a flicker.
 *
 * So while a panel is open its `<nav>` carries `data-panel-swap`, and while
 * that is there `globals.css` gives a hovered host's panel no arrival
 * transition: it is simply painted, the frame the pointer lands.
 *
 * **The stamp has to be there before the pointer arrives**, which is the
 * part the first cut of this got wrong. Blink updates `:hover` and recalcs
 * style *before* it dispatches the boundary events, so a stamp written from
 * the old host's `pointerleave` landed after the new panel's transitions
 * had already been created with their 150ms -- measured: three transitions
 * "running" at `currentTime 0`, the panel still hidden 90ms in, and the
 * same jump painted at t+0 once the nav was stamped in advance. Hence the
 * stamp is written by `releasePanel`, on the trigger's `pointerenter` of the
 * panel that is *already* open, and `markPanelSwap` on the host's
 * `pointerleave` only schedules its removal, 300ms out. Within that window
 * the next host's hover recalc finds it; past it -- the pointer left the
 * nav altogether -- the exit fade and the next fresh open's fade are back.
 * The timer lives in a WeakMap keyed on the nav, because a second leave
 * inside the window has to extend it, not stack a second one.
 */
const swapTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

function stampSwap(from: HTMLElement) {
  const nav = from.closest("nav");
  if (!nav) return;
  const pending = swapTimers.get(nav);
  if (pending) clearTimeout(pending);
  swapTimers.delete(nav);
  nav.dataset.panelSwap = "";
}

export function markPanelSwap(e: SyntheticEvent<HTMLElement>) {
  const nav = e.currentTarget.closest("nav");
  if (!nav) return;
  const pending = swapTimers.get(nav);
  if (pending) clearTimeout(pending);
  swapTimers.set(nav, setTimeout(() => { delete nav.dataset.panelSwap; swapTimers.delete(nav); }, 300));
}
