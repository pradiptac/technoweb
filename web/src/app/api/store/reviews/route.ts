import { NextResponse } from "next/server";

import { isReviewSort, reviewPage } from "@/lib/reviews";

/**
 * A page of a product's published reviews, for the product page's sort menu
 * and "Show more reviews".
 *
 * The first page is rendered with the product, from the ISR cache; this is
 * what the client island asks for everything after it. **The parameters are
 * an allowlist**: a slug of slug characters, one of the four sorts, a page
 * number — anything else is refused here rather than forwarded, so the data
 * cache holds one entry per real (product, sort, page) and nothing a crawler
 * invents. There is no user data in the answer, so the browser may keep it
 * briefly as well.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const slug = params.get("slug") ?? "";
  const sort = params.get("sort") ?? "featured";
  const page = Number(params.get("page") ?? "1");

  if (!/^[a-z0-9][a-z0-9-]{0,190}$/.test(slug) || !isReviewSort(sort) || !Number.isInteger(page) || page < 1 || page > 500) {
    return NextResponse.json({ message: "Not a review page." }, { status: 400 });
  }

  try {
    return NextResponse.json(await reviewPage(slug, sort, page), {
      headers: { "Cache-Control": "public, max-age=30" },
    });
  } catch {
    return NextResponse.json({ message: "We could not load the reviews." }, { status: 502 });
  }
}
