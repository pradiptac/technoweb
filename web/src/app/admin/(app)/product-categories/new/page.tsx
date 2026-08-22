import Link from "next/link";
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
      <Link href="/admin/product-categories" className="inline-block py-1 text-[13.5px] font-semibold text-brand-600 hover:underline">
        ← All categories
      </Link>
      <h1 className="admin-title mt-4 mb-6">New category</h1>

      <CategoryForm parents={parents} />
    </>
  );
}
