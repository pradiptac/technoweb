import "server-only";
import { apiFetch } from "@/lib/api";
import { query, token } from "./_shared";
import type { AdminReviewList } from "@/types/api";

/**
 * The console's review queue (`/admin/store/reviews`, `role:store_manager`).
 *
 * Imported by path rather than through `@/lib/admin`'s index: the feature's
 * calls are one file, and the index is a list other branches are editing.
 */

export type AdminReviewParams = {
  status?: string; rating?: string; product?: string; verified?: string; q?: string;
  sort?: string; dir?: string; page?: number; per_page?: number;
};

export async function getAdminReviews(params: AdminReviewParams = {}): Promise<AdminReviewList> {
  return apiFetch<AdminReviewList>(`/admin/store/reviews${query(params)}`, { token: await token() });
}

/** One review or fifty, through one door; the API answers which product pages to refresh. */
export async function moderateReviews(ids: number[], status: string) {
  return apiFetch<{ data: { moved: number; pending_count: number; slugs: string[] } }>("/admin/store/reviews/moderate", {
    method: "POST",
    body: { ids, status },
    token: await token(),
  });
}

export async function featureReview(id: number, featured: boolean) {
  return apiFetch(`/admin/store/reviews/${id}`, { method: "PATCH", body: { is_featured: featured }, token: await token() });
}

export async function deleteReview(id: number) {
  return apiFetch(`/admin/store/reviews/${id}`, { method: "DELETE", token: await token() });
}
