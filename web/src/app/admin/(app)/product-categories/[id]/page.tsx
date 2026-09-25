import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { notFound } from "next/navigation";
import { ApiError } from "@/lib/api";
import { getAnswerBlockKinds, getProductCategory, getProductCategoryOptions } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { CategoryForm } from "../category-form";
import type { AdminProductCategory, AnswerBlockKindOption } from "@/types/api";
import { requireScreen } from "@/lib/admin-screen";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return buildMetadata({ title: "Edit category", path: `/admin/product-categories/${id}`, seo: noIndex });
}

export default async function EditProductCategoryPage({
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

  let category: AdminProductCategory;
  let parents: { id: number; name: string }[] = [];
  let kinds: AnswerBlockKindOption[] = [];
  try {
    [category, parents, kinds] = await Promise.all([
      getProductCategory(numericId),
      getProductCategoryOptions(),
      getAnswerBlockKinds("/admin/product-categories"),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <PageHeader
        back={{ href: "/admin/product-categories", label: "All categories" }}
        title="Edit category"
      >
        <Link href={`/products/${category.slug}`} className="ml-auto py-1 text-13-5 font-semibold text-brand-ink hover:underline">
          View on site ↗
        </Link>
      </PageHeader>

      <CategoryForm category={category} parents={parents} saved={Boolean(saved)} kinds={kinds} />
    </>
  );
}
