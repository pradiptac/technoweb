import { NextResponse } from "next/server";
import { ApiError, eventApi } from "@/lib/api";
import { isEventSlug } from "@/components/events/data";

/**
 * Whether an event has room right now — what the registration panel asks
 * once it is on screen (`GET /events/{slug}/availability`,
 * docs/events-contract.md).
 *
 * The event's page is served from the ISR cache and so cannot say; this is
 * the uncached half. Through the Next server rather than straight from the
 * browser because the API's CORS allows only the site's own server, and
 * because an uncached `apiFetch` is what names the visitor to the API — the
 * endpoint's limits are per visitor, and without the header everybody would
 * share one bucket.
 *
 * **Never cached, on either side.** The answer changes with every
 * registration and every cancellation, and a stale "open" is a form that
 * refuses on submit. The answer is a state, a flag and a sentence — never a
 * count; the API publishes none.
 */
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  if (!isEventSlug(slug)) {
    return NextResponse.json({ message: "That is not an event." }, { status: 404, headers });
  }

  try {
    const res = await eventApi.availability(slug);

    return NextResponse.json({ data: res.data }, { headers });
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) {
      return NextResponse.json({ message: error.message }, { status: error.status, headers });
    }

    return NextResponse.json({ message: "We could not check the places just now." }, { status: 502, headers });
  }
}
