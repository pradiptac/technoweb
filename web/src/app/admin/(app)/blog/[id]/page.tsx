import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import { getAnswerBlockKinds, getBlogCategoryList, getBlogPost, getStaff } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { PostForm } from "../post-form";
import type { AdminBlogPost, StaffUser, AnswerBlockKindOption } from "@/types/api";
import { requireScreen } from "@/lib/admin-screen";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return buildMetadata({ title: "Edit post", path: `/admin/blog/${id}`, seo: noIndex });
}

const statusTone = { published: "resolved", draft: "progress", archived: "closed" } as const;

export default async function EditBlogPostPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireScreen();
  const { id } = await params;
  const { saved } = await searchParams;

  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let post: AdminBlogPost;
  let staff: StaffUser[] = [];
  let kinds: AnswerBlockKindOption[] = [];
  let categories: { id: number; name: string }[] = [];
  try {
    let list;
    [post, staff, kinds, list] = await Promise.all([
      getBlogPost(numericId), getStaff(), getAnswerBlockKinds("/admin/blog-posts"), getBlogCategoryList({ per_page: 100 }),
    ]);
    categories = list.data.map((c) => ({ id: c.id, name: c.name }));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <PageHeader
        back={{ href: "/admin/blog", label: "All posts" }}
        title="Edit post"
      >
        <Badge tone={statusTone[post.status]}>{post.status_label}</Badge>
        {post.status === "published" && (
          <Link
            href={`/blog/${post.slug}`}
            className="ml-auto py-1 text-13-5 font-semibold text-brand-ink hover:underline"
          >
            View on site ↗
          </Link>
        )}
      </PageHeader>

      <PostForm post={post} staff={staff} categories={categories} saved={Boolean(saved)} kinds={kinds} />
    </>
  );
}
