"use server";

import { runBulkAction } from "@/lib/admin/bulk";
import type { BulkState } from "@/types/bulk";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { ApiError } from "@/lib/api";
import {
  createServiceCategory, deleteServiceCategory, updateServiceCategory,
  type ServiceCategoryPayload,
} from "@/lib/admin";
import { str } from "@/lib/admin-form";

export type ServiceCategoryFormState = { error?: string; fieldErrors?: Record<string, string[]> };

/** No status and no SEO: a service category is taxonomy with no page of its own. */
function payloadFrom(formData: FormData): ServiceCategoryPayload {
  const sortOrder = str(formData, "sort_order");

  return {
    name: str(formData, "name") ?? "",
    slug: str(formData, "slug"),
    description: str(formData, "description"),
    icon: str(formData, "icon"),
    sort_order: sortOrder ? Number(sortOrder) : 0,
    // An unticked checkbox submits nothing, so absence is the answer.
    image_background: formData.get("image_background") === "1",
    is_active: formData.get("is_active") === "1",
  };
}

function toState(error: unknown): ServiceCategoryFormState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Your account cannot edit content." };
  }
  return { error: "We could not save the category. Try again shortly." };
}

/*
 * `updateTag("services")`: the homepage's services section and /services
 * both group the services by these rows, and read them under that tag.
 * Without it a renamed or reordered category would wait out the ISR window.
 */
export async function createServiceCategoryAction(
  _p: ServiceCategoryFormState, formData: FormData,
): Promise<ServiceCategoryFormState> {
  let id: number;
  try {
    id = (await createServiceCategory(payloadFrom(formData))).id;
  } catch (error) { return toState(error); }

  updateTag("services");
  revalidatePath("/admin/service-categories");
  redirect(`/admin/service-categories/${id}?saved=1`);
}

export async function updateServiceCategoryAction(
  _p: ServiceCategoryFormState, formData: FormData,
): Promise<ServiceCategoryFormState> {
  const id = Number(formData.get("id"));
  if (!id) return { error: "Missing category id." };

  try { await updateServiceCategory(id, payloadFrom(formData)); }
  catch (error) { return toState(error); }

  updateTag("services");
  revalidatePath("/admin/service-categories");
  revalidatePath(`/admin/service-categories/${id}`);
  redirect(`/admin/service-categories/${id}?saved=1`);
}

export async function deleteServiceCategoryAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;
  // Only a delete the API accepted may purge anything.
  const deleted = await deleteServiceCategory(id).then(() => true, () => false);
  if (!deleted) redirect("/admin/service-categories?done=not-deleted");
  updateTag("services");
  revalidatePath("/admin/service-categories");
  revalidatePath("/admin/services");
  redirect("/admin/service-categories?deleted=1");
}

/** The ticked rows of the list: publish, draft, archive or delete — see `lib/admin/bulk.ts`. */
export async function bulkServiceCategoriesAction(_prev: BulkState, formData: FormData): Promise<BulkState> {
  return runBulkAction(formData, {
    path: "service-categories",
    noun: ["category", "categories"],
    tags: ["services"],
    paths: ["/admin/service-categories", "/admin/services"],
  });
}
