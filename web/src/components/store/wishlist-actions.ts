"use server";

import { apiFetch, ApiError } from "@/lib/api";
import { cartToken, setCartToken } from "@/lib/cart";
import { rememberWishlist, wishlistAuth } from "@/lib/wishlist";
import type { CartSummary, Single, WishlistSummary } from "@/types/api";

/** The list as the browser may see it — never its token. */
export type VisibleWishlist = Omit<WishlistSummary, "token">;

export type WishlistActionResult = { list?: VisibleWishlist; error?: string; ok?: string };

/**
 * Every wishlist call goes through here, and it carries both credentials the
 * Next server holds — the guest token and the portal session — so the API can
 * merge the two the first time they arrive together. It keeps the cookie in
 * step with the answer (`rememberWishlist`) and never throws at the caller:
 * a heart that shows a stack trace has turned a small moment into a broken
 * page. The API's own sentence is passed through on a refusal.
 */
async function call(
  path: string,
  init: { method: string; body?: unknown; headers?: Record<string, string> },
): Promise<WishlistActionResult & { cart?: CartSummary }> {
  const auth = await wishlistAuth();

  try {
    const res = await apiFetch<Single<WishlistSummary> & { cart?: CartSummary }>(path, {
      method: init.method,
      body: init.body,
      headers: { ...auth.headers, ...init.headers },
      ...(auth.token ? { token: auth.token } : {}),
      cache: "no-store",
    });

    await rememberWishlist(res.data);

    const { token: _token, ...list } = res.data;
    void _token;

    return { list, cart: res.cart };
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.errors?.email?.[0] ?? (error.message || "We could not update your wishlist.") };
    }

    return { error: "We could not update your wishlist. Try again shortly." };
  }
}

export async function saveToWishlistAction(productId: number, variationId: number | null = null): Promise<WishlistActionResult> {
  if (!productId) return { error: "That product could not be found." };

  return call("/wishlist/items", { method: "POST", body: { product_id: productId, variation_id: variationId } });
}

export async function removeFromWishlistAction(itemId: number): Promise<WishlistActionResult> {
  if (!itemId) return { error: "That line could not be found." };

  return call(`/wishlist/items/${itemId}`, { method: "DELETE" });
}

/**
 * Put a saved thing in the basket. The basket's own token rides along, and a
 * new one coming back — the first thing somebody has ever put in a basket —
 * is stored through the basket's own `setCartToken`, so the two cookies are
 * written by the modules that own them.
 */
export async function moveWishlistLineToBasketAction(itemId: number): Promise<WishlistActionResult> {
  if (!itemId) return { error: "That line could not be found." };

  const basket = await cartToken();
  const result = await call(`/wishlist/items/${itemId}/move-to-basket`, {
    method: "POST",
    headers: basket ? { "X-Cart-Token": basket } : {},
  });

  if (result.cart?.token && result.cart.token !== basket) {
    await setCartToken(result.cart.token);
  }

  if (result.error) return { error: result.error };

  return { list: result.list, ok: "Moved to your basket." };
}

export type WishlistAlertsState = { error?: string; ok?: string; fieldErrors?: Record<string, string> };

/**
 * "Email me about these", for a guest — or switching the emails back on, for a
 * list whose stop link was pressed. A `<Form>` action, so a refused address
 * comes back with the field still filled.
 */
export async function wishlistAlertsAction(
  _previous: WishlistAlertsState,
  formData: FormData,
): Promise<WishlistAlertsState> {
  const body: Record<string, unknown> = {};

  if (formData.has("email")) {
    const email = String(formData.get("email") ?? "").trim();

    if (!email) return { fieldErrors: { email: "Type the address to email." } };
    body.email = email;
  }

  if (formData.has("alerts")) body.alerts = formData.get("alerts") === "1";

  const result = await call("/wishlist", { method: "PATCH", body });

  if (result.error) {
    return formData.has("email") ? { fieldErrors: { email: result.error } } : { error: result.error };
  }

  return {
    ok: body.alerts === false
      ? "Done. We will not email you about this list."
      : "Done. We will email you once when something here is back in stock or comes down in price.",
  };
}
