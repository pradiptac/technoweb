import { NextResponse } from "next/server";

import { getCurrentCustomerOrNull, getToken } from "@/lib/auth";

/**
 * Who is signed in, for a form on a cached page.
 *
 * The store's product pages are served from the ISR cache, so nothing in
 * them can read the portal cookie while rendering — the same reason the
 * basket count is a client component fed by `/api/store/basket`. The
 * back-in-stock form asks here after mount to prefill its address, and
 * draws empty for everybody else.
 *
 * **No cookie, no API call, 204**: a crawler reading the shop costs the
 * API nothing, and the answer carries the address and the name and nothing
 * else — it is a convenience for a form, not a session endpoint.
 */
export async function GET() {
  if (!(await getToken())) {
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }

  const customer = await getCurrentCustomerOrNull();

  if (!customer) {
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json(
    { data: { email: customer.email, name: customer.name } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
