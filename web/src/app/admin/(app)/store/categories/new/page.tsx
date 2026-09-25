import { PageHeader } from "@/components/admin/page-header";
import { getAnswerBlockKinds } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { StoreCategoryForm } from "../category-form";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "New store category", path: "/admin/store/categories/new", seo: noIndex });

export default async function NewStoreCategoryPage() {
  await requireScreen();
  const kinds = await getAnswerBlockKinds("/admin/store/categories");

  return (
    <>
      <PageHeader back={{ href: "/admin/store/categories", label: "Store categories" }} title="New store category" />

      <StoreCategoryForm kinds={kinds} />
    </>
  );
}
