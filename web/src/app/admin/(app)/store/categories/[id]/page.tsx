import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { ApiError } from "@/lib/api";
import { getAnswerBlockKinds, getStoreCategory } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { StoreCategoryForm } from "../category-form";
import type { AdminStoreCategory, AnswerBlockKindOption } from "@/types/api";
import { requireScreen } from "@/lib/admin-screen";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return buildMetadata({ title: "Edit store category", path: `/admin/store/categories/${id}`, seo: noIndex });
}

export default async function EditStoreCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  await requireScreen();
  const { id } = await params;

  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let category: AdminStoreCategory;
  let kinds: AnswerBlockKindOption[] = [];

  try {
    [category, kinds] = await Promise.all([getStoreCategory(numericId), getAnswerBlockKinds("/admin/store/categories")]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <PageHeader back={{ href: "/admin/store/categories", label: "Store categories" }} title={category.name} />

      <StoreCategoryForm category={category} kinds={kinds} />
    </>
  );
}
