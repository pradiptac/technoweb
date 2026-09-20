import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { BlogCategoryForm } from "../category-form";
import { getBlogCategory } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";

export const metadata = buildMetadata({
  title: "Edit blog category",
  path: "/admin/blog-categories",
  seo: noIndex,
});

export default async function EditBlogCategoryPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;

  const category = await getBlogCategory(Number(id)).catch(() => null);

  if (!category) notFound();

  return (
    <>
      <PageHeader
        title={category.name}
        back={{ href: "/admin/blog-categories", label: "Blog categories" }}
      />
      <BlogCategoryForm category={category} saved={saved === "1"} />
    </>
  );
}
