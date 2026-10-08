import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { ApiError } from "@/lib/api";
import { getAnswerBlockKinds, getBrandOptions, getServiceOptions, getStoreCategories, getCustomFieldGroups, getPageBuilderOptionsIfAllowed } from "@/lib/admin";
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
      // The brand list is a content manager's route. A store manager without
      // that role still gets the form (0.130.0): an empty list here, and the
      // form offers the product's own brand so a save cannot clear it. Until
      // then this screen was an error for exactly the role it belongs to.
      getBrandOptions().catch((error) => { if (error instanceof ApiError && error.status === 403) return []; throw error; }),
      getStoreCategories(), getServiceOptions().catch(() => []), getAnswerBlockKinds("/admin/store/products"),
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

      <StoreProductForm brands={brands} categories={categories} services={services} kinds={kinds} fieldGroups={await getCustomFieldGroups("/admin/store/products")} builder={await getPageBuilderOptionsIfAllowed()} />
    </>
  );
}
