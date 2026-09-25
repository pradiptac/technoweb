import { NextResponse } from "next/server";

import { apiFetch } from "@/lib/api";
import { CART_COOKIE } from "@/lib/cart";

/**
 * The link in a basket reminder: put that basket back in this browser.
 *
 * The email carries the basket's **restore token**, never its cart token —
 * the cart token is the basket's identity and lives only in an httpOnly
 * cookie, and an email is forwarded, archived and opened by link scanners.
 * The API swaps one for the other (`GET /cart/restore/{token}`), this sets the
 * cookie the rest of the shop reads, and the visitor lands on the basket.
 *
 * A route handler rather than a page, because the outcome is a cookie and a
 * redirect, which only a response can carry. The `Location` is a path, so the
 * browser supplies the origin — behind Plesk the request arrives at
 * `127.0.0.1:3000`, and an absolute URL built from it would send people there.
 *
 * A basket that has already become an order, or a token nobody minted, lands
 * on the basket too, with `?restored=0` so the page can say why it is empty
 * instead of looking as though the link did nothing. The cookie already in
 * the browser is left alone in that case.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let cartToken: string | null = null;

  if (/^[0-9a-f]{64}$/.test(token)) {
    try {
      const res = await apiFetch<{ data: { token: string } }>(`/cart/restore/${token}`, { cache: "no-store" });
      cartToken = res.data?.token ?? null;
    } catch {
      // A 404 and an unreachable API end the same way: the basket as it is.
    }
  }

  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: cartToken ? "/cart?restored=1" : "/cart?restored=0", "Cache-Control": "no-store" },
  });

  if (cartToken) response.cookies.set(CART_COOKIE.name, cartToken, CART_COOKIE.options());

  return response;
}
