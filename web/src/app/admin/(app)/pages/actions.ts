"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { ApiError } from "@/lib/api";
import { createPage, deletePage, updatePage, type CmsPagePayload } from "@/lib/admin";
import { seoFromFormData, str } from "@/lib/admin-form";
import type { PublishStatus } from "@/types/api";

export type PageFormState = { error?: string; fieldErrors?: Record<string, string[]> };

function payloadFrom(formData: FormData): CmsPagePayload {
  const seo = seoFromFormData(formData);

  return {
    title: str(formData, "title") ?? "",
    slug: str(formData, "slug"),
    body: str(formData, "body"),
    template: str(formData, "template") ?? "default",
    status: (str(formData, "status") ?? "draft") as PublishStatus,
    published_at: str(formData, "published_at"),
    ...(seo ? { seo: seo as CmsPagePayload["seo"] } : {}),
  };
}

function toState(error: unknown): PageFormState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Your account cannot edit content." };
  }
  return { error: "We could not save the page. Try again shortly." };
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
export async function createPageAction(_prev: PageFormState, formData: FormData): Promise<PageFormState> {
  let id: number;
  let slug: string;

  try {
    const page = await createPage(payloadFrom(formData));
    id = page.id;
    slug = page.slug;
  } catch (error) {
    return toState(error);
  }

  updateTag("pages");
  revalidatePath("/admin/pages");
  // The public route is a catch-all, so revalidate the path it now serves.
  revalidatePath(`/${slug}`);
  redirect(`/admin/pages/${id}?saved=1`);
}

export async function updatePageAction(_prev: PageFormState, formData: FormData): Promise<PageFormState> {
  const id = Number(formData.get("id"));
  if (!id) return { error: "Missing page id." };

  let slug: string;
  try {
    const page = await updatePage(id, payloadFrom(formData));
    slug = page.slug;
  } catch (error) {
    return toState(error);
  }

  updateTag("pages");
  revalidatePath("/admin/pages");
  revalidatePath(`/admin/pages/${id}`);
  revalidatePath(`/${slug}`);
  redirect(`/admin/pages/${id}?saved=1`);
}

export async function deletePageAction(formData: FormData) {
  const id = Number(formData.get("id"));
  const slug = String(formData.get("slug") ?? "");
  if (!id) return;

  await deletePage(id).catch(() => null);
  updateTag("pages");
  revalidatePath("/admin/pages");
  if (slug) revalidatePath(`/${slug}`);
  redirect("/admin/pages?deleted=1");
}
