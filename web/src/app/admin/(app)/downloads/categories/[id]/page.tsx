import { notFound } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { getDownloadCategory } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import type { AdminDownloadCategory } from "@/types/downloads";
import { DownloadCategoryForm } from "../category-form";
import { deleteDownloadCategoryAction } from "../../actions";

export const metadata = buildMetadata({ title: "Edit download category", path: "/admin/downloads/categories", seo: noIndex });

export default async function EditDownloadCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  await requireScreen();
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

  let category: AdminDownloadCategory;
  try {
    category = await getDownloadCategory(numericId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const n = category.downloads_count;

  return (
    <>
      <PageHeader back={{ href: "/admin/downloads/categories", label: "All categories" }} title={category.name}>
        <Badge tone={category.is_active ? "resolved" : "progress"}>{category.is_active ? "Shown" : "Switched off"}</Badge>
      </PageHeader>

      <DownloadCategoryForm category={category} />

      {/* Outside the form: a form inside a form is invalid markup. */}
      <form action={deleteDownloadCategoryAction} className="mt-10 border-t border-line pt-6">
        <input type="hidden" name="id" value={category.id} />
        <p className="mb-2 text-13 text-muted">
          {n > 0
            ? `Deleting this keeps its ${n} download${n === 1 ? "" : "s"} — they are simply listed without a category.`
            : "Nothing is filed under this category."}
        </p>
        <Button type="submit" variant="ghost" size="sm" className="py-1 text-err">Delete category</Button>
      </form>
    </>
  );
}
