import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { notFound } from "next/navigation";
import { ApiError } from "@/lib/api";
import { getServiceCategory } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { ServiceCategoryForm } from "../category-form";
import type { AdminServiceCategory } from "@/types/api";
import { requireScreen } from "@/lib/admin-screen";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return buildMetadata({ title: "Edit service category", path: `/admin/service-categories/${id}`, seo: noIndex });
}

export default async function EditServiceCategoryPage({
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

  let category: AdminServiceCategory;
  try {
    category = await getServiceCategory(numericId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <PageHeader
        back={{ href: "/admin/service-categories", label: "All service categories" }}
        title="Edit service category"
      >
        {category.is_active && (
          <Link href={`/services#${category.slug}`} className="ml-auto py-1 text-13-5 font-semibold text-brand-ink hover:underline">
            View on site ↗
          </Link>
        )}
      </PageHeader>

      <ServiceCategoryForm category={category} saved={Boolean(saved)} />
    </>
  );
}
