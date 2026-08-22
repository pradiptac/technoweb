"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { createProduct, deleteProduct, updateProduct, type ProductPayload } from "@/lib/admin";
import { jsonListFromFormData, seoFromFormData, str } from "@/lib/admin-form";
import type { FaqItem, PublishStatus } from "@/types/api";

export type ProductFormState = { error?: string; fieldErrors?: Record<string, string[]> };

const ids = (formData: FormData, key: string) =>
  formData.getAll(key).map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);

function payloadFrom(formData: FormData): ProductPayload {
  const seo = seoFromFormData(formData);
  const sortOrder = str(formData, "sort_order");
  const brand = str(formData, "brand_id");
  const category = str(formData, "product_category_id");

  // SpecField submits the map already assembled, since that is the shape the
  // API and the public page both use.
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
    // "" from a select means "none", which is null rather than 0.
    brand_id: brand ? Number(brand) : null,
    product_category_id: category ? Number(category) : null,
    short_description: str(formData, "short_description"),
    description: str(formData, "description"),
    datasheet_path: str(formData, "datasheet_path"),
    status: (str(formData, "status") ?? "draft") as PublishStatus,
    is_featured: formData.get("is_featured") === "1",
    sort_order: sortOrder ? Number(sortOrder) : 0,
    specifications,
    features: jsonListFromFormData<string>(formData, "features"),
    images: formData.getAll("images").map(String).filter(Boolean),
    solution_ids: ids(formData, "solution_ids"),
    related_product_ids: ids(formData, "related_product_ids"),
    faqs: jsonListFromFormData<FaqItem>(formData, "faqs"),
    ...(seo ? { seo: seo as ProductPayload["seo"] } : {}),
  };
}

function toState(error: unknown): ProductFormState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Your account cannot edit content." };
  }
  return { error: "We could not save the product. Try again shortly." };
}

export async function createProductAction(_p: ProductFormState, formData: FormData): Promise<ProductFormState> {
  let id: number;
  try {
    id = (await createProduct(payloadFrom(formData))).id;
  } catch (error) { return toState(error); }

  revalidatePath("/admin/products");
  redirect(`/admin/products/${id}?saved=1`);
}

export async function updateProductAction(_p: ProductFormState, formData: FormData): Promise<ProductFormState> {
  const id = Number(formData.get("id"));
  if (!id) return { error: "Missing product id." };

  try { await updateProduct(id, payloadFrom(formData)); }
  catch (error) { return toState(error); }

  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${id}`);
  redirect(`/admin/products/${id}?saved=1`);
}

export async function deleteProductAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;
  await deleteProduct(id).catch(() => null);
  revalidatePath("/admin/products");
  redirect("/admin/products?deleted=1");
}
