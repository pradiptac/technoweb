import { PageHeader } from "@/components/admin/page-header";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import { TenderCategoryForm } from "../category-form";

export const metadata = buildMetadata({ title: "New tender category", path: "/admin/tenders/categories/new", seo: noIndex });

export default async function NewTenderCategoryPage() {
  await requireScreen();

  return (
    <>
      <PageHeader back={{ href: "/admin/tenders/categories", label: "All categories" }} title="New tender category" />
      <TenderCategoryForm />
    </>
  );
}
