import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getAnswerBlockKinds, getBrandOptions, getServiceOptions, getStoreCategories, getCustomFieldGroups } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { StoreProductForm } from "../store-product-form";
import type { AdminStoreCategory, PickerOption, AnswerBlockKindOption } from "@/types/api";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "New store product", path: "/admin/store/products/new", seo: noIndex });

export default async function NewStoreProductPage() {
  await requireScreen();
  let brands: PickerOption[] = [];
  let categories: AdminStoreCategory[] = [];
  let services: PickerOption[] = [];
  let kinds: AnswerBlockKindOption[] = [];

  try {
    [brands, categories, services, kinds] = await Promise.all([
      getBrandOptions(), getStoreCategories(), getServiceOptions().catch(() => []), getAnswerBlockKinds("/admin/store/products"),
    ]);
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

      <StoreProductForm brands={brands} categories={categories} services={services} kinds={kinds} fieldGroups={await getCustomFieldGroups("/admin/store/products")} />
    </>
  );
}
