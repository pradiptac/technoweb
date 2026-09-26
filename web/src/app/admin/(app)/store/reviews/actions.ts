"use server";

import { revalidatePath, updateTag } from "next/cache";
import { ApiError } from "@/lib/api";
import { deleteReview, featureReview, moderateReviews } from "@/lib/admin/reviews";

export type ReviewActionState = { ok?: string; error?: string };

const STATUSES = ["pending", "published", "rejected", "spam"] as const;
type Status = (typeof STATUSES)[number];
const isStatus = (v: string): v is Status => (STATUSES as readonly string[]).includes(v);

const WORD: Record<Status, string> = {
  published: "published",
  rejected: "rejected",
  spam: "marked as spam",
  pending: "sent back to waiting",
};

/**
 * What a moderation decision changes on the public site, purged at once.
 *
 * `store-reviews` is every product page's first page of reviews;
 * `store-products` is the rating the cards and the product page print, which
 * the API recomputes on the same save. Both collections rather than a tag
 * per slug: a selection spans products, and broader-and-correct is the right
 * way round — the comment queue's reasoning. Without them a published review
 * reached the page when the fetch's window ran out, five minutes later.
 */
function purge() {
  updateTag("store-reviews");
  updateTag("store-products");
  revalidatePath("/admin/store/reviews");
}

/**
 * Move one review or a selection. The ids arrive as repeated `ids` fields
 * from the selection bar, or as one `row` field — `<id>:<status>` — from a
 * row's own button, which must never share the ticks' name (the comment
 * queue's bug: one press moved every ticked row).
 */
export async function moderateReviewsAction(_prev: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const row = String(formData.get("row") ?? "");
  const [rowId, rowStatus] = row.includes(":") ? row.split(":") : [];
  const ids = rowId ? [Number(rowId)].filter(Boolean) : formData.getAll("ids").map(Number).filter(Boolean);
  const status = rowStatus ?? String(formData.get("status") ?? "");

  if (ids.length === 0) return { error: "Nothing was selected." };
  if (!isStatus(status)) return { error: "Choose what to do with them." };

  try {
    const res = await moderateReviews(ids, status);
    purge();
    const n = res.data.moved;
    return { ok: `${n} review${n === 1 ? "" : "s"} ${WORD[status]}.` };
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "We could not move those reviews." };
  }
}

export async function featureReviewAction(_prev: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const id = Number(formData.get("id"));
  const featured = formData.get("featured") === "1";

  if (!id) return { error: "That review could not be found." };

  try {
    await featureReview(id, featured);
    purge();
    return { ok: featured ? "Featured — it sorts first on the product page." : "No longer featured." };
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "We could not change that review." };
  }
}

export async function deleteReviewAction(_prev: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const id = Number(formData.get("id"));

  if (!id) return { error: "That review could not be found." };

  try {
    await deleteReview(id);
    purge();
    return { ok: "Review deleted." };
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "We could not delete that review." };
  }
}
