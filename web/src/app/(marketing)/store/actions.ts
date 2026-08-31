"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api";
import { cartToken, setCartToken } from "@/lib/cart";
import type { CartSummary, Single } from "@/types/api";

export type CartActionState = { error?: string; ok?: string; warning?: string };

/**
 * Every basket action goes through here.
 *
 * Two things it does that a bare fetch would not. It **carries the token both
 * ways**: sending whatever cookie exists, and storing whatever the API hands
 * back — which is how a first "add to basket" mints a cart without the page
 * that rendered the button having to. Next forbids writing a cookie during a
 * render, so this is the only place a token can be created.
 *
 * And it never throws at the caller. A shop that shows a stack trace because
 * a basket call failed has turned a recoverable moment into a lost sale.
 */
async function call(
  path: string,
  init: { method: string; body?: unknown },
): Promise<CartActionState & { cart?: CartSummary }> {
  const token = await cartToken();

  try {
    const res = await apiFetch<Single<CartSummary> & { warning?: string | null }>(path, {
      method: init.method,
      body: init.body,
      headers: token ? { "X-Cart-Token": token } : undefined,
      cache: "no-store",
    });

    if (res.data?.token && res.data.token !== token) {
      await setCartToken(res.data.token);
    }

    return { cart: res.data, warning: res.warning ?? undefined };
  } catch (error) {
    if (error instanceof ApiError) {
      // The API's own sentence: "Choose an option before adding this", "Only 2
      // of these are available". Written to be read by whoever pressed the
      // button, so it is passed through rather than replaced.
      return { error: error.message || "We could not update your basket." };
    }

    return { error: "We could not update your basket. Try again shortly." };
  }
}

/** Everything the basket touches is dynamic, but the header count is not. */
function refresh() {
  revalidatePath("/cart");
  revalidatePath("/store", "layout");
}

export async function addToCartAction(
  _previous: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  const productId = Number(formData.get("product_id"));
  const variationId = Number(formData.get("variation_id")) || null;
  const quantity = Number(formData.get("quantity")) || 1;

  if (!productId) return { error: "That product could not be found." };

  const result = await call("/cart/items", {
    method: "POST",
    body: { product_id: productId, variation_id: variationId, quantity },
  });

  if (result.error) return { error: result.error };

  refresh();

  return { ok: "Added to your basket.", warning: result.warning };
}

export async function updateCartLineAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const quantity = Number(formData.get("quantity"));

  if (!id || Number.isNaN(quantity)) return;

  await call(`/cart/items/${id}`, { method: "PATCH", body: { quantity } });

  refresh();
}

export async function removeCartLineAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));

  if (!id) return;

  await call(`/cart/items/${id}`, { method: "DELETE" });

  refresh();
}

/**
 * Put a discount code on the basket.
 *
 * The refusal is passed through as the API worded it — "that code needs an
 * order of ₹5,000 or more" is something somebody can act on, where "invalid
 * coupon" sends them to the telephone.
 */
export async function applyCouponAction(
  _previous: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  const code = String(formData.get("code") ?? "").trim();

  if (!code) return { error: "Type a code first." };

  const result = await call("/cart/coupon", { method: "POST", body: { code } });

  if (result.error) return { error: result.error };

  refresh();

  return { ok: "Discount applied." };
}

export async function removeCouponAction(): Promise<void> {
  await call("/cart/coupon", { method: "DELETE" });

  refresh();
}

export async function clearCartAction(): Promise<void> {
  await call("/cart", { method: "DELETE" });

  refresh();
}
