"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import {
  createProductCategory, deleteProductCategory, updateProductCategory,
  type ProductCategoryPayload,
} from "@/lib/admin";
import { seoFromFormData, str } from "@/lib/admin-form";

export type ProductCategoryFormState = { error?: string; fieldErrors?: Record<string, string[]> };

/** No status: categories are taxonomy. See StoreProductCategoryRequest. */
function payloadFrom(formData: FormData): ProductCategoryPayload {
  const seo = seoFromFormData(formData);
  const sortOrder = str(formData, "sort_order");
  const parent = str(formData, "parent_id");

  return {
    name: str(formData, "name") ?? "",
    slug: str(formData, "slug"),
    description: str(formData, "description"),
    icon: str(formData, "icon"),
    // "" from the select means "top level", which is null, not 0.
    parent_id: parent ? Number(parent) : null,
    sort_order: sortOrder ? Number(sortOrder) : 0,
    ...(seo ? { seo: seo as ProductCategoryPayload["seo"] } : {}),
  };
}

function toState(error: unknown): ProductCategoryFormState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Your account cannot edit content." };
  }
  return { error: "We could not save the category. Try again shortly." };
}

export async function createProductCategoryAction(
  _p: ProductCategoryFormState, formData: FormData,
): Promise<ProductCategoryFormState> {
  let id: number;
  try {
    id = (await createProductCategory(payloadFrom(formData))).id;
  } catch (error) { return toState(error); }

  revalidatePath("/admin/product-categories");
  redirect(`/admin/product-categories/${id}?saved=1`);
}

export async function updateProductCategoryAction(
  _p: ProductCategoryFormState, formData: FormData,
): Promise<ProductCategoryFormState> {
  const id = Number(formData.get("id"));
  if (!id) return { error: "Missing category id." };

  try { await updateProductCategory(id, payloadFrom(formData)); }
  catch (error) { return toState(error); }

  revalidatePath("/admin/product-categories");
  revalidatePath(`/admin/product-categories/${id}`);
  redirect(`/admin/product-categories/${id}?saved=1`);
}

export async function deleteProductCategoryAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;
  await deleteProductCategory(id).catch(() => null);
  revalidatePath("/admin/product-categories");
  redirect("/admin/product-categories?deleted=1");
}
