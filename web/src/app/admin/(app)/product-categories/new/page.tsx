import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getProductCategoryOptions } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { CategoryForm } from "../category-form";

export const metadata = buildMetadata({
  title: "New category", path: "/admin/product-categories/new", seo: noIndex,
});

export default async function NewProductCategoryPage() {
  let parents: { id: number; name: string }[] = [];
  try {
    parents = await getProductCategoryOptions();
  } catch {
    return (
      <ErrorState title="We could not open the editor">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        back={{ href: "/admin/product-categories", label: "All categories" }}
        title="New category"
      />

      <CategoryForm parents={parents} />
    </>
  );
}
