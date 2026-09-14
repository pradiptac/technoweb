import "server-only";
import { apiFetch } from "@/lib/api";
import { query, token } from "./_shared";
import type {
  AdminBlogPost, Paginated, PublishStatus, SeoOverride, AdminComment,
} from "@/types/api";

export type BlogQueryParams = {
  status?: PublishStatus;
  author_id?: number;
  q?: string;
  page?: number;
  per_page?: number;
};

/** Fields the blog form submits. `seo` is written to the override row. */
export type BlogPostPayload = Partial<{
  title: string;
  slug: string | null;
  excerpt: string | null;
  body: string | null;
  status: PublishStatus;
  published_at: string | null;
  author_id: number | null;
  cover_image_path: string | null;
  seo: Partial<SeoOverride>;
}>;

export async function getBlogPosts(params: BlogQueryParams = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.author_id) query.set("author_id", String(params.author_id));
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));

  const qs = query.toString();
  return apiFetch<Paginated<AdminBlogPost>>(`/admin/blog-posts${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getBlogPost(id: number): Promise<AdminBlogPost> {
  const res = await apiFetch<{ data: AdminBlogPost }>(`/admin/blog-posts/${id}`, { token: await token() });
  return res.data;
}

export async function createBlogPost(payload: BlogPostPayload): Promise<AdminBlogPost> {
  const res = await apiFetch<{ data: AdminBlogPost }>("/admin/blog-posts", {
    method: "POST",
    body: payload,
    token: await token(),
  });
  return res.data;
}

export async function updateBlogPost(id: number, payload: BlogPostPayload): Promise<AdminBlogPost> {
  const res = await apiFetch<{ data: AdminBlogPost }>(`/admin/blog-posts/${id}`, {
    method: "PATCH",
    body: payload,
    token: await token(),
  });
  return res.data;
}

export async function deleteBlogPost(id: number): Promise<void> {
  await apiFetch<void>(`/admin/blog-posts/${id}`, { method: "DELETE", token: await token() });
}

/**
 * A blog category, in the console.
 *
 * No SEO block and no publish status, the call `Brand` already makes: a
 * category is a facet — a filtered listing of posts — rather than a page
 * somebody writes, and an empty one simply does not appear because the sidebar
 * and the strip are built from counts.
 */
export type AdminBlogCategory = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  /** Every post filed here, drafts included — this is the console. */
  posts_count?: number;
};

export type BlogCategoryPayload = Partial<{
  name: string; slug: string | null; description: string | null; sort_order: number | null;
}>;

export async function getBlogCategoryList(params: { q?: string; page?: number; per_page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();
  return apiFetch<Paginated<AdminBlogCategory>>(`/admin/blog-categories${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getBlogCategory(id: number): Promise<AdminBlogCategory> {
  const res = await apiFetch<{ data: AdminBlogCategory }>(`/admin/blog-categories/${id}`, { token: await token() });
  return res.data;
}

export async function createBlogCategory(payload: BlogCategoryPayload): Promise<AdminBlogCategory> {
  const res = await apiFetch<{ data: AdminBlogCategory }>(
    "/admin/blog-categories",
    { method: "POST", body: payload, token: await token() },
  );
  return res.data;
}

export async function updateBlogCategory(id: number, payload: BlogCategoryPayload): Promise<AdminBlogCategory> {
  const res = await apiFetch<{ data: AdminBlogCategory }>(
    `/admin/blog-categories/${id}`,
    { method: "PATCH", body: payload, token: await token() },
  );
  return res.data;
}

export async function deleteBlogCategory(id: number): Promise<void> {
  await apiFetch<void>(`/admin/blog-categories/${id}`, { method: "DELETE", token: await token() });
}

export type CommentList = Paginated<AdminComment> & {
  meta: { statuses: { value: string; label: string }[]; waiting: number };
};

export async function getComments(
  params: { status?: string; post?: number; q?: string; page?: number; per_page?: number } = {},
): Promise<CommentList> {
  return apiFetch<CommentList>(`/admin/blog-comments${query(params)}`, { token: await token() });
}

/**
 * One comment or fifty, through one endpoint.
 *
 * A bulk path separate from the single path is two rules about what a status
 * change does, and the drift between them is silent.
 */
export async function moderateComments(ids: number[], status: string): Promise<void> {
  await apiFetch<void>("/admin/blog-comments/moderate", {
    method: "POST", body: { ids, status }, token: await token(),
  });
}

export async function deleteComment(id: number): Promise<void> {
  await apiFetch<void>(`/admin/blog-comments/${id}`, { method: "DELETE", token: await token() });
}
