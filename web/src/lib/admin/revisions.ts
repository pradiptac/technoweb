import "server-only";
import { ApiError, apiFetch } from "@/lib/api";
import { query, token } from "./_shared";
import type { RevisionDetail, RevisionList, RevisionType } from "@/types/revisions";

/**
 * Page history (0.145.0, `docs/page-builder.md` "Page history"). Read-only:
 * a restore is the console loading a snapshot into the edit form.
 */

/**
 * A record's saved versions, newest first, or **null when this account cannot
 * read them** (a 403) or the API predates the route (a 404). The panel draws
 * nothing for null: a History button the account would only be refused on is
 * worse than none.
 */
export async function getRevisions(type: RevisionType, id: number): Promise<RevisionList | null> {
  try {
    return await apiFetch<RevisionList>(`/admin/revisions${query({ type, id })}`, { token: await token() });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return null;
    throw error;
  }
}

/** One version with its snapshot. */
export async function getRevision(id: number): Promise<RevisionDetail> {
  return apiFetch<RevisionDetail>(`/admin/revisions/${id}`, { token: await token() });
}
