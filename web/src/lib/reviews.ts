import "server-only";
import { apiFetch } from "@/lib/api";
import type { MyReview, ReviewPage, ReviewSort } from "@/types/api";

/**
 * Store product reviews, server side (`docs/store.md`, "Reviews").
 *
 * Its own module rather than more lines in `lib/api.ts` and `lib/store.ts`:
 * the reads and the write are one feature, and the route handlers and
 * actions that need them import from one place. The console's calls are
 * `lib/admin/reviews.ts`.
 */

export const REVIEW_SORTS: readonly ReviewSort[] = ["featured", "newest", "highest", "lowest"];

export function isReviewSort(value: unknown): value is ReviewSort {
  return typeof value === "string" && (REVIEW_SORTS as readonly string[]).includes(value);
}

/**
 * A page of published reviews. Cached — there is nothing per-visitor in it —
 * under the product's own tag and the collection's, so the console's
 * moderation (`updateTag("store-reviews")`) reaches the product page's first
 * page on the next request rather than after the window.
 */
export function reviewPage(slug: string, sort: ReviewSort = "featured", page = 1): Promise<ReviewPage> {
  const q = new URLSearchParams({ sort, page: String(page) });

  return apiFetch<ReviewPage>(`/store/products/${encodeURIComponent(slug)}/reviews?${q}`, {
    revalidate: 300,
    tags: ["store-reviews", `store-reviews:${slug}`],
  });
}

/** The signed-in customer's own review of a product, with whether they bought it. Never cached. */
export function myReview(slug: string, portalToken: string): Promise<MyReview> {
  return apiFetch<MyReview>(`/store/products/${encodeURIComponent(slug)}/reviews/mine`, { token: portalToken });
}

export async function submitReview(
  slug: string,
  body: { rating: number; title?: string | null; body: string; website?: string },
  portalToken: string,
): Promise<string> {
  const res = await apiFetch<{ message: string }>(`/store/products/${encodeURIComponent(slug)}/reviews`, {
    method: "POST",
    body,
    token: portalToken,
  });

  return res.message;
}
