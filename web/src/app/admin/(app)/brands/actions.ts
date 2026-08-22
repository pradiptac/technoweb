"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { createBrand, deleteBrand, updateBrand, type BrandPayload } from "@/lib/admin";
import { str } from "@/lib/admin-form";

export type BrandFormState = { error?: string; fieldErrors?: Record<string, string[]> };

/**
 * No SEO block and no status: a brand is a filter facet on the product
 * listing, not a page. See StoreBrandRequest.
 */
function payloadFrom(formData: FormData): BrandPayload {
  const sortOrder = str(formData, "sort_order");

  return {
    name: str(formData, "name") ?? "",
    slug: str(formData, "slug"),
    description: str(formData, "description"),
    logo_path: str(formData, "logo_path"),
    sort_order: sortOrder ? Number(sortOrder) : 0,
    is_featured: formData.get("is_featured") === "1",
  };
}

function toState(error: unknown): BrandFormState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Your account cannot edit content." };
  }
  return { error: "We could not save the brand. Try again shortly." };
}

export async function createBrandAction(_p: BrandFormState, formData: FormData): Promise<BrandFormState> {
  let id: number;
  try {
    id = (await createBrand(payloadFrom(formData))).id;
  } catch (error) { return toState(error); }

  revalidatePath("/admin/brands");
  redirect(`/admin/brands/${id}?saved=1`);
}

export async function updateBrandAction(_p: BrandFormState, formData: FormData): Promise<BrandFormState> {
  const id = Number(formData.get("id"));
  if (!id) return { error: "Missing brand id." };

  try { await updateBrand(id, payloadFrom(formData)); }
  catch (error) { return toState(error); }

  revalidatePath("/admin/brands");
  revalidatePath(`/admin/brands/${id}`);
  redirect(`/admin/brands/${id}?saved=1`);
}

export async function deleteBrandAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;
  await deleteBrand(id).catch(() => null);
  revalidatePath("/admin/brands");
  redirect("/admin/brands?deleted=1");
}
