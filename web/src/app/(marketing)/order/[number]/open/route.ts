import { NextResponse, type NextRequest } from "next/server";
import { ORDER_COOKIE, isOrderNumber, isOrderToken, orderCookieOptions, orderPath } from "@/lib/order-access";

/**
 * Where a link carrying an order's token lands: the emails, the gateway's
 * return URL, an old `/order/{n}?token=…` bookmark (the page sends those here).
 *
 * It trades the token for an httpOnly cookie scoped to `/order/{n}` and
 * answers 303 to the clean page, so the token is never in the address of a
 * page that renders — and therefore never in what Analytics reports, the
 * browser's history of rendered pages, or a `Referer`. It renders nothing and
 * loads no script, which is the point of it being a route handler.
 *
 * `placed` and `paid` ride through: they say what just happened (the confetti,
 * a gateway's return) and are not secret. Nothing else does. The `Location` is
 * relative, because behind Plesk `request.url` can carry the internal host.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;

  if (!isOrderNumber(number)) {
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const query = request.nextUrl.searchParams;
  const token = query.get("token") ?? "";

  const onward = new URLSearchParams();
  if (query.get("placed") === "1") onward.set("placed", "1");
  const paid = query.get("paid");
  if (paid && /^[a-z]{1,20}$/.test(paid)) onward.set("paid", paid);

  const rest = onward.toString();
  const target = orderPath(number) + (rest ? `?${rest}` : "");

  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: target, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });

  // A malformed token is not stored; the page then 404s like any wrong one.
  if (isOrderToken(token)) {
    response.cookies.set(ORDER_COOKIE, token, orderCookieOptions(number));
  }

  return response;
}
