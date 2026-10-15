import { NextRequest, NextResponse } from "next/server";
import { isOrderNumber, orderToken } from "@/lib/order-access";
import { proxyMultipart } from "@/lib/proxy-upload";

/**
 * A return request that carries photographs (docs/store.md "Returns").
 *
 * Under `/order/{number}` on purpose: the order's token lives in an httpOnly
 * cookie scoped to that path, so this is the one address a browser sends it
 * to. The token is read here and handed to the API in the query — the body
 * is a stream and is passed through untouched — on a server-to-server
 * request that no browser ever sees. Without photographs the form posts
 * through its Server Action instead.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;

  if (!isOrderNumber(number)) {
    return NextResponse.json({ message: "That order could not be found." }, { status: 404 });
  }

  const token = await orderToken(number);

  if (!token) {
    return NextResponse.json(
      { message: "This order is no longer open in this browser. Use the link in your order email." },
      { status: 401 },
    );
  }

  return proxyMultipart(request, `/orders/${encodeURIComponent(number)}/returns?token=${encodeURIComponent(token)}`);
}
