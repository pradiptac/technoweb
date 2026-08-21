import "server-only";
import { apiFetch, apiUpload } from "@/lib/api";
import { getToken } from "@/lib/admin-auth";
import type {
  AdminBlogPost, AdminDashboard, MediaItem, Paginated, PublishStatus, SeoOverride,
  StaffUser, Ticket, TicketMessage, TicketPriority, TicketStatus,
} from "@/types/api";

/**
 * Authenticated admin reads and writes. Every function pulls the token from
 * the httpOnly cookie itself, mirroring lib/portal.ts.
 */

async function token(): Promise<string> {
  const t = await getToken();
  if (!t) throw new Error("No admin session.");
  return t;
}

export async function getDashboard(): Promise<AdminDashboard> {
  const res = await apiFetch<{ data: AdminDashboard }>("/admin/dashboard", { token: await token() });
  return res.data;
}

export async function getStaff(): Promise<StaffUser[]> {
  const res = await apiFetch<{ data: StaffUser[] }>("/admin/users", { token: await token() });
  return res.data;
}

export type TicketQueueParams = {
  status?: TicketStatus;
  priority?: TicketPriority;
  assigned_to?: number;
  unassigned?: boolean;
  overdue?: boolean;
  q?: string;
  page?: number;
  per_page?: number;
};

export async function getTickets(params: TicketQueueParams = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.priority) query.set("priority", params.priority);
  if (params.assigned_to) query.set("assigned_to", String(params.assigned_to));
  if (params.unassigned) query.set("unassigned", "1");
  if (params.overdue) query.set("overdue", "1");
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));

  const qs = query.toString();
  return apiFetch<Paginated<Ticket>>(`/admin/tickets${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function updateTicket(
  reference: string,
  data: Partial<{ status: TicketStatus; priority: TicketPriority; assigned_to: number | null; ticket_category_id: number | null }>,
): Promise<Ticket> {
  const res = await apiFetch<{ data: Ticket }>(`/admin/tickets/${reference}`, {
    method: "PATCH",
    body: data,
    token: await token(),
  });
  return res.data;
}

export async function getTicket(reference: string): Promise<Ticket> {
  const res = await apiFetch<{ data: Ticket }>(`/admin/tickets/${reference}`, { token: await token() });
  return res.data;
}

export async function replyToTicket(reference: string, formData: FormData): Promise<TicketMessage> {
  const res = await apiUpload<{ data: TicketMessage }>(
    `/admin/tickets/${reference}/reply`,
    formData,
    { token: await token() },
  );
  return res.data;
}

/* ------------------------------------------------------------------ blog */

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

/* ----------------------------------------------------------------- media */

export async function uploadMedia(formData: FormData): Promise<MediaItem> {
  const res = await apiUpload<{ data: MediaItem }>("/admin/media", formData, { token: await token() });
  return res.data;
}
