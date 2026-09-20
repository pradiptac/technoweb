import "server-only";
import { apiFetch } from "@/lib/api";
import { token } from "./_shared";
import type {
  AdminKnowledgeArticle, KnowledgeCategory, Paginated, PublishStatus, SeoOverride,
} from "@/types/api";

export type KnowledgeQueryParams = {
  status?: PublishStatus;
  knowledge_category_id?: number;
  q?: string;
  page?: number;
  per_page?: number;
};

export type KnowledgeArticlePayload = Partial<{
  title: string;
  slug: string | null;
  excerpt: string | null;
  body: string | null;
  tags: string[];
  status: PublishStatus;
  published_at: string | null;
  knowledge_category_id: number | null;
  seo: Partial<SeoOverride>;
}>;

export async function getKnowledgeArticles(params: KnowledgeQueryParams = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.knowledge_category_id) query.set("knowledge_category_id", String(params.knowledge_category_id));
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));

  const qs = query.toString();
  return apiFetch<Paginated<AdminKnowledgeArticle>>(`/admin/knowledge-articles${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getKnowledgeArticle(id: number): Promise<AdminKnowledgeArticle> {
  const res = await apiFetch<{ data: AdminKnowledgeArticle }>(`/admin/knowledge-articles/${id}`, { token: await token() });
  return res.data;
}

export async function getKnowledgeCategories(): Promise<KnowledgeCategory[]> {
  const res = await apiFetch<{ data: KnowledgeCategory[] }>("/admin/knowledge-categories", { token: await token() });
  return res.data;
}

export async function createKnowledgeArticle(payload: KnowledgeArticlePayload): Promise<AdminKnowledgeArticle> {
  const res = await apiFetch<{ data: AdminKnowledgeArticle }>("/admin/knowledge-articles", {
    method: "POST",
    body: payload,
    token: await token(),
  });
  return res.data;
}

export async function updateKnowledgeArticle(id: number, payload: KnowledgeArticlePayload): Promise<AdminKnowledgeArticle> {
  const res = await apiFetch<{ data: AdminKnowledgeArticle }>(`/admin/knowledge-articles/${id}`, {
    method: "PATCH",
    body: payload,
    token: await token(),
  });
  return res.data;
}

export async function deleteKnowledgeArticle(id: number): Promise<void> {
  await apiFetch<void>(`/admin/knowledge-articles/${id}`, { method: "DELETE", token: await token() });
}
