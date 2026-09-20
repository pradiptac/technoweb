import { PageHeader } from "@/components/admin/page-header";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { StoreCategoryForm } from "../category-form";

export const metadata = buildMetadata({ title: "New store category", path: "/admin/store/categories/new", seo: noIndex });

export default function NewStoreCategoryPage() {
  return (
    <>
      <PageHeader back={{ href: "/admin/store/categories", label: "Store categories" }} title="New store category" />

      <StoreCategoryForm />
    </>
  );
}
