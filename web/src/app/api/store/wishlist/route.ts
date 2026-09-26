import { NextResponse } from "next/server";

import { getWishlist, rememberWishlist } from "@/lib/wishlist";

/**
 * The visitor's wishlist, for the hearts and the count on a cached page.
 *
 * The basket's arrangement exactly (`/api/store/basket`): the shop's product
 * and category pages are served whole from the ISR cache, so nothing on them
 * may read a cookie while rendering. Every heart draws empty on the server and
 * `useWishlist()` fills them from here after mount.
 *
 * **No cookie and no session: no API call, 204.** A crawler reading the shop
 * must never cost the API anything.
 *
 * The token is stripped from the answer — the browser never sees it, which is
 * the point of the cookie being httpOnly — and a null token from the API (a
 * guest list merged into an account's) forgets the cookie on the way out.
 */
export async function GET() {
  const list = await getWishlist();

  if (!list) {
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }

  await rememberWishlist(list);

  const { token: _token, ...visible } = list;
  void _token;

  return NextResponse.json({ data: visible }, { headers: { "Cache-Control": "no-store" } });
}
