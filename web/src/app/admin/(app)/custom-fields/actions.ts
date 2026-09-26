"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { ApiError } from "@/lib/api";
import {
  createCustomFieldGroup, deleteCustomFieldGroup, updateCustomFieldGroup, type CustomFieldGroupPayload,
} from "@/lib/admin";
import { str } from "@/lib/admin-form";

export type GroupFormState = { error?: string; fieldErrors?: Record<string, string[]> };

/**
 * The public collection tag each target's pages are cached under, so a
 * group edit — a label renamed, a field switched off the page — reaches the
 * detail pages at once rather than when their fetches' windows run out.
 */
const TAGS: Record<string, string> = {
  page: "pages",
  blog_post: "blog",
  knowledge_article: "kb",
  case_study: "case-studies",
  solution: "solutions",
  service: "services",
  industry: "industries",
  product: "products",
  store_product: "store-products",
};

function tagTargets(targets: string[]) {
  for (const target of targets) {
    if (target.startsWith("entry:")) updateTag(`entries:${target.slice("entry:".length)}`);
    else if (TAGS[target]) updateTag(TAGS[target]);
  }
}

function payload(formData: FormData): CustomFieldGroupPayload {
  let fields: CustomFieldGroupPayload["fields"];
  const raw = str(formData, "fields");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) fields = parsed;
    } catch {
      // A malformed hidden field should not cost the rest of the form; the
      // API validates the contents regardless.
    }
  }

  const sortOrder = str(formData, "sort_order");

  return {
    name: str(formData, "name") ?? "",
    slug: str(formData, "slug"),
    targets: formData.getAll("targets").filter((v): v is string => typeof v === "string" && v !== ""),
    placement: str(formData, "placement") === "hidden" ? "hidden" : "details",
    sort_order: sortOrder ? Number(sortOrder) : 0,
    // An unticked box posts nothing, so absence is the answer.
    is_active: formData.get("is_active") === "1",
    ...(fields ? { fields } : {}),
  };
}

function fail(error: unknown): GroupFormState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Your account cannot edit custom fields." };
  }
  return { error: "We could not save the group. Try again shortly." };
}

export async function createGroupAction(_prev: GroupFormState, formData: FormData): Promise<GroupFormState> {
  let id: number;
  const data = payload(formData);

  try {
    id = (await createCustomFieldGroup(data)).id;
  } catch (error) {
    return fail(error);
  }

  tagTargets(data.targets ?? []);
  revalidatePath("/admin/custom-fields");
  redirect(`/admin/custom-fields/${id}?saved=1`);
}

export async function updateGroupAction(_prev: GroupFormState, formData: FormData): Promise<GroupFormState> {
  const id = Number(formData.get("id"));
  if (!id) return { error: "Missing group id." };
  const data = payload(formData);
  // What it was attached to before this save, so a target it has just left
  // loses the fields from its pages too.
  const before = formData.getAll("previous_targets").filter((v): v is string => typeof v === "string");

  try {
    await updateCustomFieldGroup(id, data);
  } catch (error) {
    return fail(error);
  }

  tagTargets([...new Set([...(data.targets ?? []), ...before])]);
  revalidatePath("/admin/custom-fields");
  revalidatePath(`/admin/custom-fields/${id}`);
  redirect(`/admin/custom-fields/${id}?saved=1`);
}

export async function deleteGroupAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;
  const targets = formData.getAll("previous_targets").filter((v): v is string => typeof v === "string");

  await deleteCustomFieldGroup(id).catch(() => null);
  tagTargets(targets);
  revalidatePath("/admin/custom-fields");
  redirect("/admin/custom-fields?done=custom-field-group-deleted");
}
