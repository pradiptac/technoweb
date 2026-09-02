import { PageHeader } from "@/components/admin/page-header";
import { BlogCategoryForm } from "../category-form";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";

export const metadata = buildMetadata({
  title: "New blog category",
  path: "/admin/blog-categories/new",
  seo: noIndex,
});

export default function NewBlogCategoryPage() {
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
