import { NextResponse } from "next/server";

import { ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { myReview } from "@/lib/reviews";
import type { MyReviewState } from "@/types/api";

/**
 * Who is writing, for the review dialog on a cached page.
 *
 * The product page is served whole from the ISR cache, so it cannot read the
 * portal cookie while rendering — the reason the basket count and the
 * back-in-stock prefill ask their own route handlers after mount. The dialog
 * asks here when it opens: signed out is `{signedIn: false}` with **no API
 * call**, so a crawler pressing buttons costs the API nothing; signed in is
 * the customer's own review (any status) and whether they bought the thing.
 * A session the API no longer honours reads as signed out.
 */
export async function GET(request: Request) {
  const noStore = { headers: { "Cache-Control": "no-store" } };
  const slug = new URL(request.url).searchParams.get("slug") ?? "";

  if (!/^[a-z0-9][a-z0-9-]{0,190}$/.test(slug)) {
    return NextResponse.json({ message: "Not a product." }, { status: 400, ...noStore });
  }

  const token = await getToken();

  if (!token) {
    return NextResponse.json({ signedIn: false } satisfies MyReviewState, noStore);
  }

  try {
    const mine = await myReview(slug, token);
    return NextResponse.json({ signedIn: true, ...mine } satisfies MyReviewState, noStore);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return NextResponse.json({ signedIn: false } satisfies MyReviewState, noStore);
    }

    return NextResponse.json({ message: "We could not check your review." }, { status: 502, ...noStore });
  }
}
