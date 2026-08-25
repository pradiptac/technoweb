import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import {
  getBrandOptions, getProduct, getProductCategoryOptions, getProductOptions, getSolutionOptions,
} from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { ProductForm } from "../product-form";
import type { AdminProduct, PickerOption } from "@/types/api";

const statusTone = { draft: "closed", published: "resolved", archived: "closed" } as const;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return buildMetadata({ title: "Edit product", path: `/admin/products/${id}`, seo: noIndex });
}

export default async function EditProductPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;

  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let product: AdminProduct;
  let brands: PickerOption[] = [];
  let categories: PickerOption[] = [];
  let solutions: PickerOption[] = [];
  let products: PickerOption[] = [];
  try {
    [product, brands, categories, solutions, products] = await Promise.all([
      getProduct(numericId),
      getBrandOptions(), getProductCategoryOptions(), getSolutionOptions(), getProductOptions(),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <PageHeader
        back={{ href: "/admin/products", label: "All products" }}
        title="Edit product"
      >
        <Badge tone={statusTone[product.status]}>{product.status_label ?? product.status}</Badge>
        <Link href={`/products/${product.slug}`} className="ml-auto py-1 text-[13.5px] font-semibold text-brand-ink hover:underline">
          View on site ↗
        </Link>
      </PageHeader>

      <ProductForm
        product={product}
        brands={brands}
        categories={categories}
        solutions={solutions}
        products={products}
        saved={Boolean(saved)}
      />
    </>
  );
}
