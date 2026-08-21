"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { createSolution, deleteSolution, updateSolution, type SolutionPayload } from "@/lib/admin";
import { jsonListFromFormData, seoFromFormData, str } from "@/lib/admin-form";
import type { FaqItem, PublishStatus } from "@/types/api";

export type SolutionFormState = { error?: string; fieldErrors?: Record<string, string[]> };

function payloadFrom(formData: FormData): SolutionPayload {
  const seo = seoFromFormData(formData);
  const sortOrder = str(formData, "sort_order");

  // RelationPicker submits one entry per checked box under the same name —
  // the plain-HTML convention, read back with getAll().
  const ids = (key: string) =>
    formData.getAll(key)
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n > 0);

  return {
    title: str(formData, "title") ?? "",
    slug: str(formData, "slug"),
    summary: str(formData, "summary"),
    problem_statement: str(formData, "problem_statement"),
    overview: str(formData, "overview"),
    benefits: jsonListFromFormData<string>(formData, "benefits"),
    technologies: jsonListFromFormData<string>(formData, "technologies"),
    icon: str(formData, "icon"),
    hero_image_path: str(formData, "hero_image_path"),
    status: (str(formData, "status") ?? "draft") as PublishStatus,
    sort_order: sortOrder ? Number(sortOrder) : 0,
    product_ids: ids("product_ids"),
    industry_ids: ids("industry_ids"),
    faqs: jsonListFromFormData<FaqItem>(formData, "faqs"),
    ...(seo ? { seo: seo as SolutionPayload["seo"] } : {}),
  };
}

function toState(error: unknown): SolutionFormState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Your account cannot edit content." };
  }
  return { error: "We could not save the solution. Try again shortly." };
}

export async function createSolutionAction(_prev: SolutionFormState, formData: FormData): Promise<SolutionFormState> {
  let id: number;

  try {
    const solution = await createSolution(payloadFrom(formData));
    id = solution.id;
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/admin/solutions");
  redirect(`/admin/solutions/${id}?saved=1`);
}

export async function updateSolutionAction(_prev: SolutionFormState, formData: FormData): Promise<SolutionFormState> {
  const id = Number(formData.get("id"));
  if (!id) return { error: "Missing solution id." };

  try {
    await updateSolution(id, payloadFrom(formData));
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/admin/solutions");
  revalidatePath(`/admin/solutions/${id}`);
  redirect(`/admin/solutions/${id}?saved=1`);
}

export async function deleteSolutionAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;

  await deleteSolution(id).catch(() => null);
  revalidatePath("/admin/solutions");
  redirect("/admin/solutions?deleted=1");
}
