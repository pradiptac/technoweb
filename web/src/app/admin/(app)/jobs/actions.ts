"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { updateTag } from "next/cache";
import { ApiError } from "@/lib/api";
import {
  createJobOpening, deleteJobOpening, updateJobOpening,
  saveJobQualification, deleteJobQualification,
  saveJobExperienceLevel, deleteJobExperienceLevel,
  type JobOpeningPayload,
} from "@/lib/admin";
import { seoFromFormData, str as field } from "@/lib/admin-form";

export type JobState = { error?: string; fieldErrors?: Record<string, string[]> };

/**
 * One bullet per line, blanks dropped.
 *
 * A textarea rather than a repeater: responsibilities and requirements are
 * short lines somebody pastes from a job description, and a repeater turns
 * pasting eight of them into eight clicks.
 */
function linesFrom(formData: FormData, key: string): string[] {
  return String(formData.get(key) ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 30);
}

const numberOr = (value: FormDataEntryValue | null, fallback: number): number => {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

function payloadFrom(formData: FormData): JobOpeningPayload {
  const str = (k: string) => field(formData, k);

  return {
    title: String(formData.get("title") ?? "").trim(),
    slug: str("slug"),
    department: str("department"),
    location: str("location"),
    employment_type: String(formData.get("employment_type") ?? "full_time"),
    openings: numberOr(formData.get("openings"), 1),
    job_experience_level_id: formData.get("job_experience_level_id")
      ? Number(formData.get("job_experience_level_id"))
      : null,

    // Blank means "we are not publishing a band", which is a real answer here
    // and must not become 0.
    salary_min: formData.get("salary_min") ? Number(formData.get("salary_min")) : null,
    salary_max: formData.get("salary_max") ? Number(formData.get("salary_max")) : null,
    salary_period: String(formData.get("salary_period") ?? "year"),
    salary_currency: String(formData.get("salary_currency") ?? "INR"),

    summary: str("summary"),
    description: str("description"),
    responsibilities: linesFrom(formData, "responsibilities"),
    requirements: linesFrom(formData, "requirements"),
    qualification_ids: formData.getAll("qualification_ids").map(Number).filter(Boolean),

    status: String(formData.get("status") ?? "draft"),
    published_at: str("published_at"),
    closes_at: str("closes_at"),
    sort_order: numberOr(formData.get("sort_order"), 0),
    ...(seoFromFormData(formData) ? { seo: seoFromFormData(formData)! } : {}),
  };
}

function fail(error: unknown): JobState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: error.message, fieldErrors: error.errors };
    if (error.status === 403) return { error: "Your account cannot change vacancies." };
  }
  return { error: "We could not reach the admin API. Nothing was saved." };
}

/** Both the public list and the posting itself are cached; both must drop. */
function refresh(slug?: string | null) {
  updateTag("careers");
  if (slug) updateTag(`career:${slug}`);
  revalidatePath("/admin/jobs");
}

export async function createJobAction(_prev: JobState, formData: FormData): Promise<JobState> {
  let id: number;
  try {
    const created = await createJobOpening(payloadFrom(formData));
    id = created.id;
    refresh(created.slug);
  } catch (error) {
    return fail(error);
  }

  redirect(`/admin/jobs/${id}?done=created`);
}

export async function updateJobAction(_prev: JobState, formData: FormData): Promise<JobState> {
  const id = Number(formData.get("id"));
  try {
    const saved = await updateJobOpening(id, payloadFrom(formData));
    refresh(saved.slug);
  } catch (error) {
    return fail(error);
  }

  redirect(`/admin/jobs/${id}?done=saved`);
}

export async function deleteJobAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  await deleteJobOpening(id);
  refresh();
  redirect("/admin/jobs?done=vacancy-deleted");
}

/* --------------------------------------------------------- reference data */

export type ReferenceState = { error?: string; ok?: string };

async function reference(work: () => Promise<unknown>, ok: string): Promise<ReferenceState> {
  try {
    await work();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 422 || error.status === 409)) {
      // The in-use guard speaks for itself; pass its sentence through rather
      // than replacing it with a vaguer one.
      return { error: error.message };
    }
    return { error: "We could not reach the admin API. Nothing was changed." };
  }

  revalidatePath("/admin/jobs/reference");
  return { ok };
}

export async function saveQualificationAction(_prev: ReferenceState, formData: FormData): Promise<ReferenceState> {
  const id = formData.get("id") ? Number(formData.get("id")) : null;
  const name = String(formData.get("name") ?? "").trim();

  if (!name) return { error: "Give the qualification a name." };

  return reference(
    () => saveJobQualification(id, { name, sort_order: numberOr(formData.get("sort_order"), 0) }),
    id ? "Qualification renamed." : "Qualification added.",
  );
}

export async function deleteQualificationAction(_prev: ReferenceState, formData: FormData): Promise<ReferenceState> {
  return reference(() => deleteJobQualification(Number(formData.get("id"))), "Qualification deleted.");
}

export async function saveLevelAction(_prev: ReferenceState, formData: FormData): Promise<ReferenceState> {
  const id = formData.get("id") ? Number(formData.get("id")) : null;
  const name = String(formData.get("name") ?? "").trim();

  if (!name) return { error: "Give the level a name." };

  const max = formData.get("max_years");

  return reference(
    () => saveJobExperienceLevel(id, {
      name,
      min_years: numberOr(formData.get("min_years"), 0),
      // Blank means "and above", which is different from zero.
      max_years: max === null || String(max).trim() === "" ? null : Number(max),
      sort_order: numberOr(formData.get("sort_order"), 0),
    }),
    id ? "Level saved." : "Level added.",
  );
}

export async function deleteLevelAction(_prev: ReferenceState, formData: FormData): Promise<ReferenceState> {
  return reference(() => deleteJobExperienceLevel(Number(formData.get("id"))), "Level deleted.");
}
