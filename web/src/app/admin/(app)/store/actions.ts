"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { ApiError } from "@/lib/api";
import {
  analyseStoreImport, createStoreCategory, createStoreProduct, deleteStoreCategory, deleteStoreProduct, runStoreImport,
  saveStorePromo, updateStoreCategory, updateStoreProduct,
} from "@/lib/admin";
import { jsonListFromFormData, seoFromFormData, str } from "@/lib/admin-form";
import { rupeesToPaise } from "@/lib/money";
import type { AdminProductVariation, AnswerBlock, FaqItem, PublishStatus, StoreImportAnalysis, StoreImportResult, StoreProductType } from "@/types/api";

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
    // The Shopping tab. Blank identifiers are sent as null rather than "",
    // so a cleared field clears the column instead of storing an empty
    // string the feed would then have to treat as absent.
    gtin: str(formData, "gtin"),
    mpn: str(formData, "mpn"),
    condition: str(formData, "condition") ?? "new",
    google_product_category: str(formData, "google_product_category"),
    weight_grams: str(formData, "weight_grams") ? Number(str(formData, "weight_grams")) : null,
    feed_include: formData.get("feed_include") === "1",
    status: (str(formData, "status") ?? "draft") as PublishStatus,
    is_featured: formData.get("is_featured") === "1",
    sort_order: sortOrder ? Number(sortOrder) : 0,
    specifications,
    features: jsonListFromFormData<string>(formData, "features"),
    images: formData.getAll("images").map(String).filter(Boolean),
    variations: jsonListFromFormData<AdminProductVariation>(formData, "variations"),
    // Product AEO (docs/aeo-geo-contract.md §3). `service_ids` is the
    // RelationPicker's one-entry-per-box convention, read back with getAll().
    warranty: str(formData, "warranty"),
    applications: str(formData, "applications"),
    service_ids: formData.getAll("service_ids").map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0),
    faqs: jsonListFromFormData<FaqItem>(formData, "faqs"),
    answer_blocks: jsonListFromFormData<AnswerBlock>(formData, "answer_blocks"),
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

/*
 * `updateTag` first, then the admin path. The public site reads every one of
 * these records through ISR-cached fetches tagged by collection, and the
 * detail routes are cached whole since they gained `generateStaticParams`
 * — so without the tag a save reached the public page only when the fetch's
 * revalidate window (five to ten minutes) ran out. `updateTag` rather than
 * `revalidateTag` gives read-your-own-writes: the editor who saved sees the
 * change on the next request, not the next window.
 */
export async function createStoreProductAction(_p: StoreFormState, formData: FormData): Promise<StoreFormState> {
  let id: number;

  try {
    id = (await createStoreProduct(productPayload(formData))).id;
  } catch (error) {
    return toState(error, "product");
  }

  updateTag("store-products");
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

  updateTag("store-products");
  revalidatePath("/admin/store/products");
  revalidatePath(`/admin/store/products/${id}`);
  redirect(`/admin/store/products/${id}?saved=1`);
}

export async function deleteStoreProductAction(formData: FormData) {
  const id = Number(formData.get("id"));

  if (!id) return;

  await deleteStoreProduct(id).catch(() => null);
  updateTag("store-products");
  revalidatePath("/admin/store/products");
  redirect("/admin/store/products?done=store-product-deleted");
}

/* ------------------------------------------------------------ the import */

/**
 * The first refusal in the API's own words, or the fallback. A 422 here
 * names the file or the mapping, which is what somebody needs to read.
 */
function importRefusal(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/admin/login");
    const first = error.errors ? Object.values(error.errors)[0]?.[0] : null;
    return first ?? error.message ?? fallback;
  }

  return fallback;
}

/** Step one: the dry run. Writes no product. */
export async function analyseStoreImportAction(form: FormData): Promise<
  { analysis?: StoreImportAnalysis; error?: string }
> {
  try {
    return { analysis: await analyseStoreImport(form) };
  } catch (error) {
    return { error: importRefusal(error, "That file could not be read.") };
  }
}

/**
 * Step two: commit. `updateTag` afterwards, because a spreadsheet of prices
 * is exactly the change that must reach the shop on the next request and
 * not when the fetch's window runs out.
 */
export async function runStoreImportAction(payload: Record<string, unknown>): Promise<
  { result?: StoreImportResult; error?: string }
> {
  let result: StoreImportResult;

  try {
    result = await runStoreImport(payload);
  } catch (error) {
    return { error: importRefusal(error, "That import could not be completed.") };
  }

  updateTag("store-products");
  revalidatePath("/admin/store/products");
  revalidatePath("/admin/store");

  return { result };
}

/* -------------------------------------------------------------- categories */

function categoryPayload(formData: FormData): Record<string, unknown> {
  const sortOrder = str(formData, "sort_order");
  const seo = seoFromFormData(formData);

  return {
    name: str(formData, "name") ?? "",
    slug: str(formData, "slug"),
    description: str(formData, "description"),
    google_product_category: str(formData, "google_product_category"),
    icon_path: str(formData, "icon_path"),
    image_path: str(formData, "image_path"),
    is_active: formData.get("is_active") === "1",
    sort_order: sortOrder ? Number(sortOrder) : 0,
    // The specification filters, an ordered list replaced wholesale.
    filter_specs: jsonListFromFormData<string>(formData, "filter_specs").filter((l) => typeof l === "string"),
    faqs: jsonListFromFormData<FaqItem>(formData, "faqs"),
    answer_blocks: jsonListFromFormData<AnswerBlock>(formData, "answer_blocks"),
    ...(seo ? { seo } : {}),
  };
}

export async function createStoreCategoryAction(_p: StoreFormState, formData: FormData): Promise<StoreFormState> {
  try {
    await createStoreCategory(categoryPayload(formData));
  } catch (error) {
    return toState(error, "category");
  }

  updateTag("store-categories");
  updateTag("store-products");
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

  updateTag("store-categories");
  updateTag("store-products");
  revalidatePath("/admin/store/categories");
  redirect("/admin/store/categories?done=store-category-saved");
}

export async function deleteStoreCategoryAction(formData: FormData) {
  const id = Number(formData.get("id"));

  if (!id) return;

  await deleteStoreCategory(id).catch(() => null);
  updateTag("store-categories");
  updateTag("store-products");
  revalidatePath("/admin/store/categories");
  redirect("/admin/store/categories?done=store-category-deleted");
}

export type PromoFormState = { error?: string; ok?: boolean };

/**
 * The promo band's save. Every control on the screen is a `setting__*` input
 * — the contract `saveSettingsAction` established — and the Store endpoint
 * refuses any key outside the band by name, so nothing this form could carry
 * reaches another setting.
 */
export async function savePromoAction(_prev: PromoFormState, formData: FormData): Promise<PromoFormState> {
  const settings = [...formData.entries()]
    .filter(([name]) => name.startsWith("setting__"))
    .map(([name, value]) => ({
      key: name.replace("setting__", ""),
      value: typeof value === "string" ? value.trim() : "",
    }));

  if (settings.length === 0) return { error: "Nothing to save." };

  try {
    await saveStorePromo(settings);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/admin/login");
      if (error.status === 403) return { error: "Only a store manager or an administrator can change the promo banners." };
      if (error.status === 422) {
        const first = Object.values(error.errors ?? {}).flat()[0];
        return { error: typeof first === "string" ? first : "Some values were rejected. Check the fields and try again." };
      }
    }
    return { error: "We could not save the promo banners. Try again shortly." };
  }

  revalidatePath("/admin/store/promo");
  // The band reads the public settings map, which is cached under this tag;
  // updateTag so the editor sees the change on the next visit to /store.
  updateTag("settings");

  return { ok: true };
}
