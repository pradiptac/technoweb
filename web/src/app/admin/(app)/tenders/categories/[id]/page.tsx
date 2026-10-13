import { notFound } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getTenderCategory } from "@/lib/admin";
import { ApiError } from "@/lib/api";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import { TenderCategoryForm } from "../category-form";

export const metadata = buildMetadata({ title: "Edit tender category", path: "/admin/tenders/categories", seo: noIndex });

export default async function EditTenderCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  await requireScreen();
  const { id } = await params;

  if (!/^\d+$/.test(id)) notFound();

  let category;
  try {
    category = await getTenderCategory(Number(id));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();

    return (
      <ErrorState title="We could not load the category">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader back={{ href: "/admin/tenders/categories", label: "All categories" }} title={`Edit ${category.name}`} />
      <TenderCategoryForm key={category.updated_at ?? String(category.id)} category={category} />
    </>
  );
}
