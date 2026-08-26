"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { createIndustry, deleteIndustry, updateIndustry, type IndustryPayload } from "@/lib/admin";
import { seoFromFormData, str } from "@/lib/admin-form";

export type IndustryFormState = { error?: string; fieldErrors?: Record<string, string[]> };

/**
 * Industries differ from the other content entities: the title column is
 * `name`, there is no publish status, and they carry a solutions relation.
 */
function payloadFrom(formData: FormData): IndustryPayload {
  const seo = seoFromFormData(formData);
  const sortOrder = str(formData, "sort_order");

  return {
    name: str(formData, "name") ?? "",
    slug: str(formData, "slug"),
    summary: str(formData, "summary"),
    body: str(formData, "body"),
    icon: str(formData, "icon"),
    sort_order: sortOrder ? Number(sortOrder) : 0,
    // An unticked checkbox submits nothing, so absence is the answer,
    // not a missing value to leave alone.
    show_in_menu: formData.get("show_in_menu") === "1",
    solution_ids: formData.getAll("solution_ids")
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n > 0),
    ...(seo ? { seo: seo as IndustryPayload["seo"] } : {}),
  };
}

function toState(error: unknown): IndustryFormState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Your account cannot edit content." };
  }
  return { error: "We could not save the industry. Try again shortly." };
}

export async function createIndustryAction(_p: IndustryFormState, formData: FormData): Promise<IndustryFormState> {
  let id: number;
  try {
    id = (await createIndustry(payloadFrom(formData))).id;
  } catch (error) { return toState(error); }

  revalidatePath("/admin/industries");
  redirect(`/admin/industries/${id}?saved=1`);
}

export async function updateIndustryAction(_p: IndustryFormState, formData: FormData): Promise<IndustryFormState> {
  const id = Number(formData.get("id"));
  if (!id) return { error: "Missing industry id." };

  try { await updateIndustry(id, payloadFrom(formData)); }
  catch (error) { return toState(error); }

  revalidatePath("/admin/industries");
  revalidatePath(`/admin/industries/${id}`);
  redirect(`/admin/industries/${id}?saved=1`);
}

export async function deleteIndustryAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;
  await deleteIndustry(id).catch(() => null);
  revalidatePath("/admin/industries");
  redirect("/admin/industries?deleted=1");
}
