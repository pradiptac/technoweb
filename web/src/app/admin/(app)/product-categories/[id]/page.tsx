import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError } from "@/lib/api";
import { getProductCategory, getProductCategoryOptions } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { CategoryForm } from "../category-form";
import type { AdminProductCategory } from "@/types/api";

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
  const { id } = await params;
  const { saved } = await searchParams;

  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let category: AdminProductCategory;
  let parents: { id: number; name: string }[] = [];
  try {
    [category, parents] = await Promise.all([
      getProductCategory(numericId),
      getProductCategoryOptions(),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <Link href="/admin/product-categories" className="inline-block py-1 text-[13.5px] font-semibold text-brand-600 hover:underline">
        ← All categories
      </Link>

      <div className="mt-4 mb-6 flex flex-wrap items-center gap-3">
        <h2 className="display-3">Edit category</h2>
        <Link href={`/products/${category.slug}`} className="ml-auto py-1 text-[13.5px] font-semibold text-brand-600 hover:underline">
          View on site ↗
        </Link>
      </div>

      <CategoryForm category={category} parents={parents} saved={Boolean(saved)} />
    </>
  );
}
