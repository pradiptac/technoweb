import { NextResponse } from "next/server";

import { lookupPincode } from "@/lib/pincode";

/**
 * What a PIN code says about where an address is, for the delivery form.
 *
 * A route handler rather than a Server Action, for the two reasons that
 * separate them: this is a GET of a fact that does not change, so it can be
 * cached by the browser and by whatever sits in front of it, and an action
 * costs a POST and a render pass to answer a question worth 200 bytes.
 *
 * Public and unauthenticated, which is correct — it is India Post's published
 * directory, the same thing every courier's website will tell you, and there
 * is nothing here that knowing costs anybody anything. The lookup is a `Map`
 * read, so there is no work to protect: no database, no network, and nothing
 * a caller can make expensive.
 *
 * A day of caching rather than the year `immutable` invites. The table is
 * regenerated when India Post moves a boundary, and a year-long cache would
 * mean the correction reached nobody who had already asked.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const place = lookupPincode(code);

  if (!place) {
    // 404 for a PIN code nothing is recorded against, and for a malformed one:
    // the form does the same thing either way — say so, and let somebody type
    // the address themselves.
    return NextResponse.json({ message: "We do not have that PIN code." }, { status: 404 });
  }

  return NextResponse.json({ data: place }, {
    headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" },
  });
}
