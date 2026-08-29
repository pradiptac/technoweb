import "server-only";
import { apiFetch, apiUpload } from "@/lib/api";
import { getToken } from "@/lib/admin-auth";
import type {
  AdminBlogPost, AdminBrand, AdminCaseStudy, AdminDashboard, AdminIndustry, AdminKnowledgeArticle,
  AdminProductCategory,
  AdminPage, AdminProduct, AdminService, AdminSolution, CaseStudyResult, FaqItem, KnowledgeCategory, MediaItem, MediaFolder,
  ActivityEntry, AdminCustomer, AdminFaq, AdminJobApplication, AdminJobOpening,
  JobQualificationRow, JobExperienceLevelRow, AdminRedirect, AdminStaff, FaqOwnerGroup, RoleOption, SeoMeta, SeoRow,
  Paginated, PublishStatus, SeoOverride, StaffUser, Ticket, TicketMessage,
  TicketPriority, TicketStatus,
  Slider,
  SiteForm,
  FormSubmission,
  MailStatus,
  AdminLandingPage, AdminLocation, LandingOpportunity,
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
  show_in_menu: boolean;
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
  show_in_menu: boolean;
}>;

export async function getServices(params: { status?: PublishStatus; q?: string; page?: number; per_page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
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
  show_in_menu: boolean;
}>;

export async function getIndustryList(params: { q?: string; page?: number; per_page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
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
  status?: PublishStatus; q?: string; page?: number; per_page?: number;
  brand?: number; category?: number;
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
  if (params.per_page) query.set("per_page", String(params.per_page));
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

export async function getFaqList(params: { q?: string; owner_type?: string; page?: number; per_page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.owner_type) query.set("owner_type", params.owner_type);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
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

export async function getRedirectList(params: { q?: string; source?: string; page?: number; per_page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.source) query.set("source", params.source);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
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

/**
 * One record's score, recomputed now.
 *
 * What the Recheck button calls. The record's edit form opens in a new tab on
 * purpose — working down a filtered list should not spend your place in it —
 * which leaves the list holding a score from before the edit, and reloading to
 * fix that costs the filters and the scroll position the new tab was
 * protecting.
 *
 * The API still collects every record to answer this, because two of the
 * checks are about duplicate titles and descriptions and neither can be seen
 * from inside a single row. What it saves is the response: 1.5KB against the
 * 73KB the list sends, and one row to re-render rather than fifty.
 */
export async function getSeoRecord(type: string, id: number): Promise<SeoRow> {
  const res = await apiFetch<{ data: SeoRow }>(
    `/admin/seo/${encodeURIComponent(type)}/${id}`,
    { token: await token() },
  );

  return res.data;
}

export async function getSeoOverview(
  params: { type?: string; q?: string; issues?: string; check?: string; page?: string; per_page?: string } = {},
) {
  const query = new URLSearchParams();
  if (params.type) query.set("type", params.type);
  if (params.q) query.set("q", params.q);
  // Server-side, because the results are paginated: filtering a page in the
  // browser would hide only the rows that happened to land on it.
  if (params.issues) query.set("issues", params.issues);
  // One failed check, named. This is what turns a figure on the score card
  // into the list of records behind it.
  if (params.check) query.set("check", params.check);
  if (params.page) query.set("page", params.page);
  if (params.per_page) query.set("per_page", params.per_page);
  const qs = query.toString();
  return apiFetch<{ data: SeoRow[]; meta: SeoMeta }>(`/admin/seo${qs ? `?${qs}` : ""}`, { token: await token() });
}

/* ------------------------------------------------------------------ mail */

export async function getMailStatus(): Promise<MailStatus> {
  const res = await apiFetch<{ data: MailStatus }>("/admin/settings/mail", { token: await token() });
  return res.data;
}

/**
 * The consent URL to send the administrator to.
 *
 * The redirect is built here rather than on the API, because only the frontend
 * knows the origin it is actually reachable at — the two are different hosts in
 * production. The API checks it against its own configured frontend before
 * echoing it to Google, so this cannot become an open redirect.
 */
export async function authorizeMailbox(transport: string, origin: string): Promise<string> {
  const res = await apiFetch<{ data: { url: string } }>("/admin/settings/mail/authorize", {
    method: "POST",
    body: { transport, redirect_uri: `${origin}/admin/settings/mail/callback` },
    token: await token(),
  });
  return res.data.url;
}

export async function completeMailConnection(code: string, state: string): Promise<string> {
  const res = await apiFetch<{ data: { account: string } }>("/admin/settings/mail/callback", {
    method: "POST", body: { code, state }, token: await token(),
  });
  return res.data.account;
}

export async function disconnectMailbox(): Promise<void> {
  await apiFetch<void>("/admin/settings/mail/disconnect", { method: "POST", token: await token() });
}

/**
 * Send one test message.
 *
 * With no address it goes to the signed-in administrator, which is the common
 * case. An address is accepted because the question this usually answers is
 * whether mail reaches *outside* — a message to an external inbox proves SPF,
 * DKIM and reputation in a way one to the same domain never can.
 */
export async function sendTestMail(email?: string): Promise<{ sent_to: string; transport: string }> {
  const res = await apiFetch<{ data: { sent_to: string; transport: string } }>(
    "/admin/settings/mail/test",
    { method: "POST", body: email ? { email } : {}, token: await token() },
  );
  return res.data;
}

export async function setSitemapInclude(type: string, id: number, include: boolean): Promise<void> {
  await apiFetch<void>("/admin/seo/sitemap", {
    method: "PATCH", body: { type, id, sitemap_include: include }, token: await token(),
  });
}

/* ----------------------------------------------------------------- careers */

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

/* ------------------------------------------------------------- applications */

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

/* -------------------------------------------------- careers reference data */

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

/* --------------------------------------------------------------- activity */

/**
 * The activity log. Read-only by design — there is no create, update or delete
 * here because the API offers none, and a log the console can edit is not one.
 */
export async function getActivity(params: {
  action?: string; q?: string; page?: number; per_page?: number;
} = {}) {
  const query = new URLSearchParams();
  if (params.action) query.set("action", params.action);
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();

  return apiFetch<Paginated<ActivityEntry> & { meta: { retention_days: number; actions: string[] } }>(
    `/admin/activity${qs ? `?${qs}` : ""}`,
    { token: await token() },
  );
}

/* -------------------------------------------------------------- customers */

/**
 * Portal accounts and the approval queue.
 *
 * Every mutation returns the updated row, so the caller re-renders from the
 * server's answer rather than from what it hoped it wrote — a status the API
 * refused would otherwise show as applied until the next reload.
 */
export async function getCustomers(params: {
  status?: string; q?: string; verified?: string; page?: number; per_page?: number;
} = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.q) query.set("q", params.q);
  if (params.verified) query.set("verified", params.verified);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();

  return apiFetch<Paginated<AdminCustomer> & { meta: { pending_count?: number } }>(
    `/admin/customers${qs ? `?${qs}` : ""}`,
    { token: await token() },
  );
}

export async function getCustomer(id: number): Promise<AdminCustomer> {
  const res = await apiFetch<{ data: AdminCustomer }>(`/admin/customers/${id}`, { token: await token() });
  return res.data;
}

export async function updateCustomer(
  id: number,
  payload: Partial<{ name: string; email: string; company: string | null; phone: string | null }>,
): Promise<AdminCustomer> {
  const res = await apiFetch<{ data: AdminCustomer }>(`/admin/customers/${id}`, {
    method: "PATCH", body: payload, token: await token(),
  });
  return res.data;
}

export async function approveCustomer(id: number): Promise<AdminCustomer> {
  const res = await apiFetch<{ data: AdminCustomer }>(`/admin/customers/${id}/approve`, {
    method: "POST", token: await token(),
  });
  return res.data;
}

export async function rejectCustomer(id: number, note?: string): Promise<AdminCustomer> {
  const res = await apiFetch<{ data: AdminCustomer }>(`/admin/customers/${id}/reject`, {
    method: "POST", body: { note: note || null }, token: await token(),
  });
  return res.data;
}

export async function setCustomerStatus(
  id: number, status: "active" | "suspended", note?: string,
): Promise<AdminCustomer> {
  const res = await apiFetch<{ data: AdminCustomer }>(`/admin/customers/${id}/status`, {
    method: "POST", body: { status, note: note || null }, token: await token(),
  });
  return res.data;
}

export async function resendCustomerVerificationEmail(id: number): Promise<AdminCustomer> {
  const res = await apiFetch<{ data: AdminCustomer }>(`/admin/customers/${id}/resend-verification`, {
    method: "POST", token: await token(),
  });
  return res.data;
}

/* ------------------------------------------------------------------ staff */

export type StaffPayload = Partial<{
  name: string; email: string; password: string | null;
  is_active: boolean; roles: string[];
}>;

export async function getStaffList(params: { q?: string; role?: string; page?: number; per_page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.role) query.set("role", params.role);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
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

export async function getBrandList(params: { q?: string; page?: number; per_page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
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
  show_in_menu: boolean;
}>;

export async function getProductCategoryList(params: { q?: string; page?: number; per_page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
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
  /**
   * The choices, for a setting whose value is one of a fixed set.
   *
   * Sent by the API rather than listed here — the same rule
   * `schema_type_options` follows, because two hand-written copies of one list
   * of strings is exactly the drift nothing type-checks across the wire.
   */
  options?: { value: string; label: string; description: string }[] | null;
};
export type SettingGroups = Record<string, SettingRow[]>;

/**
 * What the server will accept, as opposed to what the console has been told to
 * ask for.
 *
 * `capped` is the one that matters: it says php.ini is quietly overruling the
 * setting, which is otherwise invisible from a screen showing only the number
 * somebody typed.
 */
export type UploadLimits = {
  max_kb: number;
  max_video_kb: number;
  php_upload_max_kb: number;
  php_post_max_kb: number;
  php_ceiling_kb: number;
  /** Resolution ceiling. A different resource from file size — see the API. */
  max_megapixels: number;
  capped: boolean;
  video_capped: boolean;
};

export type SettingsPayload = { groups: SettingGroups; uploads: UploadLimits };

export async function getSettings(): Promise<SettingsPayload> {
  const res = await apiFetch<{ data: SettingGroups; meta: { uploads: UploadLimits } }>(
    "/admin/settings", { token: await token() },
  );
  return { groups: res.data, uploads: res.meta.uploads };
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
  params: {
    q?: string; page?: number; per_page?: number; folder?: string; kind?: string;
    sort?: string; direction?: string; trashed?: boolean;
  } = {},
) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  // "unfiled" is a real value, not an absent one — see API.md.
  if (params.folder) query.set("folder", params.folder);
  if (params.kind) query.set("kind", params.kind);
  // Both are validated against a whitelist server-side and fall back rather
  // than 422, so passing whatever the URL held is safe.
  if (params.sort) query.set("sort", params.sort);
  if (params.direction) query.set("direction", params.direction);
  // The bin is a view of the same endpoint, not a second one.
  if (params.trashed) query.set("trashed", "1");
  const qs = query.toString();
  return apiFetch<MediaListResponse>(`/admin/media${qs ? `?${qs}` : ""}`, { token: await token() });
}

/**
 * Facts about the whole library, sent with the page of it being shown.
 *
 * The allowed extensions come from the API rather than a second list here —
 * a panel telling an editor what is accepted, built from its own copy, lies
 * the first time somebody widens the real one.
 */
export type MediaLibraryMeta = {
  images: number;
  files: number;
  trashed: number;
  bytes: number;
  extensions: string[];
  max_kb: number;
  max_video_kb: number;
  php_ceiling_kb: number;
  max_megapixels: number;
};

export type MediaListResponse = Paginated<MediaItem> & {
  meta: Paginated<MediaItem>["meta"] & { library?: MediaLibraryMeta };
};

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
  body: {
    filename?: string; alt_text?: string | null; description?: string | null;
    tags?: string[]; folder_id?: number | null;
  },
): Promise<MediaItem> {
  const res = await apiFetch<{ data: MediaItem }>(`/admin/media/${id}`, {
    method: "PATCH", body, token: await token(),
  });
  return res.data;
}

export async function cropMedia(
  id: number,
  body: {
    x: number; y: number; width: number; height: number;
    out_width?: number; out_height?: number;
    /** Write to a duplicate and leave the original alone. */
    as_copy?: boolean;
  },
): Promise<MediaItem> {
  const res = await apiFetch<{ data: MediaItem }>(`/admin/media/${id}/crop`, {
    method: "POST", body, token: await token(),
  });
  return res.data;
}

export async function resizeMedia(
  id: number,
  body: { width: number; height: number; thumbnails?: number[]; as_copy?: boolean },
): Promise<{ data: MediaItem; thumbnails: MediaItem[] }> {
  return apiFetch<{ data: MediaItem; thumbnails: MediaItem[] }>(`/admin/media/${id}/resize`, {
    method: "POST", body, token: await token(),
  });
}

/**
 * Bulk operations, all POSTs because each does work rather than describing a
 * resource — and all declared above `media/{id}` in the route table, or
 * `media/move` would bind as a record id and 404.
 */
export async function moveMedia(ids: number[], folderId: number | null): Promise<void> {
  // `folder_id: null` is a real instruction — "take these out of their
  // folder" — so the key is always sent rather than omitted when null.
  await apiFetch<void>("/admin/media/move", {
    method: "POST", body: { ids, folder_id: folderId }, token: await token(),
  });
}

export async function copyMedia(ids: number[], folderId?: number | null): Promise<MediaItem[]> {
  const res = await apiFetch<{ data: MediaItem[] }>("/admin/media/copy", {
    method: "POST",
    body: folderId === undefined ? { ids } : { ids, folder_id: folderId },
    token: await token(),
  });
  return res.data;
}

export async function deleteManyMedia(ids: number[]): Promise<number> {
  const res = await apiFetch<{ data: { deleted: number } }>("/admin/media/delete", {
    method: "POST", body: { ids }, token: await token(),
  });
  return res.data.deleted;
}

/**
 * Rotate, flip or adjust. One endpoint because the three differ only in which
 * `ImageEditor` call runs — see the controller.
 *
 * Returns the row that was written to, which is **not** necessarily the one
 * asked about: with `as_copy` the edit lands on a duplicate, and the caller
 * needs its id to keep editing the thing it can now see.
 */
/** A file's superseded copies, newest first. */
export type MediaVersionRow = {
  id: number;
  url: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  operation: string | null;
  created_by: string | null;
  created_at: string;
};

export async function getMediaVersions(id: number): Promise<MediaVersionRow[]> {
  const res = await apiFetch<{ data: MediaVersionRow[] }>(`/admin/media/${id}/versions`, { token: await token() });
  return res.data;
}

export async function restoreMediaVersion(id: number, versionId: number): Promise<MediaItem> {
  const res = await apiFetch<{ data: MediaItem }>(`/admin/media/${id}/versions/${versionId}/restore`, {
    method: "POST", token: await token(),
  });
  return res.data;
}

/* ------------------------------------------------------------------- bin */

/**
 * Swap the bytes, keep the path.
 *
 * The point is the path: records store one, so every page already using this
 * image picks up the new picture. Uploading a replacement as a *new* file and
 * deleting the old one breaks all of them silently.
 */
export async function replaceMedia(id: number, formData: FormData): Promise<MediaItem> {
  const res = await apiUpload<{ data: MediaItem }>(`/admin/media/${id}/replace`, formData, { token: await token() });
  return res.data;
}

export async function restoreMedia(id: number): Promise<MediaItem> {
  const res = await apiFetch<{ data: MediaItem }>(`/admin/media/${id}/restore`, {
    method: "POST", token: await token(),
  });
  return res.data;
}

export async function purgeMedia(id: number): Promise<void> {
  await apiFetch<void>(`/admin/media/${id}/purge`, { method: "DELETE", token: await token() });
}

export async function emptyMediaTrash(): Promise<number> {
  const res = await apiFetch<{ data: { deleted: number } }>("/admin/media/trash/empty", {
    method: "POST", token: await token(),
  });
  return res.data.deleted;
}

export async function transformMedia(
  id: number,
  body: {
    operation: "rotate" | "flip" | "adjust";
    degrees?: 90 | 180 | 270;
    axis?: "horizontal" | "vertical";
    brightness?: number;
    contrast?: number;
    greyscale?: boolean;
    as_copy?: boolean;
  },
): Promise<MediaItem> {
  const res = await apiFetch<{ data: MediaItem }>(`/admin/media/${id}/transform`, {
    method: "POST", body, token: await token(),
  });
  return res.data;
}

export async function deleteMedia(id: number): Promise<void> {
  await apiFetch<void>(`/admin/media/${id}`, { method: "DELETE", token: await token() });
}

export async function uploadMedia(formData: FormData): Promise<MediaItem> {
  const res = await apiUpload<{ data: MediaItem }>("/admin/media", formData, { token: await token() });
  return res.data;
}


/* ---------------------------------------------------------------- sliders */

export type SlidePayload = {
  kind: "image" | "video" | "youtube";
  media_path?: string | null;
  poster_path?: string | null;
  youtube_url?: string | null;
  alt_text?: string | null;
  heading?: string | null;
  caption?: string | null;
  link_url?: string | null;
  link_label?: string | null;
};

export type SliderPayload = {
  name: string;
  slug?: string;
  status?: string;
  autoplay?: boolean;
  interval_ms?: number;
  /** Replaced wholesale — send the complete set, like faqs. */
  slides?: SlidePayload[];
};

export async function getSliderList(params: { q?: string; page?: number; per_page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();
  return apiFetch<Paginated<Slider>>(`/admin/sliders${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getSlider(id: number): Promise<Slider> {
  const res = await apiFetch<{ data: Slider }>(`/admin/sliders/${id}`, { token: await token() });
  return res.data;
}

export async function createSlider(payload: SliderPayload): Promise<Slider> {
  const res = await apiFetch<{ data: Slider }>("/admin/sliders", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateSlider(id: number, payload: SliderPayload): Promise<Slider> {
  const res = await apiFetch<{ data: Slider }>(`/admin/sliders/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteSlider(id: number): Promise<void> {
  await apiFetch<void>(`/admin/sliders/${id}`, { method: "DELETE", token: await token() });
}


/* ------------------------------------------------------------------ forms */

export type FormFieldPayload = {
  kind: "text" | "email" | "tel" | "number" | "textarea" | "select" | "checkbox";
  name: string;
  label: string;
  placeholder?: string | null;
  help?: string | null;
  required?: boolean;
  width?: "half" | "full";
  options?: { value: string; label: string }[] | null;
};

export type FormPayload = {
  name: string;
  slug?: string;
  status?: string;
  submit_label?: string;
  success_message?: string | null;
  notify_email?: string | null;
  /** Replaced wholesale, like every other repeater here. */
  fields?: FormFieldPayload[];
};

export async function getFormList(params: { q?: string; page?: number; per_page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();
  return apiFetch<Paginated<SiteForm>>(`/admin/forms${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getForm(id: number): Promise<SiteForm> {
  const res = await apiFetch<{ data: SiteForm }>(`/admin/forms/${id}`, { token: await token() });
  return res.data;
}

export async function createForm(payload: FormPayload): Promise<SiteForm> {
  const res = await apiFetch<{ data: SiteForm }>("/admin/forms", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateForm(id: number, payload: FormPayload): Promise<SiteForm> {
  const res = await apiFetch<{ data: SiteForm }>(`/admin/forms/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteForm(id: number): Promise<void> {
  await apiFetch<void>(`/admin/forms/${id}`, { method: "DELETE", token: await token() });
}

export async function getFormSubmissions(id: number, params: { page?: number; per_page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();
  return apiFetch<Paginated<FormSubmission>>(`/admin/forms/${id}/submissions${qs ? `?${qs}` : ""}`, { token: await token() });
}

/* ------------------------------------------------- programmatic pages */

export type LandingPagePayload = {
  kind?: string;
  brand_id?: number | null;
  product_category_id?: number | null;
  solution_id?: number | null;
  service_id?: number | null;
  location_id?: number | null;
  title?: string;
  heading?: string;
  intro?: string | null;
  body?: string | null;
  status?: string;
  seo?: Record<string, unknown>;
};

export async function getLandingPages(
  params: { status?: string; kind?: string; q?: string; page?: number; per_page?: number } = {},
) {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) query.set(k, String(v));
  const qs = query.toString();

  return apiFetch<Paginated<AdminLandingPage> & { meta: { cap: number; published: number; kinds: { value: string; label: string }[] } }>(
    `/admin/landing-pages${qs ? `?${qs}` : ""}`,
    { token: await token() },
  );
}

export async function getLandingPage(id: number): Promise<AdminLandingPage> {
  const res = await apiFetch<{ data: AdminLandingPage }>(`/admin/landing-pages/${id}`, { token: await token() });
  return res.data;
}

export async function getLandingOpportunities(kind?: string) {
  const qs = kind ? `?kind=${kind}` : "";
  return apiFetch<{
    data: LandingOpportunity[];
    meta: { skipped_locations: string[]; min_products: number; cap: number; published: number };
  }>(`/admin/landing-pages/opportunities${qs}`, { token: await token() });
}

export async function createLandingPage(payload: LandingPagePayload): Promise<AdminLandingPage> {
  const res = await apiFetch<{ data: AdminLandingPage }>("/admin/landing-pages", {
    method: "POST", body: payload, token: await token(),
  });
  return res.data;
}

export async function updateLandingPage(id: number, payload: LandingPagePayload): Promise<AdminLandingPage> {
  const res = await apiFetch<{ data: AdminLandingPage }>(`/admin/landing-pages/${id}`, {
    method: "PATCH", body: payload, token: await token(),
  });
  return res.data;
}

export async function deleteLandingPage(id: number): Promise<void> {
  await apiFetch<void>(`/admin/landing-pages/${id}`, { method: "DELETE", token: await token() });
}

/* -------------------------------------------------------------- locations */

export type LocationPayload = {
  name?: string;
  slug?: string;
  parent_id?: number | null;
  level?: string;
  service_ids?: number[];
  solution_ids?: number[];
  office_address?: string | null;
  response_time?: string | null;
  summary?: string | null;
  sort_order?: number;
  is_active?: boolean;
};

export async function getLocations(params: { q?: string; active?: string; level?: string; page?: number; per_page?: number } = {}) {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) query.set(k, String(v));
  const qs = query.toString();
  return apiFetch<Paginated<AdminLocation>>(`/admin/locations${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getLocation(id: number): Promise<AdminLocation> {
  const res = await apiFetch<{ data: AdminLocation }>(`/admin/locations/${id}`, { token: await token() });
  return res.data;
}

export async function createLocation(payload: LocationPayload): Promise<AdminLocation> {
  const res = await apiFetch<{ data: AdminLocation }>("/admin/locations", {
    method: "POST", body: payload, token: await token(),
  });
  return res.data;
}

export async function updateLocation(id: number, payload: LocationPayload): Promise<AdminLocation> {
  const res = await apiFetch<{ data: AdminLocation }>(`/admin/locations/${id}`, {
    method: "PATCH", body: payload, token: await token(),
  });
  return res.data;
}

export async function deleteLocation(id: number): Promise<void> {
  await apiFetch<void>(`/admin/locations/${id}`, { method: "DELETE", token: await token() });
}
