"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api";
import { cartToken, setCartToken } from "@/lib/cart";
import { getToken } from "@/lib/auth";
import { requestStockNotice } from "@/lib/store";
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
      // The portal session rides along, so a signed-in customer's basket is
      // claimed for the account (`carts.customer_id`). The API reads it with
      // the guard named — the route is public — and ignores a "View as".
      token: await getToken(),
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

/**
 * `/cart` only. This used to revalidate the whole `/store` layout as well,
 * for the basket count in the filter bar — which is a client component fed
 * by `/api/store/basket` now, so nothing server-rendered under `/store`
 * depends on the basket. Left in, that line would have purged every cached
 * product and category page for every visitor each time anybody pressed
 * Add to basket.
 */
function refresh() {
  revalidatePath("/cart");
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

export type StockNoticeState = { error?: string; ok?: string };

/**
 * "Email me when this is back", from the out-of-stock state of a product
 * page. The page is served from the ISR cache, so nothing about the visitor
 * can be read while it renders — this action is where the portal cookie is
 * read, once, and forwarded so a signed-in customer's notice is stamped
 * with their account.
 *
 * The API answers 202 and one sentence for every case — a suppressed
 * address, a filled honeypot, a shelf that is not empty — so the only
 * failure this can report is the request not getting through at all.
 */
export async function requestStockNoticeAction(
  _previous: StockNoticeState,
  formData: FormData,
): Promise<StockNoticeState> {
  const slug = String(formData.get("slug") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const variationId = Number(formData.get("variation_id")) || null;

  if (!slug) return { error: "That product could not be found." };
  if (!email) return { error: "Type the address to email." };

  try {
    const message = await requestStockNotice(
      slug,
      { email, variation_id: variationId, website: String(formData.get("website") ?? "") },
      await getToken(),
    );

    return { ok: message };
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) {
      return { error: error.errors?.email?.[0] ?? error.message };
    }

    return { error: "We could not save that just now. Try again shortly." };
  }
}
