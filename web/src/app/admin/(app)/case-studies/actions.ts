"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import {
  createCaseStudy, deleteCaseStudy, updateCaseStudy, type CaseStudyPayload,
} from "@/lib/admin";
import { seoFromFormData, str } from "@/lib/admin-form";
import type { CaseStudyResult, PublishStatus } from "@/types/api";

export type CaseStudyFormState = { error?: string; fieldErrors?: Record<string, string[]> };

/**
 * ResultsField submits one JSON string. Anything unparseable is treated as
 * "no results" rather than throwing — a malformed hidden field should not
 * cost the editor the rest of the form.
 */
function resultsFrom(formData: FormData): CaseStudyResult[] {
  const raw = str(formData, "results");
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r): r is CaseStudyResult =>
        Boolean(r) && typeof r.value === "string" && typeof r.label === "string")
      .map((r) => ({ value: r.value.trim(), label: r.label.trim() }))
      .filter((r) => r.value && r.label);
  } catch {
    return [];
  }
}

function payloadFrom(formData: FormData): CaseStudyPayload {
  const seo = seoFromFormData(formData);
  const industryId = str(formData, "industry_id");

  return {
    title: str(formData, "title") ?? "",
    slug: str(formData, "slug"),
    client_name: str(formData, "client_name"),
    summary: str(formData, "summary"),
    body: str(formData, "body"),
    results: resultsFrom(formData),
    status: (str(formData, "status") ?? "draft") as PublishStatus,
    industry_id: industryId ? Number(industryId) : null,
    cover_image_path: str(formData, "cover_image_path"),
    ...(seo ? { seo: seo as CaseStudyPayload["seo"] } : {}),
  };
}

function toState(error: unknown): CaseStudyFormState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Your account cannot edit content." };
  }
  return { error: "We could not save the case study. Try again shortly." };
}

export async function createCaseStudyAction(_prev: CaseStudyFormState, formData: FormData): Promise<CaseStudyFormState> {
  let id: number;

  try {
    const study = await createCaseStudy(payloadFrom(formData));
    id = study.id;
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/admin/case-studies");
  redirect(`/admin/case-studies/${id}?saved=1`);
}

export async function updateCaseStudyAction(_prev: CaseStudyFormState, formData: FormData): Promise<CaseStudyFormState> {
  const id = Number(formData.get("id"));
  if (!id) return { error: "Missing case study id." };

  try {
    await updateCaseStudy(id, payloadFrom(formData));
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/admin/case-studies");
  revalidatePath(`/admin/case-studies/${id}`);
  redirect(`/admin/case-studies/${id}?saved=1`);
}

export async function deleteCaseStudyAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;

  await deleteCaseStudy(id).catch(() => null);
  revalidatePath("/admin/case-studies");
  redirect("/admin/case-studies?deleted=1");
}
