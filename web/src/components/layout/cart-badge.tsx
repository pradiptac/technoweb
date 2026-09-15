"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { IconCart } from "@/components/icons-ui";
import { useBasket } from "@/lib/basket-events";
import { cn } from "@/lib/utils";

/*
 * Whether the badge has done its job this visit, in `sessionStorage` and a
 * tiny store so the header's copy and the drawer's copy agree at once.
 */
const KEY = "tw_cart_seen";
const listeners = new Set<() => void>();
let seen: boolean | null = null;
const read = () => {
  if (seen === null) { try { seen = sessionStorage.getItem(KEY) === "1"; } catch { seen = false; } }
  return seen;
};
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
function markSeen() {
  if (read()) return;
  seen = true;
  try { sessionStorage.setItem(KEY, "1"); } catch { /* per-tab only */ }
  listeners.forEach((l) => l());
}

/**
 * The cart glyph on a brand disc, beside the Store link in the header and the
 * drawer. `className` is how the header raises it to a superscript — small,
 * at the word's top-right corner — where the drawer keeps it inline at 26px
 * beside a 56px row.
 *
 * It bids for attention the way the assistant's launcher does: an
 * eight-second cycle whose first 1.4s is a burst — the disc hops and lands
 * with a squash, the cart tilts as if catching something, a ring grows out
 * of the disc, and a dot drops in an arc into the cart — and whose remaining
 * six and a half seconds are still. The earlier version wiggled three times
 * in the first twelve seconds and then never again, which on a cold load
 * was over before anybody had looked at the header.
 *
 * It repeats until it has done its job, and then stops for the visit:
 * once the Store link is hovered or focused, once the shop is opened, or
 * once the basket holds anything (the basket's own count ring takes over).
 * That is recorded in `sessionStorage` so the header's and the drawer's
 * copies stop together and a navigation does not start it again. Under
 * `prefers-reduced-motion` none of it runs. Everything animated is
 * `translate`, `rotate`, `scale`, `opacity` and `box-shadow` — no colour
 * changes, so the contrast audit sees nothing — and the ring is a shadow,
 * which widens nothing.
 */
export function CartBadge({ size, className }: { size: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const pathname = usePathname();
  const basket = useBasket();
  const done = useSyncExternalStore(subscribe, read, () => false);

  // The shop opened, or something in the basket: the job is done.
  useEffect(() => {
    if (pathname.startsWith("/store") || (basket?.item_count ?? 0) > 0) markSeen();
  }, [pathname, basket]);

  // The Store link — whichever one this badge sits in — hovered or focused.
  useEffect(() => {
    // `a` or `button`: a Store item that is a heading opens its panel from a button.
    const link = ref.current?.closest("a, button");
    if (!link) return;
    link.addEventListener("pointerenter", markSeen);
    link.addEventListener("focus", markSeen);
    return () => { link.removeEventListener("pointerenter", markSeen); link.removeEventListener("focus", markSeen); };
  }, []);

  return (
    <span
      ref={ref}
      className={cn("cart-burst relative inline-flex shrink-0 items-center justify-center rounded-full bg-brand-600", className)}
      style={{ width: size, height: size }}
      data-quiet={done ? "" : undefined}
    >
      {/* The dot that drops into the cart. Painted in the disc's own text
          colour, so it reads as part of the mark on any theme. */}
      <span aria-hidden className="cart-burst-drop absolute rounded-full bg-brand-on" style={{ width: size * 0.2, height: size * 0.2, top: -size * 0.15, right: size * 0.15 }} />
      <IconCart className="cart-burst-mark text-brand-on" style={{ width: size * 0.56, height: size * 0.56 }} />
    </span>
  );
}
