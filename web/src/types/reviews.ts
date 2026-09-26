/**
 * Store product reviews (`docs/store.md`, "Reviews"). Kept beside `api.ts`
 * and re-exported from it, the way `blocks.ts` is, so the feature's types
 * are one file.
 */

import type { Paginated } from "./api";

/** A product's published summary — null on the product when nobody has been published. */
export type StoreRating = { average: number; count: number };

export type ReviewSort = "featured" | "newest" | "highest" | "lowest";

export type ReviewStatus = "pending" | "published" | "rejected" | "spam";

/** A published review as the shop shows it. No customer id, address or order. */
export type ProductReview = {
  id: number;
  /** "Neil B." — a snapshot taken when the review was written. */
  display_name: string;
  verified: boolean;
  /** "Black / XL", from the verifying order line's snapshot, or null. */
  variant_label: string | null;
  rating: number;
  title: string | null;
  body: string;
  published_at: string | null;
};

export type ReviewPage = Paginated<ProductReview> & {
  meta: Paginated<ProductReview>["meta"] & {
    sort: ReviewSort;
    average: number | null;
    count: number;
    /** Every star count from 5 to 1, zeros included. Keys arrive as strings. */
    distribution: Record<string, number>;
  };
};

/** The caller's own review of a product, from the portal route. */
export type MyReview = {
  data: {
    id: number;
    rating: number;
    title: string | null;
    body: string;
    status: ReviewStatus;
    status_label: string;
    verified: boolean;
    variant_label: string | null;
    updated_at: string | null;
  } | null;
  meta: { can_review: boolean; verified: boolean };
};

/** What `/api/store/reviews/mine` answers the dialog: who is asking, and their review. */
export type MyReviewState =
  | { signedIn: false }
  | ({ signedIn: true } & MyReview);

export type AdminReview = {
  id: number;
  product: { id: number; name: string; slug: string } | null;
  display_name: string;
  customer: { id: number; name: string; email: string } | null;
  verified: boolean;
  order_id: number | null;
  variant_label: string | null;
  rating: number;
  title: string | null;
  body: string;
  status: ReviewStatus;
  status_label: string;
  is_featured: boolean;
  published_at: string | null;
  moderated_at: string | null;
  moderated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type AdminReviewList = Paginated<AdminReview> & {
  meta: Paginated<AdminReview>["meta"] & {
    statuses: { value: ReviewStatus; label: string }[];
    pending_count: number;
    sorts: string[];
  };
};
