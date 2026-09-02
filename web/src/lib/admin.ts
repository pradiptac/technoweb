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
  Gallery,
  Slider,
  SiteForm,
  FormSubmission,
  MailStatus,
  AdminLandingPage, AdminLocation, LandingOpportunity,
  Menu,
  MenuLocationOption,
  MenuSectionOption,
  MenuTypeOption,
  MenuTarget,
  NewsletterSubscriber,
  NewsletterGroup,
  NewsletterCampaign,
  NewsletterTemplate,
  NewsletterAudience,
  NewsletterHealth,
  NewsletterSuppression,
  NewsletterDashboard,
  NewsletterReport,
  QueueHealth,
  AdminStoreProduct,
  AdminStoreCategory,
  AdminOrder,
  StoreDashboard,
  StoreReport,
  StockReport,
  StockMovement,
  AdminDigitalCode,
  NewsletterImportAnalysis} from "@/types/api";

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

/* ------------------------------------------------------------------ store */

/**
 * The store's own catalogue, which is a different list from the site's.
 *
 * Every amount here is paise. The form converts by parsing the rupee text —
 * `lib/money.ts` — rather than multiplying, because a float multiply is where
 * a price becomes 1179.9999.
 */
export type StoreProductPayload = Record<string, unknown>;

export type StoreProductIndex = Paginated<AdminStoreProduct> & {
  meta: {
    types: { value: string; label: string; description: string }[];
    statuses: { value: string; label: string }[];
  };
};

export type StoreProductQueryParams = {
  status?: string; type?: string; q?: string; category?: string;
  out_of_stock?: boolean; page?: number; per_page?: number;
};

export async function getStoreProductList(params: StoreProductQueryParams = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.type) query.set("type", params.type);
  if (params.q) query.set("q", params.q);
  if (params.category) query.set("category", params.category);
  if (params.out_of_stock) query.set("out_of_stock", "1");
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();

  return apiFetch<StoreProductIndex>(`/admin/store/products${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getStoreProduct(id: number): Promise<AdminStoreProduct> {
  const res = await apiFetch<{ data: AdminStoreProduct }>(`/admin/store/products/${id}`, { token: await token() });
  return res.data;
}

export async function createStoreProduct(payload: StoreProductPayload): Promise<AdminStoreProduct> {
  const res = await apiFetch<{ data: AdminStoreProduct }>("/admin/store/products", {
    method: "POST", body: payload, token: await token(),
  });
  return res.data;
}

export async function updateStoreProduct(id: number, payload: StoreProductPayload): Promise<AdminStoreProduct> {
  const res = await apiFetch<{ data: AdminStoreProduct }>(`/admin/store/products/${id}`, {
    method: "PATCH", body: payload, token: await token(),
  });
  return res.data;
}

export async function deleteStoreProduct(id: number): Promise<void> {
  await apiFetch<void>(`/admin/store/products/${id}`, { method: "DELETE", token: await token() });
}

/* ----------------------------------------------------------------- coupons */

/**
 * A discount code.
 *
 * `value` is paise for a fixed amount and a plain percentage otherwise — the
 * one place in the store where a number means two things. `label` comes from
 * the API so the screen never has to decide which.
 */
export type AdminCoupon = {
  id: number;
  code: string;
  type: "percentage" | "fixed";
  value: number;
  label: string;
  minimum_order_paise?: number | null;
  maximum_discount_paise?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  usage_limit?: number | null;
  per_customer_limit?: number | null;
  is_active: boolean;
  description?: string | null;
  usages_count?: number;
  total_given?: string;
  created_at?: string;
};

export async function getCoupons(params: { q?: string; page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  const qs = query.toString();

  return apiFetch<Paginated<AdminCoupon>>(`/admin/store/coupons${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getCoupon(id: number): Promise<AdminCoupon> {
  const res = await apiFetch<{ data: AdminCoupon }>(`/admin/store/coupons/${id}`, { token: await token() });
  return res.data;
}

export async function createCoupon(payload: Record<string, unknown>): Promise<AdminCoupon> {
  const res = await apiFetch<{ data: AdminCoupon }>("/admin/store/coupons", {
    method: "POST", body: payload, token: await token(),
  });
  return res.data;
}

export async function updateCoupon(id: number, payload: Record<string, unknown>): Promise<AdminCoupon> {
  const res = await apiFetch<{ data: AdminCoupon }>(`/admin/store/coupons/${id}`, {
    method: "PATCH", body: payload, token: await token(),
  });
  return res.data;
}

export async function deleteCoupon(id: number): Promise<void> {
  await apiFetch<void>(`/admin/store/coupons/${id}`, { method: "DELETE", token: await token() });
}

/* ------------------------------------------------------------ store orders */

export type OrderIndex = Paginated<AdminOrder> & {
  meta: {
    statuses: { value: string; label: string }[];
    /** Counted over the whole table, not the page. */
    pending_payment: number;
  };
};

/**
 * Every figure on the store dashboard, in one request.
 *
 * One call rather than the six the screen would otherwise make: these are all
 * facts about the same moment, and six answers arriving over a second and a
 * half are six facts about six moments that the reader will add up anyway.
 */
/** The one call that can make an order paid, and only for an offline method. */
export async function recordStoreOrderPayment(
  orderNumber: string,
  body: { amount_paise: number; reference: string; note?: string; paid_at?: string },
): Promise<AdminOrder> {
  const res = await apiFetch<{ data: AdminOrder }>(
    `/admin/store/orders/${encodeURIComponent(orderNumber)}/payments`,
    { method: "POST", body, token: await token() },
  );
  return res.data;
}

export async function getStoreDashboard(days?: number): Promise<StoreDashboard> {
  const res = await apiFetch<{ data: StoreDashboard }>(
    `/admin/store/dashboard${days ? `?days=${days}` : ""}`, { token: await token() },
  );
  return res.data;
}

/** What sold between two dates. A 422 here is a range too wide, and says so. */
export async function getStoreReport(
  params: { from?: string; to?: string; group?: string } = {},
): Promise<StoreReport> {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.group) query.set("group", params.group);
  const qs = query.toString();

  const res = await apiFetch<{ data: StoreReport }>(
    `/admin/store/reports${qs ? `?${qs}` : ""}`, { token: await token() },
  );
  return res.data;
}

export type StockQueryParams = {
  from?: string; to?: string; product?: number | string;
  reason?: string; direction?: string; page?: number; per_page?: number;
};

/** The filters, built once, so the report, the ledger and the export agree. */
function stockQuery(params: StockQueryParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

/** What came in and what went out. A 422 here is a range too wide, and says so. */
export async function getStockReport(
  params: StockQueryParams = {},
): Promise<{ data: StockReport; meta: { reasons: { value: string; label: string }[]; max_days: number } }> {
  return apiFetch(`/admin/store/stock${stockQuery(params)}`, { token: await token() });
}

/** The movements behind the totals, paged. */
export async function getStockMovements(
  params: StockQueryParams = {},
): Promise<Paginated<StockMovement>> {
  return apiFetch(`/admin/store/stock/movements${stockQuery(params)}`, { token: await token() });
}

export type OrderQueryParams = {
  status?: string; q?: string; open?: boolean; unpaid?: boolean;
  page?: number; per_page?: number;
};

export async function getStoreOrders(params: OrderQueryParams = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.q) query.set("q", params.q);
  if (params.open) query.set("open", "1");
  if (params.unpaid) query.set("unpaid", "1");
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();

  return apiFetch<OrderIndex>(`/admin/store/orders${qs ? `?${qs}` : ""}`, { token: await token() });
}

/** Bound by order number, which never changes — unlike a slug. */
export async function getStoreOrder(orderNumber: string): Promise<AdminOrder> {
  const res = await apiFetch<{ data: AdminOrder }>(
    `/admin/store/orders/${encodeURIComponent(orderNumber)}`, { token: await token() },
  );
  return res.data;
}

export async function moveStoreOrder(orderNumber: string, status: string, note?: string): Promise<AdminOrder> {
  const res = await apiFetch<{ data: AdminOrder }>(
    `/admin/store/orders/${encodeURIComponent(orderNumber)}/status`,
    { method: "POST", body: { status, note }, token: await token() },
  );
  return res.data;
}

export async function saveStoreOrderShipping(
  orderNumber: string, payload: Record<string, unknown>,
): Promise<AdminOrder> {
  const res = await apiFetch<{ data: AdminOrder }>(
    `/admin/store/orders/${encodeURIComponent(orderNumber)}/shipping`,
    { method: "PATCH", body: payload, token: await token() },
  );
  return res.data;
}

export async function addStoreOrderNote(orderNumber: string, body: string): Promise<AdminOrder> {
  const res = await apiFetch<{ data: AdminOrder }>(
    `/admin/store/orders/${encodeURIComponent(orderNumber)}/notes`,
    { method: "POST", body: { body }, token: await token() },
  );
  return res.data;
}

export async function fulfilStoreOrder(orderNumber: string): Promise<{ assigned: number; short: string[] }> {
  const res = await apiFetch<{ meta: { assigned: number; short: string[] } }>(
    `/admin/store/orders/${encodeURIComponent(orderNumber)}/fulfil`,
    { method: "POST", token: await token() },
  );
  return res.meta;
}

/**
 * The invoice, as multipart.
 *
 * `apiUpload`, never `apiFetch`: the second JSON-encodes its body, so a
 * FormData arrives as `{}` and Laravel answers "the file field is required" —
 * which reads as the upload being rejected rather than as never having been
 * sent. Measured once already on this codebase.
 */
export async function saveStoreOrderInvoice(orderNumber: string, form: FormData): Promise<AdminOrder> {
  const res = await apiUpload<{ data: AdminOrder }>(
    `/admin/store/orders/${encodeURIComponent(orderNumber)}/invoice`,
    form,
    { token: await token() },
  );
  return res.data;
}

/* -------------------------------------------------------- digital codes */

export type CodeIndex = {
  data: AdminDigitalCode[];
  meta: {
    current_page: number; last_page: number; per_page: number; total: number;
    statuses: { value: string; label: string }[];
    available: number;
    delivered: number;
  };
};

export async function getDigitalCodes(productId: number, params: { status?: string; page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.page) query.set("page", String(params.page));
  const qs = query.toString();

  return apiFetch<CodeIndex>(
    `/admin/store/products/${productId}/codes${qs ? `?${qs}` : ""}`, { token: await token() },
  );
}

export async function addDigitalCodes(productId: number, codes: string): Promise<{ added: number; duplicates: number }> {
  const res = await apiFetch<{ meta: { added: number; duplicates: number } }>(
    `/admin/store/products/${productId}/codes`,
    { method: "POST", body: { codes }, token: await token() },
  );
  return res.meta;
}

/** Reading one is a recorded act, which is why it is a POST. */
export async function revealDigitalCode(id: number): Promise<{ code: string; reveal_count: number }> {
  const res = await apiFetch<{ data: { code: string; reveal_count: number } }>(
    `/admin/store/codes/${id}/reveal`, { method: "POST", token: await token() },
  );
  return res.data;
}

export async function deleteDigitalCode(id: number): Promise<void> {
  await apiFetch<void>(`/admin/store/codes/${id}`, { method: "DELETE", token: await token() });
}

export async function getStoreCategories(): Promise<AdminStoreCategory[]> {
  const res = await apiFetch<{ data: AdminStoreCategory[] }>("/admin/store/categories", { token: await token() });
  return res.data;
}

export async function getStoreCategory(id: number): Promise<AdminStoreCategory> {
  const res = await apiFetch<{ data: AdminStoreCategory }>(`/admin/store/categories/${id}`, { token: await token() });
  return res.data;
}

export async function createStoreCategory(payload: Record<string, unknown>): Promise<AdminStoreCategory> {
  const res = await apiFetch<{ data: AdminStoreCategory }>("/admin/store/categories", {
    method: "POST", body: payload, token: await token(),
  });
  return res.data;
}

export async function updateStoreCategory(id: number, payload: Record<string, unknown>): Promise<AdminStoreCategory> {
  const res = await apiFetch<{ data: AdminStoreCategory }>(`/admin/store/categories/${id}`, {
    method: "PATCH", body: payload, token: await token(),
  });
  return res.data;
}

export async function deleteStoreCategory(id: number): Promise<void> {
  await apiFetch<void>(`/admin/store/categories/${id}`, { method: "DELETE", token: await token() });
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

/* -------------------------------------------------------- blog categories */

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

/** Every category, for the post form's multi-select. */
export async function getBlogCategoryOptions(): Promise<{ id: number; name: string }[]> {
  const res = await apiFetch<Paginated<AdminBlogCategory>>(
    "/admin/blog-categories?per_page=100",
    { token: await token() },
  );
  return res.data.map((c) => ({ id: c.id, name: c.name }));
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

/**
 * What the payments panel needs, and one thing that is not a setting.
 *
 * `webhook_url` is generated by the API from its own route table, so it cannot
 * drift the way a URL written into a template does — and it resolves against
 * that server's `APP_URL`, so a development machine shows its own address
 * rather than sending somebody to configure production by mistake.
 */
export type PaymentsMeta = {
  gateways: {
    value: string;
    label: string;
    /** Whether the code to drive it exists at all. */
    implemented: boolean;
    /** Whether this server has been given its keys. */
    configured: boolean;
    reason: string | null;
    fields: { key: string; label: string; secret: boolean; hint: string }[];
  }[];
  active: string | null;
  webhook_url: string;
  webhook_events: string[];
};

export type SettingsPayload = { groups: SettingGroups; uploads: UploadLimits; payments: PaymentsMeta };

export async function getSettings(): Promise<SettingsPayload> {
  const res = await apiFetch<{
    data: SettingGroups;
    meta: { uploads: UploadLimits; payments: PaymentsMeta };
  }>("/admin/settings", { token: await token() });

  return { groups: res.data, uploads: res.meta.uploads, payments: res.meta.payments };
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


/* -------------------------------------------------------------- galleries */

/** One tab. `slug` is what an item names it by — see `GalleryItemPayload`. */
export type GalleryGroupPayload = {
  name: string;
  /** Derived from the name server-side when it is left out. */
  slug?: string;
};

export type GalleryItemPayload = {
  media_path: string;
  alt_text?: string | null;
  title?: string | null;
  subtitle?: string | null;
  link_url?: string | null;
  /**
   * The tab, by **slug** rather than id.
   *
   * The console creates a tab and the pictures filed under it in one submit,
   * so at the moment an item has to reference its group there is no id to
   * reference. The API refuses a slug naming a tab that is not in the same
   * payload, rather than quietly ungrouping the picture.
   */
  group?: string | null;
};

/**
 * One transition, as the API describes it.
 *
 * The list is `App\Enums\GalleryTransition`'s and travels on `meta`, never
 * written out here — the rule `schema_type_options` and `meta.locations`
 * follow. The blurb comes with it so the console never writes a sentence of
 * its own about a value it does not own.
 */
export type GalleryTransitionOption = { value: string; label: string; blurb: string };

export type GalleryMeta = { transitions?: GalleryTransitionOption[] };

export type GalleryPayload = {
  name: string;
  slug?: string;
  subtitle?: string | null;
  status?: string;
  transition?: string;
  autoplay?: boolean;
  interval_ms?: number;
  /** Both replaced wholesale — send the complete set, like faqs and slides. */
  groups?: GalleryGroupPayload[];
  items?: GalleryItemPayload[];
};

export async function getGalleryList(params: { q?: string; page?: number; per_page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  const qs = query.toString();
  return apiFetch<Paginated<Gallery> & { meta: GalleryMeta }>(
    `/admin/galleries${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getGallery(id: number): Promise<{ data: Gallery; meta: GalleryMeta }> {
  return apiFetch<{ data: Gallery; meta: GalleryMeta }>(
    `/admin/galleries/${id}`, { token: await token() });
}

export async function createGallery(payload: GalleryPayload): Promise<Gallery> {
  const res = await apiFetch<{ data: Gallery }>("/admin/galleries", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateGallery(id: number, payload: GalleryPayload): Promise<Gallery> {
  const res = await apiFetch<{ data: Gallery }>(`/admin/galleries/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteGallery(id: number): Promise<void> {
  await apiFetch<void>(`/admin/galleries/${id}`, { method: "DELETE", token: await token() });
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

/* ---------------------------------------------------------------- menus -- */

/**
 * The whole tree, in one request each way.
 *
 * The console edits a tree and saves a tree — `items` is nested, and the API
 * reads `parent_id` and `sort_order` off the shape rather than trusting them
 * in the payload. That is also what makes a cycle unrepresentable: a nested
 * array cannot contain one.
 */
export type MenuItemPayload = {
  label: string;
  type: string;
  target_id?: number | null;
  url?: string | null;
  icon?: string | null;
  description?: string | null;
  open_in_new_tab?: boolean;
  is_active?: boolean;
  children?: MenuItemPayload[];
};

export type MenuPayload = {
  name?: string;
  location?: string | null;
  items?: MenuItemPayload[];
};

export type { MenuTarget };

export type MenuIndex = {
  data: Menu[];
  meta: {
    locations: MenuLocationOption[];
    types: MenuTypeOption[];
    sections: MenuSectionOption[];
    max_depth: number;
  };
};

export async function getMenus(): Promise<MenuIndex> {
  return apiFetch<MenuIndex>("/admin/menus", { token: await token() });
}

export async function getMenu(id: number): Promise<Menu> {
  const res = await apiFetch<{ data: Menu }>(`/admin/menus/${id}`, { token: await token() });
  return res.data;
}

export async function createMenu(payload: MenuPayload): Promise<Menu> {
  const res = await apiFetch<{ data: Menu }>("/admin/menus", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateMenu(id: number, payload: MenuPayload): Promise<Menu> {
  const res = await apiFetch<{ data: Menu }>(`/admin/menus/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteMenu(id: number): Promise<void> {
  await apiFetch<void>(`/admin/menus/${id}`, { method: "DELETE", token: await token() });
}

/** Records an item can point at. Searched and capped by the API — a select
 *  holding every product is one nobody can find anything in. */
export async function getMenuTargets(type: string, q?: string): Promise<MenuTarget[]> {
  const params = new URLSearchParams({ type });
  if (q) params.set("q", q);
  const res = await apiFetch<{ data: MenuTarget[] }>(`/admin/menu-targets?${params}`, { token: await token() });
  return res.data;
}

/* ----------------------------------------------------------- newsletter -- */

export async function getNewsletterDashboard(): Promise<NewsletterDashboard> {
  const res = await apiFetch<{ data: NewsletterDashboard }>("/admin/newsletter/dashboard", { token: await token() });
  return res.data;
}

export type SubscriberQuery = {
  q?: string; status?: string; group?: string; suppressed?: string;
  page?: number; per_page?: number;
};

export type SubscriberIndex = Paginated<NewsletterSubscriber> & {
  meta: Paginated<NewsletterSubscriber>["meta"] & {
    statuses: { value: string; label: string }[];
    total_active: number;
    total_suppressed: number;
  };
};

export async function getNewsletterSubscribers(params: SubscriberQuery = {}): Promise<SubscriberIndex> {
  return apiFetch<SubscriberIndex>(`/admin/newsletter/subscribers${query(params)}`, { token: await token() });
}

export async function createNewsletterSubscriber(payload: Record<string, unknown>): Promise<NewsletterSubscriber> {
  const res = await apiFetch<{ data: NewsletterSubscriber }>("/admin/newsletter/subscribers", {
    method: "POST", body: payload, token: await token(),
  });
  return res.data;
}

export async function updateNewsletterSubscriber(id: number, payload: Record<string, unknown>): Promise<NewsletterSubscriber> {
  const res = await apiFetch<{ data: NewsletterSubscriber }>(`/admin/newsletter/subscribers/${id}`, {
    method: "PATCH", body: payload, token: await token(),
  });
  return res.data;
}

export async function deleteNewsletterSubscriber(id: number): Promise<void> {
  await apiFetch<void>(`/admin/newsletter/subscribers/${id}`, { method: "DELETE", token: await token() });
}

export async function unsubscribeSubscriber(id: number, note?: string): Promise<void> {
  await apiFetch<void>(`/admin/newsletter/subscribers/${id}/unsubscribe`, {
    method: "POST", body: { note }, token: await token(),
  });
}

export async function getNewsletterGroups(): Promise<NewsletterGroup[]> {
  const res = await apiFetch<{ data: NewsletterGroup[] }>("/admin/newsletter/groups", { token: await token() });
  return res.data;
}

export async function createNewsletterGroup(payload: Record<string, unknown>): Promise<NewsletterGroup> {
  const res = await apiFetch<{ data: NewsletterGroup }>("/admin/newsletter/groups", {
    method: "POST", body: payload, token: await token(),
  });
  return res.data;
}

export async function updateNewsletterGroup(id: number, payload: Record<string, unknown>): Promise<void> {
  await apiFetch<void>(`/admin/newsletter/groups/${id}`, { method: "PATCH", body: payload, token: await token() });
}

export async function deleteNewsletterGroup(id: number): Promise<void> {
  await apiFetch<void>(`/admin/newsletter/groups/${id}`, { method: "DELETE", token: await token() });
}

export async function getNewsletterTemplates(): Promise<NewsletterTemplate[]> {
  const res = await apiFetch<{ data: NewsletterTemplate[] }>("/admin/newsletter/templates", { token: await token() });
  return res.data;
}

export async function getNewsletterTemplate(id: number): Promise<NewsletterTemplate> {
  const res = await apiFetch<{ data: NewsletterTemplate }>(`/admin/newsletter/templates/${id}`, { token: await token() });
  return res.data;
}

/** Render blocks without saving — what the editor's preview pane calls. */
export async function previewNewsletterBlocks(blocks: unknown[], preheader?: string | null): Promise<string> {
  const res = await apiFetch<{ data: { html: string } }>("/admin/newsletter/templates/preview", {
    method: "POST", body: { blocks, preheader }, token: await token(),
  });
  return res.data.html;
}

export type CampaignIndex = Paginated<NewsletterCampaign> & {
  meta: Paginated<NewsletterCampaign>["meta"] & { statuses: { value: string; label: string }[] };
};

export async function getNewsletterCampaigns(params: { q?: string; status?: string; page?: number; per_page?: number } = {}): Promise<CampaignIndex> {
  return apiFetch<CampaignIndex>(`/admin/newsletter/campaigns${query(params)}`, { token: await token() });
}

/**
 * Whether anything will deliver a send, asked fresh.
 *
 * Not cached and not folded into the campaign: it is a fact about the
 * deployment, and a value read when the page was rendered says the scheduler
 * was alive then rather than now.
 */
export async function getNewsletterQueue(): Promise<QueueHealth> {
  const res = await apiFetch<{ data: QueueHealth }>("/admin/newsletter/queue", { token: await token() });
  return res.data;
}

export async function getNewsletterCampaign(id: number): Promise<NewsletterCampaign> {
  const res = await apiFetch<{ data: NewsletterCampaign }>(`/admin/newsletter/campaigns/${id}`, { token: await token() });
  return res.data;
}

export async function createNewsletterCampaign(payload: Record<string, unknown>): Promise<NewsletterCampaign> {
  const res = await apiFetch<{ data: NewsletterCampaign }>("/admin/newsletter/campaigns", {
    method: "POST", body: payload, token: await token(),
  });
  return res.data;
}

export async function updateNewsletterCampaign(id: number, payload: Record<string, unknown>): Promise<NewsletterCampaign> {
  const res = await apiFetch<{ data: NewsletterCampaign }>(`/admin/newsletter/campaigns/${id}`, {
    method: "PATCH", body: payload, token: await token(),
  });
  return res.data;
}

export async function deleteNewsletterCampaign(id: number): Promise<void> {
  await apiFetch<void>(`/admin/newsletter/campaigns/${id}`, { method: "DELETE", token: await token() });
}

export async function duplicateNewsletterCampaign(id: number): Promise<NewsletterCampaign> {
  const res = await apiFetch<{ data: NewsletterCampaign }>(`/admin/newsletter/campaigns/${id}/duplicate`, {
    method: "POST", token: await token(),
  });
  return res.data;
}

export async function getCampaignAudience(id: number): Promise<NewsletterAudience> {
  const res = await apiFetch<{ data: NewsletterAudience }>(`/admin/newsletter/campaigns/${id}/audience`, { token: await token() });
  return res.data;
}

export async function getCampaignHealth(id: number): Promise<NewsletterHealth> {
  const res = await apiFetch<{ data: NewsletterHealth }>(`/admin/newsletter/campaigns/${id}/health`, { token: await token() });
  return res.data;
}

export async function sendCampaignTest(id: number, email?: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/admin/newsletter/campaigns/${id}/test`, {
    method: "POST", body: { email }, token: await token(),
  });
}

export async function sendCampaign(id: number, scheduledAt?: string | null): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/admin/newsletter/campaigns/${id}/send`, {
    method: "POST", body: { scheduled_at: scheduledAt ?? null }, token: await token(),
  });
}

export async function cancelCampaign(id: number): Promise<void> {
  await apiFetch<void>(`/admin/newsletter/campaigns/${id}/cancel`, { method: "POST", token: await token() });
}

export async function getCampaignReport(id: number): Promise<NewsletterReport> {
  const res = await apiFetch<{ data: NewsletterReport }>(`/admin/newsletter/campaigns/${id}/report`, { token: await token() });
  return res.data;
}

export async function getNewsletterSuppressions(params: { q?: string; reason?: string; page?: number } = {}): Promise<Paginated<NewsletterSuppression>> {
  return apiFetch<Paginated<NewsletterSuppression>>(`/admin/newsletter/suppressions${query(params)}`, { token: await token() });
}

export async function addNewsletterSuppression(email: string, note?: string): Promise<void> {
  await apiFetch<void>("/admin/newsletter/suppressions", {
    method: "POST", body: { email, note }, token: await token(),
  });
}

export async function liftNewsletterSuppression(id: number): Promise<void> {
  await apiFetch<void>(`/admin/newsletter/suppressions/${id}`, { method: "DELETE", token: await token() });
}

/**
 * A query string from a params object, dropping anything empty.
 *
 * Undefined and empty string both mean "not filtered", and sending `?q=` is
 * not the same request as sending nothing — some of these endpoints treat a
 * present-but-blank filter as a filter.
 */
function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }

  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/**
 * `apiUpload`, not `apiFetch`.
 *
 * `apiFetch` JSON-encodes its body, so a FormData handed to it arrives as
 * `{}` and Laravel answers "the file field is required" — which reads as the
 * upload being rejected rather than as never having been sent. Multipart needs
 * fetch to generate the boundary itself.
 */
export async function analyseNewsletterImport(form: FormData): Promise<NewsletterImportAnalysis> {
  const res = await apiUpload<{ data: NewsletterImportAnalysis }>(
    "/admin/newsletter/imports/analyse", form, { token: await token() },
  );
  return res.data;
}

export async function runNewsletterImport(payload: Record<string, unknown>): Promise<Record<string, number>> {
  const res = await apiFetch<{ data: Record<string, number> }>("/admin/newsletter/imports", {
    method: "POST", body: payload, token: await token(),
  });
  return res.data;
}

/** Addresses pasted as text — the third way an audience arrives. */
export async function pasteNewsletterAddresses(
  text: string,
  groupIds: number[] = [],
): Promise<{
  added: number; updated: number; already: number; suppressed: number; invalid: number;
  rejected: { value: string; reason: string | null }[];
}> {
  const res = await apiFetch<{ data: {
    added: number; updated: number; already: number; suppressed: number; invalid: number;
    rejected: { value: string; reason: string | null }[];
  } }>("/admin/newsletter/subscribers/paste", {
    method: "POST", body: { text, group_ids: groupIds }, token: await token(),
  });

  return res.data;
}


/* -------------------------------------------------------------------------
 * Leads
 * ---------------------------------------------------------------------- */

/** One check from the scoring rubric, as it fired for this lead. */
export type LeadScoreReason = {
  key: string;
  label: string;
  weight: number;
  applies: boolean;
  passed: boolean;
  /** Only carried on a failure — a hint beside a passing check is noise. */
  hint: string | null;
};

export type LeadNote = {
  id: number;
  kind: "note" | "status" | "assigned" | "system";
  body: string | null;
  context: Record<string, unknown> | null;
  actor_name: string | null;
  created_at: string | null;
};

export type AdminLead = {
  /**
   * The conversation a chatbot lead came from.
   *
   * The reason a chat lead links rather than copies: the requirement is one
   * sentence typed into a small box, and what was said on the way to it is
   * usually what the call is about. System messages are excluded by the API —
   * the same boundary the visitor's own browser gets.
   */
  conversation?: { role: string; content: string; at: string | null }[];
  id: number;
  channel: "enquiry" | "form";
  form_name: string | null;

  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  subject: string | null;
  message: string | null;

  source_url: string | null;
  source_path: string | null;
  source_title: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;

  status: string;
  status_label: string;
  is_open: boolean;
  assigned_to: number | null;
  assignee_name?: string | null;
  follow_up_at: string | null;
  /*
    Answered by the API rather than worked out in the browser. The list filters
    on it server-side, and two answers to one word is how the newsletter ended
    up reporting 3 delivered on one screen and 4 on another.
  */
  is_overdue: boolean;
  value_paise: number | null;
  contacted_at: string | null;
  closed_at: string | null;

  score: number;
  score_band: "hot" | "warm" | "cold" | "unscored";
  created_at: string | null;

  /* Detail only — see `LeadResource::withDetail()`. */
  /**
   * The statuses this lead may move to, itself first.
   *
   * The console's dropdown is built from this rather than from every status,
   * because a dropdown is a promise: offering six and refusing four with a 422
   * is a form arguing with whoever is filling it in.
   */
  allowed_next?: { value: string; label: string }[];
  score_reasons?: LeadScoreReason[] | null;
  ip_address?: string | null;
  notes?: LeadNote[];
  submission?: { form_slug: string | null; data: Record<string, unknown> | null };
  related?: {
    id: number;
    subject: string | null;
    form_name: string | null;
    status: string;
    status_label: string;
    created_at: string | null;
  }[];
};

export type LeadIndex = Paginated<AdminLead> & {
  meta: {
    statuses: { value: string; label: string; open: boolean }[];
    bands: string[];
    /** Counted over the whole table, never the page. */
    new_count: number;
    overdue_count: number;
    assignees: { id: number; name: string }[];
    top_pages: { path: string; total: number }[];
  };
};

/**
 * The website assistant, from the console.
 *
 * `role:admin` on every one of these — the transcripts hold whatever visitors
 * typed, given by people with no account. Blast radius, the argument
 * `campaign_manager` was split out with.
 */
export type ChatDashboard = {
  from: string;
  to: string;
  conversations: number;
  questions: number;
  unanswered: number;
  /** Null, never zero, when nothing was asked — a rate over nothing is not 0%. */
  unanswered_rate: number | null;
  leads: number;
  lead_rate: number | null;
  rated: number;
  helpful_rate: number | null;
  tokens: number;
  by_intent: { intent: string; total: number }[];
  busiest_pages: { path: string; total: number }[];
  /**
   * Today, not the range: the daily cap is the only thing bounding the bill,
   * and it is about right now. `remaining` is null when there is no cap —
   * zero would read as "none left", the opposite of what the setting means.
   */
  today: {
    replies: number;
    cap: number;
    remaining: number | null;
    reached: boolean;
    tokens: number;
  };
};

export type ChatConversationRow = {
  id: number;
  started_at: string | null;
  last_message_at: string | null;
  questions: number;
  source_path: string | null;
  lead: { id: number; name: string | null; status: string | null } | null;
};

export type ChatConversationDetail = {
  id: number;
  started_at: string | null;
  source_path: string | null;
  source_title: string | null;
  tokens_used: number;
  lead: { id: number; name: string | null; status: string | null } | null;
  messages: {
    id: number;
    role: string;
    content: string;
    intent: string | null;
    grounded: boolean;
    rating: number | null;
    rating_note: string | null;
    at: string | null;
  }[];
};

/** Grouped, because a question forty people asked is one piece of work. */
export type ChatUnanswered = {
  ids: number[];
  question: string;
  asked: number;
  last_asked: string | null;
  conversation_id: number | null;
  resolved: boolean;
};

export async function getChatDashboard(params: { from?: string; to?: string } = {}): Promise<ChatDashboard> {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  const qs = query.toString();

  const res = await apiFetch<{ data: ChatDashboard }>(
    `/admin/chat/dashboard${qs ? `?${qs}` : ""}`, { token: await token() },
  );
  return res.data;
}

export async function getChatConversations(
  params: { q?: string; with_lead?: boolean; unanswered?: boolean; page?: number } = {},
): Promise<Paginated<ChatConversationRow>> {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.with_lead) query.set("with_lead", "1");
  if (params.unanswered) query.set("unanswered", "1");
  if (params.page) query.set("page", String(params.page));
  const qs = query.toString();

  return apiFetch(`/admin/chat/conversations${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getChatConversation(id: number): Promise<ChatConversationDetail> {
  const res = await apiFetch<{ data: ChatConversationDetail }>(
    `/admin/chat/conversations/${id}`, { token: await token() },
  );
  return res.data;
}

export async function getChatUnanswered(params: { all?: boolean } = {}): Promise<ChatUnanswered[]> {
  const res = await apiFetch<{ data: ChatUnanswered[] }>(
    `/admin/chat/unanswered${params.all ? "?all=1" : ""}`, { token: await token() },
  );
  return res.data;
}

export async function resolveChatUnanswered(ids: number[]): Promise<void> {
  await apiFetch("/admin/chat/unanswered/resolve", {
    method: "POST",
    body: { ids },
    token: await token(),
  });
}

export type LeadQueryParams = {
  status?: string; band?: string; channel?: string; q?: string;
  assigned_to?: string; unassigned?: boolean; open?: boolean; overdue?: boolean;
  source_path?: string; sort?: string; page?: number; per_page?: number;
};

/** The query string, built once because the list and its export must agree. */
export function leadQuery(params: LeadQueryParams): string {
  const query = new URLSearchParams();
  for (const key of ["status", "band", "channel", "q", "assigned_to", "source_path", "sort"] as const) {
    if (params[key]) query.set(key, String(params[key]));
  }
  for (const key of ["unassigned", "open", "overdue"] as const) {
    if (params[key]) query.set(key, "1");
  }
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));

  return query.toString();
}

export async function getLeads(params: LeadQueryParams = {}) {
  const qs = leadQuery(params);

  return apiFetch<LeadIndex>(`/admin/leads${qs ? `?${qs}` : ""}`, { token: await token() });
}

export async function getLead(id: number): Promise<AdminLead> {
  const res = await apiFetch<{ data: AdminLead }>(`/admin/leads/${id}`, { token: await token() });

  return res.data;
}

export type LeadUpdate = {
  status?: string;
  assigned_to?: number | null;
  follow_up_at?: string | null;
  value_paise?: number | null;
  note?: string;
};

export async function updateLead(id: number, payload: LeadUpdate): Promise<AdminLead> {
  const res = await apiFetch<{ data: AdminLead }>(`/admin/leads/${id}`, {
    method: "PATCH", body: payload, token: await token(),
  });

  return res.data;
}

export async function addLeadNote(id: number, body: string): Promise<void> {
  await apiFetch(`/admin/leads/${id}/notes`, { method: "POST", body: { body }, token: await token() });
}

export async function deleteLead(id: number): Promise<void> {
  await apiFetch(`/admin/leads/${id}`, { method: "DELETE", token: await token() });
}
