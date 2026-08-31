import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { apiFetch } from "@/lib/api";
import type { CartSummary, Single } from "@/types/api";

const COOKIE = "tw_cart";

/**
 * The basket, held by a token in an httpOnly cookie.
 *
 * The same arrangement as the portal session and for the same reason: browser
 * JavaScript never sees the token, and every request is issued from the Next
 * server with it attached. A cart token is not a session — it authorises
 * nothing but the basket — but it does address whatever somebody has typed
 * into a checkout, so it is treated like one.
 *
 * A token rather than an account, because **guest checkout is a requirement**.
 * A cart that needed a login would put every purchase behind the portal's
 * approval queue, which is a human being on a working day.
 */

export async function cartToken(): Promise<string | undefined> {
  const jar = await cookies();

  return jar.get(COOKIE)?.value;
}

/**
 * Only callable from a server action or a route handler.
 *
 * Next forbids writing a cookie while rendering, which is the whole reason
 * `getCart` never stores the token it is given back: a page that could mint a
 * cart would mint one for every crawler that ever visits the shop.
 */
export async function setCartToken(token: string) {
  const jar = await cookies();

  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // Long, because a basket is a shopping list somebody comes back to. The
    // API prunes abandoned carts on its own schedule; this is only how long
    // the browser offers to remember one.
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearCartToken() {
  const jar = await cookies();

  jar.delete(COOKIE);
}

/**
 * The basket as it stands, deduped per request.
 *
 * **Never cached.** A cart is one person's, it changes on every action, and an
 * ISR entry keyed on a URL would serve one shopper's basket to the next.
 *
 * With no cookie there is nothing to fetch: an empty summary is returned
 * without touching the API, so a crawler reading the shop does not create a
 * row per visit.
 */
export const getCart = cache(async (): Promise<CartSummary | null> => {
  const token = await cartToken();

  if (!token) return null;

  try {
    const res = await apiFetch<Single<CartSummary>>("/cart", {
      headers: { "X-Cart-Token": token },
      cache: "no-store",
    });

    return res.data;
  } catch {
    // A basket that cannot be read must not take the shop down with it. The
    // header renders "0 items" and the cart page says it could not be loaded.
    return null;
  }
});

/** How many things are in it, for the header. Zero when there is no basket. */
export async function cartCount(): Promise<number> {
  return (await getCart())?.item_count ?? 0;
}
