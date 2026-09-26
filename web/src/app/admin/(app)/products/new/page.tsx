import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import {
  getBrandOptions, getProductCategoryOptions, getProductOptions, getSolutionOptions, getAnswerBlockKinds, getCustomFieldGroups,
} from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { ProductForm } from "../product-form";
import type { PickerOption, AnswerBlockKindOption } from "@/types/api";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "New product", path: "/admin/products/new", seo: noIndex });

export default async function NewProductPage() {
  await requireScreen();
  let brands: PickerOption[] = [];
  let categories: PickerOption[] = [];
  let solutions: PickerOption[] = [];
  let products: PickerOption[] = [];
  let kinds: AnswerBlockKindOption[] = [];
  try {
    [brands, categories, solutions, products, kinds] = await Promise.all([
      getBrandOptions(), getProductCategoryOptions(), getSolutionOptions(), getProductOptions(),
      getAnswerBlockKinds("/admin/products"),
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
      <PageHeader
        back={{ href: "/admin/products", label: "All products" }}
        title="New product"
      />

      <ProductForm brands={brands} categories={categories} solutions={solutions} products={products} kinds={kinds} fieldGroups={await getCustomFieldGroups("/admin/products")} />
    </>
  );
}
