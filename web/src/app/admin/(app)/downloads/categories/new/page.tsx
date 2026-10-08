import { PageHeader } from "@/components/admin/page-header";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import { DownloadCategoryForm } from "../category-form";

export const metadata = buildMetadata({ title: "New download category", path: "/admin/downloads/categories/new", seo: noIndex });

export default async function NewDownloadCategoryPage() {
  await requireScreen();

  return (
    <>
      <PageHeader back={{ href: "/admin/downloads/categories", label: "All categories" }} title="New download category" />
      <DownloadCategoryForm />
    </>
  );
}
