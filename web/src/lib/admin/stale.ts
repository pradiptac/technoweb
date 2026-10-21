import { ApiError } from "@/lib/api";

/**
 * The stale-save guard's two fields (C2, docs/notifications.md), forwarded by
 * every update action of the page-history kinds. The API compares
 * `base_updated_at` with the record's own and refuses an older one unless
 * `overwrite` is set. Imported only by `"use server"` action files.
 */
export function staleFields(formData: FormData): { base_updated_at?: string; overwrite?: boolean } {
  const base = formData.get("base_updated_at");
  return {
    ...(typeof base === "string" && base !== "" ? { base_updated_at: base } : {}),
    ...(formData.get("overwrite") === "1" ? { overwrite: true } : {}),
  };
}

/** A 422 that is the stale refusal, as a form state — without the generic "check the fields" alert. */
export function staleState(error: unknown): { fieldErrors: Record<string, string[]> } | null {
  return error instanceof ApiError && error.status === 422 && error.errors?.stale?.length
    ? { fieldErrors: { stale: error.errors.stale } }
    : null;
}
