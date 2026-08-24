import "server-only";
import { apiFetch, apiUpload } from "@/lib/api";
import { getToken } from "@/lib/admin-auth";
import type {
  AdminBlogPost, AdminBrand, AdminCaseStudy, AdminDashboard, AdminIndustry, AdminKnowledgeArticle,
  AdminProductCategory,
  AdminPage, AdminProduct, AdminService, AdminSolution, CaseStudyResult, FaqItem, KnowledgeCategory, MediaItem, MediaFolder,
  AdminFaq, AdminRedirect, AdminStaff, FaqOwnerGroup, RoleOption, SeoMeta, SeoRow,
  Paginated, PublishStatus, SeoOverride, StaffUser, Ticket, TicketMessage,
  TicketPriority, TicketStatus,
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

/* --------------------------------------------------------- knowledge base */

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

/* ------------------------------------------------------------ case studies */

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

/**
 * Doubles as the picker source for case studies and solutions. One endpoint
 * per resource — a separate lightweight picker route was duplicate surface
 * for a list that is six rows long.
 */
export async function getIndustries(): Promise<AdminIndustry[]> {
  const res = await apiFetch<Paginated<AdminIndustry>>("/admin/industries?per_page=100", { token: await token() });
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

/* -------------------------------------------------------------- solutions */

export type SolutionQueryParams = {
  status?: PublishStatus;
  q?: string;
  page?: number;
  per_page?: number;
};

export type SolutionPayload = Partial<{
  title: string;
  slug: string | null;
  summary: string | null;
  problem_statement: string | null;
  overview: string | null;
  benefits: string[];
  technologies: string[];
  icon: string | null;
  hero_image_path: string | null;
  status: PublishStatus;
  sort_order: number | null;
  product_ids: number[];
  industry_ids: number[];
  faqs: FaqItem[];
  seo: Partial<SeoOverride>;
}>;

export async function getSolutions(params: SolutionQueryParams = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));

  const qs = query.toString();
  return apiFetch<Paginated<AdminSolution>>(`/admin/solutions${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getSolution(id: number): Promise<AdminSolution> {
  const res = await apiFetch<{ data: AdminSolution }>(`/admin/solutions/${id}`, { token: await token() });
  return res.data;
}

/** Solution options for the industry form's picker. */
export async function getSolutionOptions(): Promise<{ id: number; name: string }[]> {
  const res = await apiFetch<Paginated<AdminSolution>>("/admin/solutions?per_page=100", { token: await token() });
  return res.data.map((s) => ({ id: s.id, name: s.title }));
}

/**
 * Product options for the solution form.
 *
 * /admin/products is the CRUD index and the picker both, so this asks for a
 * page big enough to be a picker rather than taking the default 30 — the
 * catalogue is small, and a silently truncated list would just look like
 * missing products.
 */
export async function getProductOptions(): Promise<{ id: number; name: string }[]> {
  const res = await apiFetch<Paginated<AdminProduct>>("/admin/products?per_page=100", { token: await token() });
  return res.data.map((p) => ({ id: p.id, name: p.name }));
}

export async function createSolution(payload: SolutionPayload): Promise<AdminSolution> {
  const res = await apiFetch<{ data: AdminSolution }>("/admin/solutions", {
    method: "POST",
    body: payload,
    token: await token(),
  });
  return res.data;
}

export async function updateSolution(id: number, payload: SolutionPayload): Promise<AdminSolution> {
  const res = await apiFetch<{ data: AdminSolution }>(`/admin/solutions/${id}`, {
    method: "PATCH",
    body: payload,
    token: await token(),
  });
  return res.data;
}

export async function deleteSolution(id: number): Promise<void> {
  await apiFetch<void>(`/admin/solutions/${id}`, { method: "DELETE", token: await token() });
}

/* --------------------------------------------------------- services */

export type ServicePayload = Partial<{
  title: string; slug: string | null; summary: string | null; body: string | null;
  icon: string | null; status: PublishStatus; sort_order: number | null;
  faqs: FaqItem[]; seo: Partial<SeoOverride>;
}>;

export async function getServices(params: { status?: PublishStatus; q?: string; page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  const qs = query.toString();
  return apiFetch<Paginated<AdminService>>(`/admin/services${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getService(id: number): Promise<AdminService> {
  const res = await apiFetch<{ data: AdminService }>(`/admin/services/${id}`, { token: await token() });
  return res.data;
}

export async function createService(payload: ServicePayload): Promise<AdminService> {
  const res = await apiFetch<{ data: AdminService }>("/admin/services", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateService(id: number, payload: ServicePayload): Promise<AdminService> {
  const res = await apiFetch<{ data: AdminService }>(`/admin/services/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteService(id: number): Promise<void> {
  await apiFetch<void>(`/admin/services/${id}`, { method: "DELETE", token: await token() });
}

/* -------------------------------------------------------- industries */

export type IndustryPayload = Partial<{
  name: string; slug: string | null; summary: string | null; body: string | null;
  icon: string | null; sort_order: number | null;
  solution_ids: number[]; seo: Partial<SeoOverride>;
}>;

export async function getIndustryList(params: { q?: string; page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  const qs = query.toString();
  return apiFetch<Paginated<AdminIndustry>>(`/admin/industries${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getIndustry(id: number): Promise<AdminIndustry> {
  const res = await apiFetch<{ data: AdminIndustry }>(`/admin/industries/${id}`, { token: await token() });
  return res.data;
}

export async function createIndustry(payload: IndustryPayload): Promise<AdminIndustry> {
  const res = await apiFetch<{ data: AdminIndustry }>("/admin/industries", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateIndustry(id: number, payload: IndustryPayload): Promise<AdminIndustry> {
  const res = await apiFetch<{ data: AdminIndustry }>(`/admin/industries/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteIndustry(id: number): Promise<void> {
  await apiFetch<void>(`/admin/industries/${id}`, { method: "DELETE", token: await token() });
}


/* --------------------------------------------------------------- products */

export type ProductQueryParams = {
  status?: PublishStatus; q?: string; page?: number; brand?: number; category?: number;
};

export type ProductPayload = Partial<{
  name: string; slug: string | null; sku: string | null;
  brand_id: number | null; product_category_id: number | null;
  short_description: string | null; description: string | null;
  datasheet_path: string | null; status: PublishStatus;
  is_featured: boolean; sort_order: number | null;
  specifications: Record<string, string>;
  features: string[]; images: string[];
  solution_ids: number[]; related_product_ids: number[];
  faqs: FaqItem[]; seo: Partial<SeoOverride>;
}>;

export async function getProductList(params: ProductQueryParams = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.brand) query.set("brand", String(params.brand));
  if (params.category) query.set("category", String(params.category));
  const qs = query.toString();
  return apiFetch<Paginated<AdminProduct>>(`/admin/products${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getProduct(id: number): Promise<AdminProduct> {
  const res = await apiFetch<{ data: AdminProduct }>(`/admin/products/${id}`, { token: await token() });
  return res.data;
}

export async function createProduct(payload: ProductPayload): Promise<AdminProduct> {
  const res = await apiFetch<{ data: AdminProduct }>("/admin/products", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateProduct(id: number, payload: ProductPayload): Promise<AdminProduct> {
  const res = await apiFetch<{ data: AdminProduct }>(`/admin/products/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteProduct(id: number): Promise<void> {
  await apiFetch<void>(`/admin/products/${id}`, { method: "DELETE", token: await token() });
}

/* ------------------------------------------------------------------- faqs */

export type FaqPayload = Partial<{
  question: string; answer: string; sort_order: number | null;
  owner_type: string; owner_id: number;
}>;

export async function getFaqList(params: { q?: string; owner_type?: string; page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.owner_type) query.set("owner_type", params.owner_type);
  if (params.page) query.set("page", String(params.page));
  const qs = query.toString();
  return apiFetch<Paginated<AdminFaq>>(`/admin/faqs${qs ? `?${qs}` : ""}`, { token: await token() });
}

/** Everything an FAQ can hang off, grouped by type, for the owner picker. */
export async function getFaqOwners(): Promise<FaqOwnerGroup[]> {
  const res = await apiFetch<{ data: FaqOwnerGroup[] }>("/admin/faq-owners", { token: await token() });
  return res.data;
}

export async function getFaq(id: number): Promise<AdminFaq> {
  const res = await apiFetch<{ data: AdminFaq }>(`/admin/faqs/${id}`, { token: await token() });
  return res.data;
}

export async function createFaq(payload: FaqPayload): Promise<AdminFaq> {
  const res = await apiFetch<{ data: AdminFaq }>("/admin/faqs", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateFaq(id: number, payload: FaqPayload): Promise<AdminFaq> {
  const res = await apiFetch<{ data: AdminFaq }>(`/admin/faqs/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteFaq(id: number): Promise<void> {
  await apiFetch<void>(`/admin/faqs/${id}`, { method: "DELETE", token: await token() });
}

/* -------------------------------------------------------------- redirects */

export type RedirectPayload = Partial<{
  from_path: string; to_path: string; status_code: number | null; is_active: boolean;
}>;

export async function getRedirectList(params: { q?: string; source?: string; page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.source) query.set("source", params.source);
  if (params.page) query.set("page", String(params.page));
  const qs = query.toString();
  return apiFetch<Paginated<AdminRedirect>>(`/admin/redirects${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getRedirect(id: number): Promise<AdminRedirect> {
  const res = await apiFetch<{ data: AdminRedirect }>(`/admin/redirects/${id}`, { token: await token() });
  return res.data;
}

export async function createRedirect(payload: RedirectPayload): Promise<AdminRedirect> {
  const res = await apiFetch<{ data: AdminRedirect }>("/admin/redirects", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateRedirect(id: number, payload: RedirectPayload): Promise<AdminRedirect> {
  const res = await apiFetch<{ data: AdminRedirect }>(`/admin/redirects/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteRedirect(id: number): Promise<void> {
  await apiFetch<void>(`/admin/redirects/${id}`, { method: "DELETE", token: await token() });
}

/* -------------------------------------------------------------------- seo */

export async function getSeoOverview(
  params: { type?: string; q?: string; issues?: string; page?: string } = {},
) {
  const query = new URLSearchParams();
  if (params.type) query.set("type", params.type);
  if (params.q) query.set("q", params.q);
  // Server-side, because the results are paginated: filtering a page in the
  // browser would hide only the rows that happened to land on it.
  if (params.issues) query.set("issues", params.issues);
  if (params.page) query.set("page", params.page);
  const qs = query.toString();
  return apiFetch<{ data: SeoRow[]; meta: SeoMeta }>(`/admin/seo${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function setSitemapInclude(type: string, id: number, include: boolean): Promise<void> {
  await apiFetch<void>("/admin/seo/sitemap", {
    method: "PATCH", body: { type, id, sitemap_include: include }, token: await token(),
  });
}

/* ------------------------------------------------------------------ staff */

export type StaffPayload = Partial<{
  name: string; email: string; password: string | null;
  is_active: boolean; roles: string[];
}>;

export async function getStaffList(params: { q?: string; role?: string; page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.role) query.set("role", params.role);
  if (params.page) query.set("page", String(params.page));
  const qs = query.toString();
  return apiFetch<Paginated<AdminStaff>>(`/admin/staff${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getStaffRoles(): Promise<RoleOption[]> {
  const res = await apiFetch<{ data: RoleOption[] }>("/admin/staff/roles", { token: await token() });
  return res.data;
}

/** One staff account, for the edit screen. getStaff() above is the read-only
 *  assignment picker on /admin/users and stays as it is. */
export async function getStaffMember(id: number): Promise<AdminStaff> {
  const res = await apiFetch<{ data: AdminStaff }>(`/admin/staff/${id}`, { token: await token() });
  return res.data;
}

export async function createStaff(payload: StaffPayload): Promise<AdminStaff> {
  const res = await apiFetch<{ data: AdminStaff }>("/admin/staff", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateStaff(id: number, payload: StaffPayload): Promise<AdminStaff> {
  const res = await apiFetch<{ data: AdminStaff }>(`/admin/staff/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteStaff(id: number): Promise<void> {
  await apiFetch<void>(`/admin/staff/${id}`, { method: "DELETE", token: await token() });
}

/* ----------------------------------------------------------------- brands */

export type BrandPayload = Partial<{
  name: string; slug: string | null; description: string | null;
  logo_path: string | null; sort_order: number | null; is_featured: boolean;
}>;

export async function getBrandList(params: { q?: string; page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  const qs = query.toString();
  return apiFetch<Paginated<AdminBrand>>(`/admin/brands${qs ? `?${qs}` : ""}`, { token: await token() });
}

/** Every brand, for the product form’s select. */
export async function getBrandOptions(): Promise<{ id: number; name: string }[]> {
  const res = await apiFetch<Paginated<AdminBrand>>("/admin/brands?per_page=100", { token: await token() });
  return res.data.map((b) => ({ id: b.id, name: b.name }));
}

export async function getBrand(id: number): Promise<AdminBrand> {
  const res = await apiFetch<{ data: AdminBrand }>(`/admin/brands/${id}`, { token: await token() });
  return res.data;
}

export async function createBrand(payload: BrandPayload): Promise<AdminBrand> {
  const res = await apiFetch<{ data: AdminBrand }>("/admin/brands", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateBrand(id: number, payload: BrandPayload): Promise<AdminBrand> {
  const res = await apiFetch<{ data: AdminBrand }>(`/admin/brands/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteBrand(id: number): Promise<void> {
  await apiFetch<void>(`/admin/brands/${id}`, { method: "DELETE", token: await token() });
}

/* ------------------------------------------------------ product categories */

export type ProductCategoryPayload = Partial<{
  name: string; slug: string | null; description: string | null; icon: string | null;
  parent_id: number | null; sort_order: number | null; seo: Partial<SeoOverride>;
}>;

export async function getProductCategoryList(params: { q?: string; page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  const qs = query.toString();
  return apiFetch<Paginated<AdminProductCategory>>(`/admin/product-categories${qs ? `?${qs}` : ""}`, { token: await token() });
}

/**
 * Every category, for the parent select and the product form.
 *
 * The index doubles as the picker — one endpoint per resource, as with
 * industries.
 */
export async function getProductCategoryOptions(): Promise<{ id: number; name: string }[]> {
  const res = await apiFetch<Paginated<AdminProductCategory>>("/admin/product-categories?per_page=100", { token: await token() });
  return res.data.map((c) => ({ id: c.id, name: c.parent_name ? `${c.parent_name} → ${c.name}` : c.name }));
}

export async function getProductCategory(id: number): Promise<AdminProductCategory> {
  const res = await apiFetch<{ data: AdminProductCategory }>(`/admin/product-categories/${id}`, { token: await token() });
  return res.data;
}

export async function createProductCategory(payload: ProductCategoryPayload): Promise<AdminProductCategory> {
  const res = await apiFetch<{ data: AdminProductCategory }>("/admin/product-categories", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateProductCategory(id: number, payload: ProductCategoryPayload): Promise<AdminProductCategory> {
  const res = await apiFetch<{ data: AdminProductCategory }>(`/admin/product-categories/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteProductCategory(id: number): Promise<void> {
  await apiFetch<void>(`/admin/product-categories/${id}`, { method: "DELETE", token: await token() });
}

/* ------------------------------------------------------------------ pages */

export type PageQueryParams = { status?: PublishStatus; q?: string; page?: number; per_page?: number };

export type CmsPagePayload = Partial<{
  title: string;
  slug: string | null;
  body: string | null;
  template: string | null;
  status: PublishStatus;
  published_at: string | null;
  seo: Partial<SeoOverride>;
}>;

export async function getPages(params: PageQueryParams = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));

  const qs = query.toString();
  return apiFetch<Paginated<AdminPage>>(`/admin/pages${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getPage(id: number): Promise<AdminPage> {
  const res = await apiFetch<{ data: AdminPage }>(`/admin/pages/${id}`, { token: await token() });
  return res.data;
}

export async function createPage(payload: CmsPagePayload): Promise<AdminPage> {
  const res = await apiFetch<{ data: AdminPage }>("/admin/pages", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updatePage(id: number, payload: CmsPagePayload): Promise<AdminPage> {
  const res = await apiFetch<{ data: AdminPage }>(`/admin/pages/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deletePage(id: number): Promise<void> {
  await apiFetch<void>(`/admin/pages/${id}`, { method: "DELETE", token: await token() });
}

/* --------------------------------------------------------- settings */

export type SettingRow = {
  key: string;
  /** Always null for a credential — the API never sends one back. */
  value: string | null;
  type: string;
  is_secret?: boolean;
  /** Whether a value is stored. The only thing the UI can know about a secret. */
  is_set?: boolean;
  /** Resolved preview URL for the *_path settings that hold a media file. */
  url?: string | null;
};
export type SettingGroups = Record<string, SettingRow[]>;

export async function getSettings(): Promise<SettingGroups> {
  const res = await apiFetch<{ data: SettingGroups }>("/admin/settings", { token: await token() });
  return res.data;
}

export async function saveSettings(settings: { key: string; value: string }[]): Promise<void> {
  await apiFetch<void>("/admin/settings", { method: "PATCH", body: { settings }, token: await token() });
}

/**
 * Removes a stored credential.
 *
 * Its own endpoint because a blank save means "unchanged" — the form can
 * never show the current value, so it submits blank every time, and treating
 * that as a delete would wipe the SMTP password on every unrelated save.
 */
export async function clearSettingSecret(key: string): Promise<void> {
  await apiFetch<void>("/admin/settings/clear-secret", { method: "POST", body: { key }, token: await token() });
}

/* ----------------------------------------------------------------- media */

export async function getMediaList(
  params: { q?: string; page?: number; folder?: string; kind?: string } = {},
) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  // "unfiled" is a real value, not an absent one — see API.md.
  if (params.folder) query.set("folder", params.folder);
  if (params.kind) query.set("kind", params.kind);
  const qs = query.toString();
  return apiFetch<Paginated<MediaItem>>(`/admin/media${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getMediaFolders() {
  const res = await apiFetch<{ data: MediaFolder[] }>("/admin/media-folders", { token: await token() });
  return res.data;
}

export async function createMediaFolder(name: string): Promise<MediaFolder> {
  const res = await apiFetch<{ data: MediaFolder }>("/admin/media-folders", {
    method: "POST", body: { name }, token: await token(),
  });
  return res.data;
}

export async function deleteMediaFolder(id: number): Promise<void> {
  await apiFetch<void>(`/admin/media-folders/${id}`, { method: "DELETE", token: await token() });
}

export async function updateMedia(
  id: number,
  body: { filename?: string; alt_text?: string | null; folder_id?: number | null },
): Promise<MediaItem> {
  const res = await apiFetch<{ data: MediaItem }>(`/admin/media/${id}`, {
    method: "PATCH", body, token: await token(),
  });
  return res.data;
}

export async function resizeMedia(
  id: number,
  body: { width: number; height: number; thumbnails?: number[] },
): Promise<{ data: MediaItem; thumbnails: MediaItem[] }> {
  return apiFetch<{ data: MediaItem; thumbnails: MediaItem[] }>(`/admin/media/${id}/resize`, {
    method: "POST", body, token: await token(),
  });
}

export async function deleteMedia(id: number): Promise<void> {
  await apiFetch<void>(`/admin/media/${id}`, { method: "DELETE", token: await token() });
}

export async function uploadMedia(formData: FormData): Promise<MediaItem> {
  const res = await apiUpload<{ data: MediaItem }>("/admin/media", formData, { token: await token() });
  return res.data;
}
