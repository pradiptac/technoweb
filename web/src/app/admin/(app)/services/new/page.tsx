import { PageHeader } from "@/components/admin/page-header";
import { getAnswerBlockKinds, getCustomFieldGroups, getServiceCategoryOptions, getPageBuilderOptions } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { ServiceForm } from "../service-form";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "New service", path: "/admin/services/new", seo: noIndex });

export default async function NewServicePage() {
  await requireScreen();
  const [kinds, categories] = await Promise.all([
    getAnswerBlockKinds("/admin/services"),
    // An API without the categories yet still opens the editor, with "No category" alone.
    getServiceCategoryOptions().catch(() => []),
  ]);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/services", label: "All services" }}
        title="New service"
      />

      <ServiceForm kinds={kinds} categories={categories} fieldGroups={await getCustomFieldGroups("/admin/services")} builder={await getPageBuilderOptions()} />
    </>
  );
}
