"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { ApiError } from "@/lib/api";
import { createEntry, deleteEntry, updateEntry, type EntryPayload } from "@/lib/admin";
import { customFieldsFromFormData, jsonListFromFormData, sectionsFromFormData, seoFromFormData, str } from "@/lib/admin-form";
import type { AnswerBlock, FaqItem, PublishStatus } from "@/types/api";

export type EntryFormState = { error?: string; fieldErrors?: Record<string, string[]> };

function payloadFrom(formData: FormData): EntryPayload {
  const seo = seoFromFormData(formData);
  const sortOrder = str(formData, "sort_order");

  return {
    // Custom fields: absent when no Fields tab was drawn, so the API leaves them alone.
    ...customFieldsFromFormData(formData),
    // The Sections tab: which of the two the page shows, and the builder's list.
    ...sectionsFromFormData(formData),
    title: str(formData, "title") ?? "",
    slug: str(formData, "slug"),
    summary: str(formData, "summary"),
    // Absent when the type has no body or picture: the key is not sent, so
    // nothing already stored is cleared by a type switched off it later.
    ...(formData.has("body") ? { body: str(formData, "body") } : {}),
    ...(formData.has("image_path") ? { image_path: str(formData, "image_path") } : {}),
    status: (str(formData, "status") ?? "draft") as PublishStatus,
    published_at: str(formData, "published_at"),
    sort_order: sortOrder ? Number(sortOrder) : 0,
    faqs: jsonListFromFormData<FaqItem>(formData, "faqs"),
    answer_blocks: jsonListFromFormData<AnswerBlock>(formData, "answer_blocks"),
    ...(seo ? { seo: seo as EntryPayload["seo"] } : {}),
  };
}

function toState(error: unknown): EntryFormState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Your account cannot edit content." };
    if (error.status === 404) return { error: "That content type no longer exists." };
  }
  return { error: "We could not save the entry. Try again shortly." };
}

/**
 * The entry's own tag, the whole type's (its archive lists it) and the old
 * slug's on a rename; `content-types` because the archive's `lastmod`
 * moves; `menu` because a menu may link to the entry.
 */
function tag(type: string, slugs: (string | null | undefined)[]) {
  updateTag(`entries:${type}`);
  updateTag("content-types");
  updateTag("menu");
  for (const slug of new Set(slugs.filter(Boolean))) updateTag(`entry:${type}:${slug}`);
}

export async function createEntryAction(_prev: EntryFormState, formData: FormData): Promise<EntryFormState> {
  const type = str(formData, "type");
  if (!type) return { error: "Missing content type." };

  let id: number;
  let slug: string;
  try {
    const entry = await createEntry(type, payloadFrom(formData));
    id = entry.id;
    slug = entry.slug;
  } catch (error) {
    return toState(error);
  }

  tag(type, [slug]);
  revalidatePath(`/admin/content/${type}`);
  redirect(`/admin/content/${type}/${id}?saved=1`);
}

export async function updateEntryAction(_prev: EntryFormState, formData: FormData): Promise<EntryFormState> {
  const type = str(formData, "type");
  const id = Number(formData.get("id"));
  if (!type || !id) return { error: "Missing entry." };

  let slug: string;
  try {
    slug = (await updateEntry(type, id, payloadFrom(formData))).slug;
  } catch (error) {
    return toState(error);
  }

  tag(type, [slug, str(formData, "previous_slug")]);
  revalidatePath(`/admin/content/${type}`);
  revalidatePath(`/admin/content/${type}/${id}`);
  redirect(`/admin/content/${type}/${id}?saved=1`);
}

export async function deleteEntryAction(formData: FormData) {
  const type = str(formData, "type");
  const id = Number(formData.get("id"));
  if (!type || !id) return;

  await deleteEntry(type, id).catch(() => null);
  tag(type, [str(formData, "previous_slug")]);
  revalidatePath(`/admin/content/${type}`);
  redirect(`/admin/content/${type}?done=entry-deleted`);
}
