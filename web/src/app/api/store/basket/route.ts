import { NextResponse } from "next/server";

import { getCart } from "@/lib/cart";

/**
 * The visitor's basket, for the indicator in the shop's chrome.
 *
 * A route handler rather than a server-rendered read, and that is what lets
 * the store's product and category pages be cached at all. `BasketIndicator`
 * used to call `getCart()` during render, which reads the `tw_cart` cookie —
 * a request-time API — so every page carrying the indicator was rendered on
 * every request for every visitor, basket or not. The indicator is a client
 * component now: the page is served from the ISR cache with an empty basket
 * drawn, and this is what fills it in a moment later.
 *
 * **No cookie, no API call, 204.** `getCart()` already returns null without
 * touching the API when there is no token, and this keeps that promise: a
 * crawler reading the shop must never mint a cart, and a visitor who has
 * never pressed Add to basket costs the API nothing.
 *
 * `no-store`, because a basket is one person's and changes on every action;
 * the browser must not answer this from its own cache after a line is
 * removed.
 */
export async function GET() {
  const cart = await getCart();

  if (!cart) {
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json({ data: cart }, { headers: { "Cache-Control": "no-store" } });
}
