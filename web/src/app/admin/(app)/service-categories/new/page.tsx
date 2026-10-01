import { PageHeader } from "@/components/admin/page-header";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { ServiceCategoryForm } from "../category-form";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({
  title: "New service category", path: "/admin/service-categories/new", seo: noIndex,
});

export default async function NewServiceCategoryPage() {
  await requireScreen();

  return (
    <>
      <PageHeader
        back={{ href: "/admin/service-categories", label: "All service categories" }}
        title="New service category"
      />

      <ServiceCategoryForm />
    </>
  );
}
