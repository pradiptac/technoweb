"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { ApiError } from "@/lib/api";
import { createFaq, deleteFaq, updateFaq, type FaqPayload } from "@/lib/admin";
import { str } from "@/lib/admin-form";

export type FaqFormState = { error?: string; fieldErrors?: Record<string, string[]> };

/**
 * The owner arrives as one "type:id" value from a single select, because
 * asking an editor to pick a type and then a record in two dependent selects
 * is a worse way to answer the same question.
 */
function payloadFrom(formData: FormData): FaqPayload {
  const [ownerType, ownerId] = (str(formData, "owner") ?? "").split(":");
  const sortOrder = str(formData, "sort_order");

  return {
    question: str(formData, "question") ?? "",
    answer: str(formData, "answer") ?? "",
    sort_order: sortOrder ? Number(sortOrder) : 0,
    ...(ownerType && ownerId ? { owner_type: ownerType, owner_id: Number(ownerId) } : {}),
  };
}

function toState(error: unknown): FaqFormState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Your account cannot edit content." };
  }
  return { error: "We could not save the FAQ. Try again shortly." };
}

/*
 * `updateTag` first, then the admin path. The public site reads every one of
 * these records through ISR-cached fetches tagged by collection, and the
 * detail routes are cached whole since they gained `generateStaticParams`
 * — so without the tag a save reached the public page only when the fetch's
 * revalidate window (five to ten minutes) ran out. `updateTag` rather than
 * `revalidateTag` gives read-your-own-writes: the editor who saved sees the
 * change on the next request, not the next window.
 */
export async function createFaqAction(_p: FaqFormState, formData: FormData): Promise<FaqFormState> {
  let id: number;
  try { id = (await createFaq(payloadFrom(formData))).id; }
  catch (error) { return toState(error); }

  updateTag("solutions");
  updateTag("services");
  updateTag("products");
  updateTag("pages");
  revalidatePath("/admin/faqs");
  redirect(`/admin/faqs/${id}?saved=1`);
}

export async function updateFaqAction(_p: FaqFormState, formData: FormData): Promise<FaqFormState> {
  const id = Number(formData.get("id"));
  if (!id) return { error: "Missing FAQ id." };

  try { await updateFaq(id, payloadFrom(formData)); }
  catch (error) { return toState(error); }

  updateTag("solutions");
  updateTag("services");
  updateTag("products");
  updateTag("pages");
  revalidatePath("/admin/faqs");
  revalidatePath(`/admin/faqs/${id}`);
  redirect(`/admin/faqs/${id}?saved=1`);
}

export async function deleteFaqAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;
  await deleteFaq(id).catch(() => null);
  updateTag("solutions");
  updateTag("services");
  updateTag("products");
  updateTag("pages");
  revalidatePath("/admin/faqs");
  redirect("/admin/faqs?deleted=1");
}
