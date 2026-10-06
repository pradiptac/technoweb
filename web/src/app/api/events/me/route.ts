import { NextResponse } from "next/server";

import { getCurrentCustomerOrNull, getToken } from "@/lib/auth";

/**
 * Who is signed in, for the event registration form.
 *
 * An event's page is served from the ISR cache, so nothing in it can read
 * the portal cookie while rendering; the form asks here after mount and
 * fills only the contact fields still empty — `/api/visits/me`'s
 * arrangement, for the same reason. **No cookie, no API call, 204.** The
 * answer is the four contact fields and nothing else; it is a convenience
 * for a form, not a session endpoint. The registration is filed under the
 * account by the Server Action, which reads the cookie itself whether or not
 * this prefill ever arrived.
 */
export async function GET() {
  const empty = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });

  if (!(await getToken())) return empty;

  const customer = await getCurrentCustomerOrNull();

  if (!customer) return empty;

  return NextResponse.json(
    { data: { name: customer.name, email: customer.email, phone: customer.phone ?? null, company: customer.company ?? null } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
