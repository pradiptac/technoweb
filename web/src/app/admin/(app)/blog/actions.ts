"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { ApiError } from "@/lib/api";
import { createBlogPost, deleteBlogPost, updateBlogPost, type BlogPostPayload } from "@/lib/admin";
import { customFieldsFromFormData, jsonListFromFormData, sectionsFromFormData, seoFromFormData, str } from "@/lib/admin-form";
import type { AnswerBlock, FaqItem, PublishStatus } from "@/types/api";

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
    // Custom fields: absent when no Fields tab was drawn, so the API leaves them alone.
    ...customFieldsFromFormData(formData),
    // The Sections tab: which of the two the page shows, and the builder's list.
    ...sectionsFromFormData(formData),
    title: str(formData, "title") ?? "",
    slug: str(formData, "slug"),
    excerpt: str(formData, "excerpt"),
    body: str(formData, "body"),
    status: (str(formData, "status") ?? "draft") as PublishStatus,
    published_at: str(formData, "published_at"),
    author_id: authorId ? Number(authorId) : null,
    cover_image_path: str(formData, "cover_image_path"),
    is_featured: formData.get("is_featured") === "1",
    comments_enabled: formData.get("comments_enabled") !== "0",
    // The picker shows the whole set, so nothing ticked means "none" and is sent as [].
    category_ids: formData.getAll("category_ids").map(Number).filter((n) => Number.isInteger(n) && n > 0),
    faqs: jsonListFromFormData<FaqItem>(formData, "faqs"),
    answer_blocks: jsonListFromFormData<AnswerBlock>(formData, "answer_blocks"),
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

/*
 * `updateTag` first, then the admin path. The public site reads every one of
 * these records through ISR-cached fetches tagged by collection, and the
 * detail routes are cached whole since they gained `generateStaticParams`
 * — so without the tag a save reached the public page only when the fetch's
 * revalidate window (five to ten minutes) ran out. `updateTag` rather than
 * `revalidateTag` gives read-your-own-writes: the editor who saved sees the
 * change on the next request, not the next window.
 */
export async function createPostAction(_prev: PostFormState, formData: FormData): Promise<PostFormState> {
  let id: number;

  try {
    const post = await createBlogPost(payloadFrom(formData));
    id = post.id;
  } catch (error) {
    return toState(error);
  }

  updateTag("blog");
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

  updateTag("blog");
  revalidatePath("/admin/blog");
  revalidatePath(`/admin/blog/${id}`);
  redirect(`/admin/blog/${id}?saved=1`);
}

export async function deletePostAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;

  // Only a delete the API accepted may purge anything: a refusal (in use,
  // a role, a network error) used to purge the caches and report success.
  const deleted = await deleteBlogPost(id).then(() => true, () => false);
  if (!deleted) redirect("/admin/blog?done=not-deleted");
  updateTag("blog");
  revalidatePath("/admin/blog");
  redirect("/admin/blog?deleted=1");
}
