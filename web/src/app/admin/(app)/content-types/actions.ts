"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { ApiError } from "@/lib/api";
import { createContentType, deleteContentType, updateContentType, type ContentTypePayload } from "@/lib/admin";
import { str } from "@/lib/admin-form";

export type TypeFormState = { error?: string; fieldErrors?: Record<string, string[]> };

function payload(formData: FormData): ContentTypePayload {
  const perPage = str(formData, "per_page");
  const sortOrder = str(formData, "sort_order");

  return {
    name: str(formData, "name") ?? "",
    plural: str(formData, "plural") ?? "",
    slug: (str(formData, "slug") ?? "").toLowerCase(),
    icon: str(formData, "icon"),
    description: str(formData, "description"),
    // An unticked box posts nothing, so absence is the answer.
    has_body: formData.get("has_body") === "1",
    has_image: formData.get("has_image") === "1",
    archive_enabled: formData.get("archive_enabled") === "1",
    is_active: formData.get("is_active") === "1",
    per_page: perPage ? Number(perPage) : 12,
    sort: str(formData, "sort") ?? "newest",
    schema_type: str(formData, "schema_type") ?? "Article",
    sort_order: sortOrder ? Number(sortOrder) : 0,
  };
}

function fail(error: unknown): TypeFormState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Your account cannot edit content types." };
  }
  return { error: "We could not save the content type. Try again shortly." };
}

/**
 * Every page under a type is tagged `entries:<slug>` and the list of types
 * `content-types`; a rename invalidates the old slug's pages as well as the
 * new, and the menu, which may link to the archive.
 */
function tagType(slugs: (string | null | undefined)[]) {
  updateTag("content-types");
  updateTag("menu");
  for (const slug of new Set(slugs.filter(Boolean))) updateTag(`entries:${slug}`);
}

export async function createTypeAction(_prev: TypeFormState, formData: FormData): Promise<TypeFormState> {
  let id: number;
  let slug: string;
  try {
    const type = await createContentType(payload(formData));
    id = type.id;
    slug = type.slug;
  } catch (error) {
    return fail(error);
  }

  tagType([slug]);
  revalidatePath("/admin/content-types");
  revalidatePath("/admin/content");
  redirect(`/admin/content-types/${id}?saved=1`);
}

export async function updateTypeAction(_prev: TypeFormState, formData: FormData): Promise<TypeFormState> {
  const id = Number(formData.get("id"));
  if (!id) return { error: "Missing content type id." };

  let slug: string;
  try {
    slug = (await updateContentType(id, payload(formData))).slug;
  } catch (error) {
    return fail(error);
  }

  tagType([slug, str(formData, "previous_slug")]);
  revalidatePath("/admin/content-types");
  revalidatePath("/admin/content");
  redirect(`/admin/content-types/${id}?saved=1`);
}

export async function deleteTypeAction(_prev: TypeFormState, formData: FormData): Promise<TypeFormState> {
  const id = Number(formData.get("id"));
  if (!id) return { error: "Missing content type id." };

  try {
    await deleteContentType(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) return { error: error.message };
    return fail(error);
  }

  tagType([str(formData, "previous_slug")]);
  revalidatePath("/admin/content-types");
  revalidatePath("/admin/content");
  redirect("/admin/content-types?done=content-type-deleted");
}
