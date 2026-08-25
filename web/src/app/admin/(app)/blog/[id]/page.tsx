import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import { getBlogPost, getStaff } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { PostForm } from "../post-form";
import type { AdminBlogPost, StaffUser } from "@/types/api";

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
  const { id } = await params;
  const { saved } = await searchParams;

  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let post: AdminBlogPost;
  let staff: StaffUser[] = [];
  try {
    [post, staff] = await Promise.all([getBlogPost(numericId), getStaff()]);
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
            className="ml-auto py-1 text-[13.5px] font-semibold text-brand-ink hover:underline"
          >
            View on site ↗
          </Link>
        )}
      </PageHeader>

      <PostForm post={post} staff={staff} saved={Boolean(saved)} />
    </>
  );
}
