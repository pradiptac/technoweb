import "server-only";
import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { ApiError, apiFetch } from "@/lib/api";
import { BULK_ACTIONS, type BulkAction, type BulkResult, type BulkState } from "@/types/bulk";
import { token } from "./_shared";

/**
 * Bulk actions on a console list (0.139.0, `docs/admin-console.md`).
 *
 * `POST /admin/{path}/bulk` takes `ids` and one `action` and answers 200
 * whatever happened: `updated` (the ids it moved) and `refused` (the rows it
 * would not, each with its title and the sentence the edit screen would have
 * given). An id that does not exist is in neither list.
 */
export async function bulkRecords(path: string, ids: number[], action: BulkAction): Promise<BulkResult> {
  return apiFetch<BulkResult>(`/admin/${path}/bulk`, { method: "POST", body: { ids, action }, token: await token() });
}

/** What a list's bulk Server Action needs to know about the list. */
export type BulkSpec = {
  /** The admin path under `/api/v1/admin/`, e.g. `blog-posts`. */
  path: string;
  /** "post", "posts" — the sentence names what it moved. */
  noun: readonly [string, string];
  /**
   * The cache tags the list's own create, update and delete actions purge —
   * the public site's copy of these records — and only when something moved.
   */
  tags: readonly string[];
  /** The console paths to refresh, the list first. */
  paths: readonly string[];
};

const VERB: Record<BulkAction, string> = {
  publish: "published",
  draft: "moved to draft",
  archive: "archived",
  delete: "deleted",
};

const count = (n: number, noun: readonly [string, string]) => `${n} ${n === 1 ? noun[0] : noun[1]}`;

/**
 * The body of every list's bulk Server Action: read the ticks, ask the API,
 * purge **only if it moved something**, and say what happened.
 *
 * A refusal changes nothing, so it purges nothing — the rule the delete
 * actions follow (a delete purges only once the API accepted it), here per
 * row: a batch in which every row was refused leaves the caches alone.
 * `redirect()` for a lapsed session is thrown from the catch, never caught
 * again.
 */
export async function runBulkAction(formData: FormData, spec: BulkSpec): Promise<BulkState> {
  const ids = [...new Set(formData.getAll("ids").map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const action = String(formData.get("action") ?? "") as BulkAction;

  if (ids.length === 0) return { error: "Tick at least one row first." };
  if (!BULK_ACTIONS.includes(action)) return { error: "Choose what to do with them." };
  if (ids.length > 100) return { error: "Act on up to 100 rows at a time." };

  let result: BulkResult;

  try {
    result = await bulkRecords(spec.path, ids, action);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/admin/login");
      if (error.status === 403) return { error: "Your account cannot change these." };
      if (error.status === 422) return { error: error.errors ? Object.values(error.errors)[0]?.[0] ?? error.message : error.message };
    }

    return { error: "We could not reach the admin API. Nothing was changed." };
  }

  if (result.updated.length > 0) {
    for (const tag of spec.tags) updateTag(tag);
    for (const path of spec.paths) revalidatePath(path);
  }

  const refused = result.refused;

  if (result.updated.length === 0) {
    return {
      error: refused.length > 0
        ? `Nothing was ${VERB[action]}.`
        : "Those rows are no longer there.",
      refused,
    };
  }

  return {
    ok: `${count(result.updated.length, spec.noun)} ${VERB[action]}.${refused.length > 0 ? ` ${refused.length} could not be.` : ""}`,
    refused,
  };
}
