"use server";

import { updateTag } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api";

export type CommentState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  ok?: string;
};

/**
 * Leave a comment.
 *
 * Everything that decides whether this is accepted lives on the API — the
 * honeypot, the age window, the site-wide switch, the score. Nothing is
 * duplicated here, because a rule enforced in two places is a rule that can
 * disagree with itself, and the frontend is not the boundary.
 */
export async function postCommentAction(
  _previous: CommentState,
  formData: FormData,
): Promise<CommentState> {
  const slug = String(formData.get("slug") ?? "");

  if (!slug) return { error: "We could not tell which post this is." };

  try {
    const res = await apiFetch<{ message: string }>(`/blog/${slug}/comments`, {
      method: "POST",
      body: {
        author_name: String(formData.get("author_name") ?? ""),
        author_email: String(formData.get("author_email") ?? ""),
        body: String(formData.get("body") ?? ""),
        parent_id: formData.get("parent_id") ? Number(formData.get("parent_id")) : null,
        /*
         * How long the page had been open.
         *
         * A comment submitted within seconds of the page loading was not typed
         * by a person. It is a *scoring* signal and never a refusal — a slow
         * reader with a fast opinion is a real reader, and the browser is free
         * not to send it at all.
         */
        seconds_on_page: formData.get("seconds_on_page")
          ? Number(formData.get("seconds_on_page"))
          : null,
        // The honeypot. Named `website`, like every other public form here.
        website: String(formData.get("website") ?? ""),
      },
      cache: "no-store",
    });

    /*
     * Clear the cached read for this post only.
     *
     * `updateTag` rather than `revalidateTag`: it gives read-your-own-writes,
     * so a reader who comments and then reloads is not told for a minute that
     * the page has no comments — even though theirs is still waiting, the
     * count and anything approved in the meantime are current.
     */
    updateTag(`blog-comments:${slug}`);

    return { ok: res.message };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        // The API's own sentence — "Comments are closed on this post." — which
        // is written to be read by whoever pressed the button.
        error: error.message || "We could not post your comment.",
        fieldErrors: error.errors,
      };
    }

    return { error: "We could not post your comment. Try again shortly." };
  }
}
