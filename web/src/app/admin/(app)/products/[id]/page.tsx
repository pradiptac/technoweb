import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { PreviewLinkPanel } from "@/components/admin/preview-link-panel";
import { RevisionPanel } from "@/components/admin/revision-panel";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import {
  getBrandOptions, getProduct, getProductCategoryOptions, getProductOptions, getSolutionOptions, getAnswerBlockKinds,
  getPageBuilderOptions,
} from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { ProductForm } from "../product-form";
import type { AdminProduct, PickerOption, AnswerBlockKindOption } from "@/types/api";
import { requireScreen } from "@/lib/admin-screen";

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
  await requireScreen();
  const { id } = await params;
  const { saved } = await searchParams;

  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let product: AdminProduct;
  let brands: PickerOption[] = [];
  let categories: PickerOption[] = [];
  let solutions: PickerOption[] = [];
  let products: PickerOption[] = [];
  let kinds: AnswerBlockKindOption[] = [];
  try {
    [product, brands, categories, solutions, products, kinds] = await Promise.all([
      getProduct(numericId),
      getBrandOptions(), getProductCategoryOptions(), getSolutionOptions(), getProductOptions(),
      getAnswerBlockKinds("/admin/products"),
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
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <RevisionPanel type="product" id={product.id} />
          <PreviewLinkPanel type="product" id={product.id} />
        </span>
        <Link href={`/products/${product.slug}`} className="py-1 text-13-5 font-semibold text-brand-ink hover:underline">
          View on site ↗
        </Link>
      </PageHeader>

      <ProductForm kinds={kinds} builder={await getPageBuilderOptions()}
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
