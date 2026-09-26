import { PageHeader } from "@/components/admin/page-header";
import { BlogCategoryForm } from "../category-form";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({
  title: "New blog category",
  path: "/admin/blog-categories/new",
  seo: noIndex,
});

export default async function NewBlogCategoryPage() {
  await requireScreen();
  return (
    <>
      <PageHeader
        title="New category"
        back={{ href: "/admin/blog-categories", label: "Blog categories" }}
      />
      <BlogCategoryForm />
    </>
  );
}
