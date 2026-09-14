import "server-only";
import { apiFetch } from "@/lib/api";
import { token } from "./_shared";
import type {
  AdminJobApplication, AdminJobOpening, JobQualificationRow, JobExperienceLevelRow, Paginated,
} from "@/types/api";

export type JobOpeningPayload = Partial<{
  title: string; slug: string | null; department: string | null; location: string | null;
  employment_type: string; openings: number; job_experience_level_id: number | null;
  salary_min: number | null; salary_max: number | null; salary_period: string; salary_currency: string;
  summary: string | null; description: string | null;
  responsibilities: string[]; requirements: string[]; qualification_ids: number[];
  status: string; published_at: string | null; closes_at: string | null; sort_order: number;
  seo: Record<string, unknown>;
}>;

export async function getJobOpenings(params: { status?: string; q?: string; page?: number; per_page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();
  return apiFetch<Paginated<AdminJobOpening>>(`/admin/job-openings${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getJobOpening(id: number): Promise<AdminJobOpening> {
  const res = await apiFetch<{ data: AdminJobOpening }>(`/admin/job-openings/${id}`, { token: await token() });
  return res.data;
}

export async function createJobOpening(payload: JobOpeningPayload): Promise<AdminJobOpening> {
  const res = await apiFetch<{ data: AdminJobOpening }>("/admin/job-openings", {
    method: "POST", body: payload, token: await token(),
  });
  return res.data;
}

export async function updateJobOpening(id: number, payload: JobOpeningPayload): Promise<AdminJobOpening> {
  const res = await apiFetch<{ data: AdminJobOpening }>(`/admin/job-openings/${id}`, {
    method: "PATCH", body: payload, token: await token(),
  });
  return res.data;
}

export async function deleteJobOpening(id: number): Promise<void> {
  await apiFetch<void>(`/admin/job-openings/${id}`, { method: "DELETE", token: await token() });
}

export async function getJobApplications(params: {
  status?: string; job?: number; q?: string; page?: number; per_page?: number;
} = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.job) query.set("job", String(params.job));
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();

  return apiFetch<Paginated<AdminJobApplication> & { meta: { new_count: number; retention_days: number } }>(
    `/admin/applications${qs ? `?${qs}` : ""}`,
    { token: await token() },
  );
}

export async function getJobApplication(id: number): Promise<AdminJobApplication> {
  const res = await apiFetch<{ data: AdminJobApplication }>(`/admin/applications/${id}`, { token: await token() });
  return res.data;
}

export async function setApplicationStatus(id: number, status: string, note?: string): Promise<AdminJobApplication> {
  const res = await apiFetch<{ data: AdminJobApplication }>(`/admin/applications/${id}/status`, {
    method: "POST", body: { status, note: note || null }, token: await token(),
  });
  return res.data;
}

export async function deleteJobApplication(id: number): Promise<void> {
  await apiFetch<void>(`/admin/applications/${id}`, { method: "DELETE", token: await token() });
}

export async function getJobQualifications(): Promise<JobQualificationRow[]> {
  const res = await apiFetch<{ data: JobQualificationRow[] }>("/admin/job-qualifications", { token: await token() });
  return res.data;
}

export async function getJobExperienceLevels(): Promise<JobExperienceLevelRow[]> {
  const res = await apiFetch<{ data: JobExperienceLevelRow[] }>("/admin/job-experience-levels", { token: await token() });
  return res.data;
}

export async function saveJobQualification(id: number | null, payload: { name: string; sort_order?: number }) {
  const path = id ? `/admin/job-qualifications/${id}` : "/admin/job-qualifications";
  await apiFetch<unknown>(path, { method: id ? "PATCH" : "POST", body: payload, token: await token() });
}

export async function deleteJobQualification(id: number): Promise<void> {
  await apiFetch<void>(`/admin/job-qualifications/${id}`, { method: "DELETE", token: await token() });
}

export async function saveJobExperienceLevel(
  id: number | null,
  payload: { name: string; min_years?: number; max_years?: number | null; sort_order?: number },
) {
  const path = id ? `/admin/job-experience-levels/${id}` : "/admin/job-experience-levels";
  await apiFetch<unknown>(path, { method: id ? "PATCH" : "POST", body: payload, token: await token() });
}

export async function deleteJobExperienceLevel(id: number): Promise<void> {
  await apiFetch<void>(`/admin/job-experience-levels/${id}`, { method: "DELETE", token: await token() });
}
