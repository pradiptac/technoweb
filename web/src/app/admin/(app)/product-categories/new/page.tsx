import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getAnswerBlockKinds, getProductCategoryOptions } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import type { AnswerBlockKindOption } from "@/types/api";
import { noIndex } from "@/lib/no-index";
import { CategoryForm } from "../category-form";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({
  title: "New category", path: "/admin/product-categories/new", seo: noIndex,
});

export default async function NewProductCategoryPage() {
  await requireScreen();
  let parents: { id: number; name: string }[] = [];
  let kinds: AnswerBlockKindOption[] = [];
  try {
    [parents, kinds] = await Promise.all([getProductCategoryOptions(), getAnswerBlockKinds("/admin/product-categories")]);
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

      <CategoryForm parents={parents} kinds={kinds} />
    </>
  );
}
