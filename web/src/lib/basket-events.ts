"use client";

import { useCallback, useEffect, useState } from "react";
import type { CartSummary } from "@/types/api";

/**
 * How the basket indicator learns that the basket changed.
 *
 * Every basket mutation is a Server Action, and a Server Action cannot reach
 * into a client component's state — so the components that call one announce
 * it here afterwards, and the indicator, wherever it is on the page, refetches.
 * One event name, one hook, so a second place that mutates the basket cannot
 * invent a second signal the indicator does not listen for.
 */
export const BASKET_EVENT = "tw:cart";

export function announceBasketChange(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(BASKET_EVENT));
}

/**
 * The basket as `/api/store/basket` reports it: `null` until the first
 * answer, and `null` again for a visitor with no basket at all.
 *
 * Fetched after mount and on every announcement. The first render — the
 * server's — draws an empty basket, which is right for most visitors and one
 * fetch late for the rest; that trade is what lets the page it sits on be
 * cached. A failed fetch leaves whatever was showing: a basket that briefly
 * reads stale is better than one that blinks empty because a request timed out.
 */
export function useBasket(): CartSummary | null {
  const [cart, setCart] = useState<CartSummary | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/store/basket", { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(async (res) => {
        if (res.status === 204) return null;
        if (!res.ok) throw new Error(String(res.status));
        return ((await res.json()) as { data: CartSummary }).data;
      })
      .then((next) => setCart(next))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(BASKET_EVENT, refresh);

    return () => window.removeEventListener(BASKET_EVENT, refresh);
  }, [refresh]);

  return cart;
}
