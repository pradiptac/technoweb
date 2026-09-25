import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import { getAnswerBlockKinds, getBrandOptions, getServiceOptions, getStoreCategories, getStoreProduct } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { StoreProductForm } from "../store-product-form";
import type { AdminStoreCategory, AdminStoreProduct, PickerOption, AnswerBlockKindOption } from "@/types/api";
import { requireScreen } from "@/lib/admin-screen";

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
  await requireScreen();
  const { id } = await params;
  const { saved } = await searchParams;

  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let product: AdminStoreProduct;
  let brands: PickerOption[] = [];
  let categories: AdminStoreCategory[] = [];
  let services: PickerOption[] = [];
  let kinds: AnswerBlockKindOption[] = [];

  try {
    [product, brands, categories, services, kinds] = await Promise.all([
      getStoreProduct(numericId), getBrandOptions(), getStoreCategories(),
      // The services that install or support it (contract §3); a store
      // manager who cannot read /admin/services still gets the form.
      getServiceOptions().catch(() => []),
      getAnswerBlockKinds("/admin/store/products"),
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
        services={services}
        saved={saved === "1"} kinds={kinds}
      />
    </>
  );
}
