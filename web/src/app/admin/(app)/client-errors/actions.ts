"use server";

import { revalidatePath } from "next/cache";
import { resolveClientError } from "@/lib/admin";

export type ResolveState = { error?: string };

/**
 * Mark a failure dealt with.
 *
 * It re-opens by itself. `ClientError::report()` clears `resolved_at` on every
 * report, so a fix that did not hold says so the next time somebody hits it —
 * which is why this is a tick rather than a delete, and why the row is kept
 * until it ages out. A row deleted is a bug that comes back looking new.
 */
export async function resolveErrorAction(
  _previous: ResolveState,
  formData: FormData,
): Promise<ResolveState> {
  const id = Number(formData.get("id"));

  if (!id) return { error: "That report could not be found." };

  try {
    await resolveClientError(id);
  } catch {
    return { error: "We could not mark that as dealt with." };
  }

  revalidatePath("/admin/client-errors");

  return {};
}
