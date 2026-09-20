import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import { getBrandOptions, getStoreCategories, getStoreProduct } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { StoreProductForm } from "../store-product-form";
import type { AdminStoreCategory, AdminStoreProduct, PickerOption } from "@/types/api";

const statusTone = { draft: "closed", published: "resolved", archived: "closed" } as const;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return buildMetadata({ title: "Edit store product", path: `/admin/store/products/${id}`, seo: noIndex });
}

export default async function EditStoreProductPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;

  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let product: AdminStoreProduct;
  let brands: PickerOption[] = [];
  let categories: AdminStoreCategory[] = [];

  try {
    [product, brands, categories] = await Promise.all([
      getStoreProduct(numericId), getBrandOptions(), getStoreCategories(),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <PageHeader back={{ href: "/admin/store/products", label: "Store products" }} title={product.name}>
        <div className="ml-auto flex items-center gap-2">
          {!product.in_stock && <Badge tone="urgent">Out of stock</Badge>}
          <Badge tone={statusTone[product.status]}>{product.status_label ?? product.status}</Badge>
        </div>
      </PageHeader>

      <StoreProductForm
        product={product}
        brands={brands}
        categories={categories}
        saved={saved === "1"}
      />
    </>
  );
}
