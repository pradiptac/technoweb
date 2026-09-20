"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { ApiError } from "@/lib/api";
import {
  createBlogCategory, deleteBlogCategory, updateBlogCategory, type BlogCategoryPayload,
} from "@/lib/admin";
import { str } from "@/lib/admin-form";

export type BlogCategoryFormState = { error?: string; fieldErrors?: Record<string, string[]> };

/** No SEO block and no status — see `BlogCategoryController`. */
function payloadFrom(formData: FormData): BlogCategoryPayload {
  const sortOrder = str(formData, "sort_order");

  return {
    name: str(formData, "name") ?? "",
    slug: str(formData, "slug"),
    description: str(formData, "description"),
    sort_order: sortOrder ? Number(sortOrder) : 0,
  };
}

function toState(error: unknown): BlogCategoryFormState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Your account cannot edit content." };
  }
  return { error: "We could not save the category. Try again shortly." };
}

/**
 * The public blog reads these, so an edit has to reach it.
 *
 * `updateTag` and not `revalidateTag`: it gives read-your-own-writes, so an
 * editor who renames a category sees it on the site immediately rather than
 * waiting out the fifteen-minute window the taxonomy endpoint caches for. That
 * window is deliberate — the sidebar is the part of the blog that changes
 * least — and it is exactly what makes an un-revalidated save look broken.
 */
function refreshPublicBlog(): void {
  updateTag("blog");
  updateTag("blog-taxonomy");
}

export async function createBlogCategoryAction(
  _p: BlogCategoryFormState,
  formData: FormData,
): Promise<BlogCategoryFormState> {
  let id: number;

  try {
    id = (await createBlogCategory(payloadFrom(formData))).id;
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/admin/blog-categories");
  refreshPublicBlog();
  // Outside the try: `redirect()` works by throwing, and a catch that tries to
  // recognise it swallows it instead — the campaign screen learned that once.
  redirect(`/admin/blog-categories/${id}?saved=1`);
}

export async function updateBlogCategoryAction(
  id: number,
  _p: BlogCategoryFormState,
  formData: FormData,
): Promise<BlogCategoryFormState> {
  try {
    await updateBlogCategory(id, payloadFrom(formData));
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/admin/blog-categories");
  revalidatePath(`/admin/blog-categories/${id}`);
  refreshPublicBlog();
  redirect(`/admin/blog-categories/${id}?saved=1`);
}

/**
 * Returns nothing, because it is a `formAction` on a button rather than an
 * action behind `useActionState`.
 *
 * React types a `formAction` as returning `void`, so a state object here is a
 * type error — and there is nowhere to render one anyway: the form is gone by
 * the time it would arrive. A failure lands on the list with `?done=` instead,
 * which is the convention every other delete in this console follows.
 */
export async function deleteBlogCategoryAction(id: number): Promise<void> {
  try {
    await deleteBlogCategory(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/admin/login");

    redirect("/admin/blog-categories?done=category-delete-failed");
  }

  revalidatePath("/admin/blog-categories");
  refreshPublicBlog();
  redirect("/admin/blog-categories?done=category-deleted");
}
