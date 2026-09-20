import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getBrandOptions, getStoreCategories } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { StoreProductForm } from "../store-product-form";
import type { AdminStoreCategory, PickerOption } from "@/types/api";

export const metadata = buildMetadata({ title: "New store product", path: "/admin/store/products/new", seo: noIndex });

export default async function NewStoreProductPage() {
  let brands: PickerOption[] = [];
  let categories: AdminStoreCategory[] = [];

  try {
    [brands, categories] = await Promise.all([getBrandOptions(), getStoreCategories()]);
  } catch {
    return (
      <ErrorState title="We could not open the editor">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader back={{ href: "/admin/store/products", label: "Store products" }} title="New store product" />

      <StoreProductForm brands={brands} categories={categories} />
    </>
  );
}
