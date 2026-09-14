"use client";

import Link from "next/link";
import { useEffect } from "react";
import { brandConfettiColors, confettiBurst } from "@/components/velora/confetti";
import { cn } from "@/lib/utils";

/**
 * The basket panel's Checkout link, firing Velora's confetti from the point
 * pressed — the `ConfettiButton` behaviour on a link, since Checkout is a
 * navigation, not a form control. The burst is a fixed canvas on `<body>`,
 * so it survives the client-side navigation to `/checkout` and clears
 * itself after ~2s. No-op under reduced motion (the item's own rule).
 */
export function CheckoutLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(className)}
      onClick={(e) => confettiBurst({ x: e.clientX, y: e.clientY, count: 70, colors: brandConfettiColors() })}
    >
      {children}
    </Link>
  );
}

/**
 * One burst when an order has just been placed. The checkout redirects here
 * with `?placed=1`; the flag is honoured once per order per tab, so a reload
 * of the confirmation, or a link somebody comes back to from their email,
 * does not celebrate again. It never fires from the order page's own URL
 * without the flag: that page is also where a customer returns to reveal a
 * licence key weeks later.
 */
export function OrderPlacedConfetti({ orderNumber, placed }: { orderNumber: string; placed: boolean }) {
  useEffect(() => {
    if (!placed) return;
    const key = `tw_confetti_${orderNumber}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Storage blocked: fire once for this render and accept a repeat on reload.
    }
    const t = setTimeout(() => confettiBurst({ y: window.innerHeight * 0.35, count: 120, colors: brandConfettiColors() }), 250);
    return () => clearTimeout(t);
  }, [orderNumber, placed]);
  return null;
}
