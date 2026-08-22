import Link from "next/link";
import { ErrorState } from "@/components/ui/empty";
import {
  getBrandOptions, getProductCategoryOptions, getProductOptions, getSolutionOptions,
} from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { ProductForm } from "../product-form";
import type { PickerOption } from "@/types/api";

export const metadata = buildMetadata({ title: "New product", path: "/admin/products/new", seo: noIndex });

export default async function NewProductPage() {
  let brands: PickerOption[] = [];
  let categories: PickerOption[] = [];
  let solutions: PickerOption[] = [];
  let products: PickerOption[] = [];
  try {
    [brands, categories, solutions, products] = await Promise.all([
      getBrandOptions(), getProductCategoryOptions(), getSolutionOptions(), getProductOptions(),
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
      <Link href="/admin/products" className="inline-block py-1 text-[13.5px] font-semibold text-brand-600 hover:underline">
        ← All products
      </Link>
      <h1 className="admin-title mt-4 mb-6">New product</h1>

      <ProductForm brands={brands} categories={categories} solutions={solutions} products={products} />
    </>
  );
}
