"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
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
    image_path: str(formData, "image_path"),
    // "" from the select means "top level", which is null, not 0.
    parent_id: parent ? Number(parent) : null,
    sort_order: sortOrder ? Number(sortOrder) : 0,
    // An unticked checkbox submits nothing, so absence is the answer,
    // not a missing value to leave alone.
    show_in_menu: formData.get("show_in_menu") === "1",
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
    const category = await createProductCategory(payloadFrom(formData));
    id = category.id;
    // The homepage grid and the /products index both read this tag, and
    // without it a new category's icon, name or image sits behind the
    // 10-minute revalidate window instead of showing up the moment it is
    // saved — the same fix this project's own menu and slider actions apply.
    updateTag("product-categories");
    updateTag(`product-category:${category.slug}`);
  } catch (error) { return toState(error); }

  revalidatePath("/admin/product-categories");
  redirect(`/admin/product-categories/${id}?saved=1`);
}

export async function updateProductCategoryAction(
  _p: ProductCategoryFormState, formData: FormData,
): Promise<ProductCategoryFormState> {
  const id = Number(formData.get("id"));
  if (!id) return { error: "Missing category id." };

  try {
    const category = await updateProductCategory(id, payloadFrom(formData));
    updateTag("product-categories");
    updateTag(`product-category:${category.slug}`);
  } catch (error) { return toState(error); }

  revalidatePath("/admin/product-categories");
  revalidatePath(`/admin/product-categories/${id}`);
  redirect(`/admin/product-categories/${id}?saved=1`);
}

export async function deleteProductCategoryAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;
  await deleteProductCategory(id).catch(() => null);
  updateTag("product-categories");
  revalidatePath("/admin/product-categories");
  redirect("/admin/product-categories?deleted=1");
}
