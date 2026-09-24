"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { createCannedReply, deleteCannedReply, updateCannedReply, type CannedReplyPayload } from "@/lib/admin";

export type SavedReplyState = { error?: string; fieldErrors?: Record<string, string[]> };

function payload(formData: FormData): CannedReplyPayload {
  const str = (k: string) => String(formData.get(k) ?? "");

  return {
    title: str("title").trim(),
    // Not trimmed: a reply that ends in a sign-off line keeps its newline.
    body: str("body").replace(/\r\n/g, "\n"),
    sort_order: Number(str("sort_order")) || 0,
  };
}

function fail(error: unknown): SavedReplyState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Your account cannot manage saved replies." };
  }
  return { error: "We could not save the reply. Try again shortly." };
}

/**
 * The list, the edit screen and every ticket page's picker read these; the
 * console paths rather than a tag, because the ticket detail is dynamic
 * and the per-ticket fill is never cached.
 */
function changed(id?: number): void {
  revalidatePath("/admin/tickets/saved-replies");
  if (id) revalidatePath(`/admin/tickets/saved-replies/${id}`);
  revalidatePath("/admin/tickets/[reference]", "page");
}

export async function createSavedReplyAction(_prev: SavedReplyState, formData: FormData): Promise<SavedReplyState> {
  let id: number;
  try {
    id = (await createCannedReply(payload(formData))).id;
    changed(id);
  } catch (error) {
    return fail(error);
  }

  redirect(`/admin/tickets/saved-replies/${id}?done=created`);
}

export async function updateSavedReplyAction(id: number, _prev: SavedReplyState, formData: FormData): Promise<SavedReplyState> {
  try {
    await updateCannedReply(id, payload(formData));
    changed(id);
  } catch (error) {
    return fail(error);
  }

  redirect(`/admin/tickets/saved-replies/${id}?done=saved`);
}

export async function deleteSavedReplyAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));

  if (Number.isFinite(id) && id > 0) {
    await deleteCannedReply(id).catch(() => null);
    changed(id);
  }

  redirect("/admin/tickets/saved-replies?done=saved-reply-deleted");
}
