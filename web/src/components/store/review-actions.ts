"use server";

import { ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { submitReview } from "@/lib/reviews";

export type ReviewFormState = {
  ok?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /** The API refused the session: the dialog goes back to "sign in". */
  signedOut?: boolean;
};

/**
 * Write or rewrite the signed-in customer's review of a product.
 *
 * **The portal token is forwarded from the cookie here**, never read by the
 * page: the product page is ISR-cached and cannot know who is looking. A
 * route that is public-looking but needs a customer is exactly where
 * `$request->user()` has read as working twice in this project, so the API
 * route is inside `auth:sanctum` and this is what carries the token to it.
 *
 * Nothing public changes when this succeeds — every review waits for staff
 * — so no cache tag is touched.
 */
export async function submitReviewAction(_prev: ReviewFormState, formData: FormData): Promise<ReviewFormState> {
  const slug = String(formData.get("slug") ?? "");
  const rating = Number(formData.get("rating"));
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const website = String(formData.get("website") ?? "");

  if (!/^[a-z0-9][a-z0-9-]{0,190}$/.test(slug)) return { error: "That product could not be found." };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: "Choose how many stars first.", fieldErrors: { rating: ["Choose how many stars first."] } };
  }
  if (body.length < 2) {
    return { error: "Write a line or two about it.", fieldErrors: { body: ["Write a line or two about it."] } };
  }

  const token = await getToken();
  if (!token) return { signedOut: true, error: "Sign in to write a review." };

  try {
    const message = await submitReview(slug, { rating, title: title || null, body, website }, token);
    return { ok: message };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 422) return { error: error.message, fieldErrors: error.errors };
      if (error.status === 401 || error.status === 403) return { signedOut: true, error: "Sign in again to write a review." };
      if (error.status === 429) return { error: "That was a lot of reviews at once. Wait a minute and try again." };
      if (error.status === 404) return { error: "This product is no longer on sale." };
    }

    return { error: "We could not save your review. Try again shortly." };
  }
}
