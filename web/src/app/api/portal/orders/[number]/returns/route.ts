import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/auth";
import { isOrderNumber } from "@/lib/order-access";
import { proxyMultipart } from "@/lib/proxy-upload";

/**
 * A signed-in customer's return request that carries photographs
 * (docs/store.md "Returns"). The portal's token is in an httpOnly cookie only
 * this server can read; the API checks the order is the customer's own and
 * answers 404 when it is not.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const token = await getToken();

  if (!token) {
    return NextResponse.json({ message: "Your session has expired. Sign in again." }, { status: 401 });
  }

  if (!isOrderNumber(number)) {
    return NextResponse.json({ message: "That order could not be found." }, { status: 404 });
  }

  return proxyMultipart(request, `/my/orders/${encodeURIComponent(number)}/returns`, { token });
}
