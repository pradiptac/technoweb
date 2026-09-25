import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { WISHLIST_COOKIE as COOKIE, wishlistToken } from "@/lib/wishlist-cookie";
import type { Single, WishlistSummary } from "@/types/api";

/**
 * The wishlist, held like the basket: a guest's list by a token in an httpOnly
 * cookie the browser never reads, an account's by the portal session. Every
 * request is issued from the Next server with whichever of the two it holds —
 * and with **both**, which is how a guest's list joins the account's the first
 * time somebody who has signed in opens the shop (the API merges; see
 * `App\Support\Store\Wishlists`).
 *
 * When the API answers a null `token`, the list in hand is an account's and the
 * guest cookie has nothing left to address — it has been merged, or it was
 * never a guest's. That is the one signal to forget it, and `rememberWishlist`
 * is where it is acted on.
 */

/**
 * Keep or forget the cookie to match what the API said. Only callable from a
 * Server Action or a route handler — Next forbids writing a cookie during a
 * render, which is also why a page can never mint a list.
 */
export async function rememberWishlist(summary: Pick<WishlistSummary, "token"> | null | undefined): Promise<void> {
  if (!summary) return;

  const jar = await cookies();
  const current = jar.get(COOKIE)?.value;

  if (summary.token && summary.token !== current) {
    jar.set(COOKIE, summary.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      // Six months, and `technoware:prune-wishlists` deletes an untouched guest
      // list after the same 180 days: one fact, two places, kept in step.
      maxAge: 60 * 60 * 24 * 180,
    });
  } else if (!summary.token && current) {
    jar.delete(COOKIE);
  }
}

/** The headers a wishlist call carries: the guest token and the portal session, whichever exist. */
export async function wishlistAuth(): Promise<{ headers: Record<string, string>; token?: string }> {
  const [guest, portal] = await Promise.all([wishlistToken(), getToken()]);

  return {
    headers: guest ? { "X-Wishlist-Token": guest } : {},
    ...(portal ? { token: portal } : {}),
  };
}

/** The stop link in a wishlist email. One sentence for every token, used or not; the page shows it. */
export async function stopWishlistAlerts(alertsToken: string): Promise<string> {
  const res = await apiFetch<{ message: string }>(
    `/wishlist/alerts/${encodeURIComponent(alertsToken)}/stop`,
    { cache: "no-store" },
  );

  return res.message;
}

/**
 * The list as it stands, once per request, or null for a visitor with neither
 * a list nor a session — without touching the API, so a crawler reading the
 * shop costs nothing and mints nothing. **Never cached**: a list is one
 * person's.
 */
export const getWishlist = cache(async (): Promise<WishlistSummary | null> => {
  const auth = await wishlistAuth();

  if (!auth.token && !auth.headers["X-Wishlist-Token"]) return null;

  try {
    const res = await apiFetch<Single<WishlistSummary>>("/wishlist", { ...auth, cache: "no-store" });

    return res.data;
  } catch {
    // A list that cannot be read must not take a page down with it.
    return null;
  }
});
