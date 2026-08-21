"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { createBlogPost, deleteBlogPost, updateBlogPost, uploadMedia, type BlogPostPayload } from "@/lib/admin";
import type { PublishStatus } from "@/types/api";

export type PostFormState = { error?: string; fieldErrors?: Record<string, string[]> };

/**
 * Turns the flat form into the API payload. Empty strings become null rather
 * than "" so the API can tell "cleared" from "unchanged" — an empty slug in
 * particular must be null, or Sluggable cannot derive one.
 */
function payloadFrom(formData: FormData): BlogPostPayload {
  const str = (k: string) => {
    const v = formData.get(k);
    const s = typeof v === "string" ? v.trim() : "";
    return s === "" ? null : s;
  };

  const seoKeys = [
    "title", "description", "canonical_url", "robots", "focus_keyword",
    "og_title", "og_description", "schema_type",
  ] as const;

  const seo: Record<string, string | boolean | null> = {};
  for (const key of seoKeys) seo[key] = str(`seo_${key}`);
  seo.sitemap_include = formData.get("seo_sitemap_include") === "1";

  // An untouched SEO panel should not leave an all-null override row behind.
  // Excluding from the sitemap is a deliberate act, so that alone still
  // counts as "the editor said something".
  const seoTouched = seoKeys.some((k) => seo[k] !== null) || seo.sitemap_include === false;

  return {
    title: str("title") ?? "",
    slug: str("slug"),
    excerpt: str("excerpt"),
    body: str("body"),
    status: (str("status") ?? "draft") as PublishStatus,
    published_at: str("published_at"),
    author_id: str("author_id") ? Number(str("author_id")) : null,
    cover_image_path: str("cover_image_path"),
    ...(seoTouched ? { seo: seo as BlogPostPayload["seo"] } : {}),
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

export type UploadState = { error?: string; path?: string; url?: string };

export async function uploadCoverAction(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image first." };

  try {
    const media = await uploadMedia(formData);
    return { path: media.path, url: media.url };
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) {
      return { error: Object.values(error.errors ?? {})[0]?.[0] ?? error.message };
    }
    return { error: "That upload failed. Try again." };
  }
}
