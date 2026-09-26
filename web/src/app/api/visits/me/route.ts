import { NextResponse } from "next/server";

import { getCurrentCustomerOrNull, getToken } from "@/lib/auth";

/**
 * Who is signed in, for the visit request form (docs/visits.md).
 *
 * The form asks here after mount and fills only the contact fields still
 * empty — `/api/store/me`'s arrangement, for the same reason: a page that
 * read the portal cookie while rendering could never be cached, and the
 * booking page should stay free to be. **No cookie, no API call, 204.** The
 * answer is the four contact fields and nothing else; it is a convenience
 * for a form, not a session endpoint.
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
