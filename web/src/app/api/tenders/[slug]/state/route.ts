import { NextResponse } from "next/server";
import { ApiError, tenderApi } from "@/lib/api";
import { isTenderSlug } from "@/components/tenders/data";

/**
 * Whether a tender is taking bids right now — what the notice's state chip
 * asks once it is on screen (`GET /tenders/{slug}/state`, docs/tenders.md).
 *
 * The notice's page is served from the ISR cache and so cannot say: it
 * renders the state it was built with, which may be last week's. This is
 * the uncached half, and it is the difference between a page that is merely
 * out of date and one that tells a bidder a closed tender is open.
 *
 * Through the Next server rather than straight from the browser because the
 * API's CORS allows only the site's own server, and because an uncached
 * `apiFetch` is what names the visitor to the API — the endpoint's throttle
 * is per visitor, and without the header everybody would share one bucket.
 *
 * **Never cached, on either side.** A cached answer here would reintroduce
 * exactly the staleness the route exists to remove.
 */
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // Refused here rather than at the API, so a crawler's junk URL costs a
  // round trip and a throttle slot neither of us needs.
  if (!isTenderSlug(slug)) {
    return NextResponse.json({ message: "That is not a tender." }, { status: 404, headers });
  }

  try {
    const res = await tenderApi.state(slug);

    return NextResponse.json({ data: res.data }, { headers });
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) {
      return NextResponse.json({ message: error.message }, { status: error.status, headers });
    }

    return NextResponse.json({ message: "We could not check this tender just now." }, { status: 502, headers });
  }
}
