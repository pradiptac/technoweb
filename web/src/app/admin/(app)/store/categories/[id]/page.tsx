import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { ApiError } from "@/lib/api";
import { getStoreCategory } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { StoreCategoryForm } from "../category-form";
import type { AdminStoreCategory } from "@/types/api";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return buildMetadata({ title: "Edit store category", path: `/admin/store/categories/${id}`, seo: noIndex });
}

export default async function EditStoreCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let category: AdminStoreCategory;

  try {
    category = await getStoreCategory(numericId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <PageHeader back={{ href: "/admin/store/categories", label: "Store categories" }} title={category.name} />

      <StoreCategoryForm category={category} />
    </>
  );
}
