"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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
  revalidatePath("/admin/pages");
  if (slug) revalidatePath(`/${slug}`);
  redirect("/admin/pages?deleted=1");
}
