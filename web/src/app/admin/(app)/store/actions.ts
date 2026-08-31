"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import {
  createStoreCategory, createStoreProduct, deleteStoreCategory, deleteStoreProduct,
  updateStoreCategory, updateStoreProduct,
} from "@/lib/admin";
import { jsonListFromFormData, seoFromFormData, str } from "@/lib/admin-form";
import { rupeesToPaise } from "@/lib/money";
import type { AdminProductVariation, PublishStatus, StoreProductType } from "@/types/api";

export type StoreFormState = { error?: string; fieldErrors?: Record<string, string[]> };

/**
 * Rupees in the form, paise on the wire.
 *
 * `rupeesToPaise` parses the text rather than multiplying a float, so "11800.10"
 * is 1180010 and not 1180009.9999999999. A blank stays null — a nullable price
 * has to be able to be cleared, and reading blank as 0 would put a free product
 * in the shop.
 */
const paise = (formData: FormData, key: string) => rupeesToPaise(str(formData, key));

function productPayload(formData: FormData): Record<string, unknown> {
  const seo = seoFromFormData(formData);
  const category = str(formData, "store_category_id");
  const brand = str(formData, "brand_id");
  const sortOrder = str(formData, "sort_order");

  let specifications: Record<string, string> = {};
  const rawSpecs = str(formData, "specifications");
  if (rawSpecs) {
    try {
      const parsed = JSON.parse(rawSpecs);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) specifications = parsed;
    } catch {
      // A malformed hidden field should not cost the editor the rest of the
      // form; the API validates the contents regardless.
    }
  }

  return {
    name: str(formData, "name") ?? "",
    slug: str(formData, "slug"),
    sku: str(formData, "sku"),
    type: (str(formData, "type") ?? "physical") as StoreProductType,
    // "" from a select means "none", which is null rather than 0.
    store_category_id: category ? Number(category) : null,
    brand_id: brand ? Number(brand) : null,
    short_description: str(formData, "short_description"),
    description: str(formData, "description"),
    price_paise: paise(formData, "price"),
    compare_at_paise: paise(formData, "compare_at"),
    track_stock: formData.get("track_stock") === "1",
    stock: Number(str(formData, "stock") ?? 0) || 0,
    returnable: formData.get("returnable") === "1",
    status: (str(formData, "status") ?? "draft") as PublishStatus,
    is_featured: formData.get("is_featured") === "1",
    sort_order: sortOrder ? Number(sortOrder) : 0,
    specifications,
    features: jsonListFromFormData<string>(formData, "features"),
    images: formData.getAll("images").map(String).filter(Boolean),
    variations: jsonListFromFormData<AdminProductVariation>(formData, "variations"),
    ...(seo ? { seo } : {}),
  };
}

function toState(error: unknown, noun: string): StoreFormState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Your account cannot manage the store." };
  }

  return { error: `We could not save the ${noun}. Try again shortly.` };
}

export async function createStoreProductAction(_p: StoreFormState, formData: FormData): Promise<StoreFormState> {
  let id: number;

  try {
    id = (await createStoreProduct(productPayload(formData))).id;
  } catch (error) {
    return toState(error, "product");
  }

  revalidatePath("/admin/store/products");
  redirect(`/admin/store/products/${id}?saved=1`);
}

export async function updateStoreProductAction(_p: StoreFormState, formData: FormData): Promise<StoreFormState> {
  const id = Number(formData.get("id"));

  if (!id) return { error: "Missing product id." };

  try {
    await updateStoreProduct(id, productPayload(formData));
  } catch (error) {
    return toState(error, "product");
  }

  revalidatePath("/admin/store/products");
  revalidatePath(`/admin/store/products/${id}`);
  redirect(`/admin/store/products/${id}?saved=1`);
}

export async function deleteStoreProductAction(formData: FormData) {
  const id = Number(formData.get("id"));

  if (!id) return;

  await deleteStoreProduct(id).catch(() => null);
  revalidatePath("/admin/store/products");
  redirect("/admin/store/products?done=store-product-deleted");
}

/* -------------------------------------------------------------- categories */

function categoryPayload(formData: FormData): Record<string, unknown> {
  const sortOrder = str(formData, "sort_order");

  return {
    name: str(formData, "name") ?? "",
    slug: str(formData, "slug"),
    description: str(formData, "description"),
    image_path: str(formData, "image_path"),
    is_active: formData.get("is_active") === "1",
    sort_order: sortOrder ? Number(sortOrder) : 0,
  };
}

export async function createStoreCategoryAction(_p: StoreFormState, formData: FormData): Promise<StoreFormState> {
  try {
    await createStoreCategory(categoryPayload(formData));
  } catch (error) {
    return toState(error, "category");
  }

  revalidatePath("/admin/store/categories");
  redirect("/admin/store/categories?done=store-category-saved");
}

export async function updateStoreCategoryAction(_p: StoreFormState, formData: FormData): Promise<StoreFormState> {
  const id = Number(formData.get("id"));

  if (!id) return { error: "Missing category id." };

  try {
    await updateStoreCategory(id, categoryPayload(formData));
  } catch (error) {
    return toState(error, "category");
  }

  revalidatePath("/admin/store/categories");
  redirect("/admin/store/categories?done=store-category-saved");
}

export async function deleteStoreCategoryAction(formData: FormData) {
  const id = Number(formData.get("id"));

  if (!id) return;

  await deleteStoreCategory(id).catch(() => null);
  revalidatePath("/admin/store/categories");
  redirect("/admin/store/categories?done=store-category-deleted");
}
