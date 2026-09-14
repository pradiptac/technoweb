import "server-only";
import { apiFetch } from "@/lib/api";
import { token } from "./_shared";
import type {
  AdminCaseStudy, CaseStudyResult, Paginated, PublishStatus, SeoOverride,
} from "@/types/api";

export type CaseStudyQueryParams = {
  status?: PublishStatus;
  industry_id?: number;
  q?: string;
  page?: number;
  per_page?: number;
};

export type CaseStudyPayload = Partial<{
  title: string;
  slug: string | null;
  client_name: string | null;
  summary: string | null;
  body: string | null;
  results: CaseStudyResult[];
  status: PublishStatus;
  industry_id: number | null;
  cover_image_path: string | null;
  seo: Partial<SeoOverride>;
}>;

export async function getCaseStudies(params: CaseStudyQueryParams = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.industry_id) query.set("industry_id", String(params.industry_id));
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));

  const qs = query.toString();
  return apiFetch<Paginated<AdminCaseStudy>>(`/admin/case-studies${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getCaseStudy(id: number): Promise<AdminCaseStudy> {
  const res = await apiFetch<{ data: AdminCaseStudy }>(`/admin/case-studies/${id}`, { token: await token() });
  return res.data;
}

export async function createCaseStudy(payload: CaseStudyPayload): Promise<AdminCaseStudy> {
  const res = await apiFetch<{ data: AdminCaseStudy }>("/admin/case-studies", {
    method: "POST",
    body: payload,
    token: await token(),
  });
  return res.data;
}

export async function updateCaseStudy(id: number, payload: CaseStudyPayload): Promise<AdminCaseStudy> {
  const res = await apiFetch<{ data: AdminCaseStudy }>(`/admin/case-studies/${id}`, {
    method: "PATCH",
    body: payload,
    token: await token(),
  });
  return res.data;
}

export async function deleteCaseStudy(id: number): Promise<void> {
  await apiFetch<void>(`/admin/case-studies/${id}`, { method: "DELETE", token: await token() });
}
