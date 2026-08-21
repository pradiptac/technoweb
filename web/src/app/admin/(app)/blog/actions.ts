"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { createBlogPost, deleteBlogPost, updateBlogPost, type BlogPostPayload } from "@/lib/admin";
import { seoFromFormData, str } from "@/lib/admin-form";
import type { PublishStatus } from "@/types/api";

export type PostFormState = { error?: string; fieldErrors?: Record<string, string[]> };

/**
 * Turns the flat form into the API payload. Empty strings become null rather
 * than "" so the API can tell "cleared" from "unchanged" — an empty slug in
 * particular must be null, or Sluggable cannot derive one.
 */
function payloadFrom(formData: FormData): BlogPostPayload {
  const seo = seoFromFormData(formData);
  const authorId = str(formData, "author_id");

  return {
    title: str(formData, "title") ?? "",
    slug: str(formData, "slug"),
    excerpt: str(formData, "excerpt"),
    body: str(formData, "body"),
    status: (str(formData, "status") ?? "draft") as PublishStatus,
    published_at: str(formData, "published_at"),
    author_id: authorId ? Number(authorId) : null,
    cover_image_path: str(formData, "cover_image_path"),
    ...(seo ? { seo: seo as BlogPostPayload["seo"] } : {}),
  };
}

function toState(error: unknown): PostFormState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Your account cannot edit content." };
  }
  return { error: "We could not save the post. Try again shortly." };
}

export async function createPostAction(_prev: PostFormState, formData: FormData): Promise<PostFormState> {
  let id: number;

  try {
    const post = await createBlogPost(payloadFrom(formData));
    id = post.id;
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/admin/blog");
  redirect(`/admin/blog/${id}?saved=1`);
}

export async function updatePostAction(_prev: PostFormState, formData: FormData): Promise<PostFormState> {
  const id = Number(formData.get("id"));
  if (!id) return { error: "Missing post id." };

  try {
    await updateBlogPost(id, payloadFrom(formData));
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/admin/blog");
  revalidatePath(`/admin/blog/${id}`);
  redirect(`/admin/blog/${id}?saved=1`);
}

export async function deletePostAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;

  await deleteBlogPost(id).catch(() => null);
  revalidatePath("/admin/blog");
  redirect("/admin/blog?deleted=1");
}
