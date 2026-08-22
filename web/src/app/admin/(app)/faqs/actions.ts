"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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

export async function createFaqAction(_p: FaqFormState, formData: FormData): Promise<FaqFormState> {
  let id: number;
  try { id = (await createFaq(payloadFrom(formData))).id; }
  catch (error) { return toState(error); }

  revalidatePath("/admin/faqs");
  redirect(`/admin/faqs/${id}?saved=1`);
}

export async function updateFaqAction(_p: FaqFormState, formData: FormData): Promise<FaqFormState> {
  const id = Number(formData.get("id"));
  if (!id) return { error: "Missing FAQ id." };

  try { await updateFaq(id, payloadFrom(formData)); }
  catch (error) { return toState(error); }

  revalidatePath("/admin/faqs");
  revalidatePath(`/admin/faqs/${id}`);
  redirect(`/admin/faqs/${id}?saved=1`);
}

export async function deleteFaqAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;
  await deleteFaq(id).catch(() => null);
  revalidatePath("/admin/faqs");
  redirect("/admin/faqs?deleted=1");
}
