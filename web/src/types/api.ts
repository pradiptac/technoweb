/* ------------------------------------------------------------------
   Shapes returned by the Laravel API (api.example.com/api/v1).
   Keep in sync with app/Http/Resources on the backend.
   ------------------------------------------------------------------ */

/** A Laravel resource collection with no paginator attached. */
export type Collection<T> = { data: T[] };

/** A single resource. */
export type Single<T> = { data: T };

export type Paginated<T> = {
  data: T[];
  meta: { current_page: number; last_page: number; per_page: number; total: number };
  links: { first: string | null; last: string | null; prev: string | null; next: string | null };
};

export type Seo = {
  title: string | null;
  description: string | null;
  canonical_url: string | null;
  robots: string | null;
  focus_keyword: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  schema_type: string | null;
  sitemap_include: boolean;
};

export type Brand = { id: number; name: string; slug: string; logo: string | null };

export type ProductCategory = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  parent_id: number | null;
  children?: ProductCategory[];
  seo?: Seo | null;
};

export type Product = {
  id: number;
  name: string;
  slug: string;
  sku: string | null;
  short_description: string | null;
  description: string | null;
  specifications: Record<string, string> | null;
  features: string[] | null;
  images: string[];
  /** Parallel to `images`, index for index. */
  image_alts?: (string | null)[];
  datasheet_url: string | null;
  status: "draft" | "published" | "archived";
  brand: Brand | null;
  category: ProductCategory | null;
  related_products?: Product[];
  related_solutions?: Solution[];
  faqs?: Faq[];
  seo?: Seo | null;
};

export type Solution = {
  id: number;
  title: string;
  slug: string;
  summary: string | null;
  icon: string | null;
  hero_image: string | null;
  hero_image_alt?: string | null;
  status: "draft" | "published";
  /* Detail-only — the index endpoint omits these to keep payloads small. */
  problem_statement?: string | null;
  overview?: string | null;
  benefits?: string[] | null;
  technologies?: string[] | null;
  products?: Product[];
  industries?: Industry[];
  faqs?: Faq[];
  seo?: Seo | null;
};

export type Service = {
  id: number;
  title: string;
  slug: string;
  summary: string | null;
  icon: string | null;
  body?: string | null;
  faqs?: Faq[];
  seo?: Seo | null;
};

export type Faq = { id: number; question: string; answer: string };

export type Industry = {
  id: number;
  name: string;
  slug: string;
  summary: string | null;
  icon: string | null;
  body?: string | null;
  solutions?: Solution[];
  seo?: Seo | null;
};

export type CaseStudy = {
  id: number;
  title: string;
  slug: string;
  client_name: string | null;
  summary: string | null;
  body?: string | null;
  results: { value: string; label: string }[] | null;
  cover_image: string | null;
  cover_image_alt?: string | null;
  industry?: Industry | null;
  seo?: Seo | null;
};

export type KnowledgeArticle = {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  body?: string | null;
  tags: string[] | null;
  category?: { name: string; slug: string } | null;
  published_at: string | null;
  seo?: Seo | null;
};

export type BlogPost = {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  /** Detail-only — the index endpoint omits the body. */
  body?: string | null;
  cover_image: string | null;
  cover_image_alt?: string | null;
  published_at: string | null;
  reading_minutes: number | null;
  author?: { name: string } | null;
  seo?: Seo | null;
};

export type TicketStatus =
  | "open" | "assigned" | "in_progress" | "pending_customer" | "resolved" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "critical";

export type TicketMessage = {
  id: number;
  body: string;
  is_internal: boolean;
  author: { id: number; name: string; type: "customer" | "staff" };
  /** Present only when the relation was eager-loaded by the API. */
  attachments?: TicketAttachment[];
  created_at: string;
};

export type TicketAttachment = {
  id: number; filename: string; url: string; size: number; mime: string;
};

export type Ticket = {
  id: number;
  reference: string;
  subject: string;
  /** Only present on the detail endpoint — list responses omit the body. */
  description?: string;
  status: TicketStatus;
  status_label: string;
  /** Legal next statuses for this ticket, straight from TicketStatus::canTransitionTo(). */
  allowed_transitions: { value: TicketStatus; label: string }[];
  priority: TicketPriority;
  priority_label: string;
  is_overdue: boolean;
  due_at: string | null;
  category: { id: number; name: string } | null;
  assigned_to: { id: number; name: string } | null;
  customer?: Customer;
  messages?: TicketMessage[];
  attachments?: TicketAttachment[];
  created_at: string;
  updated_at: string;
};

export type Customer = {
  id: number;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
};

export type AuthResponse = { token: string; customer: Customer };

export type TicketSummary = {
  open: number;
  in_progress: number;
  pending: number;
  resolved: number;
  closed: number;
};

export type TicketCategory = { id: number; name: string };

export type StaffUser = {
  id: number;
  name: string;
  email: string;
  roles: { slug: string; label: string }[];
  is_active: boolean;
};

export type AdminAuthResponse = { token: string; staff: StaffUser };

export type CmsPage = {
  id: number;
  title: string;
  slug: string;
  body: string | null;
  template: string;
  published_at: string | null;
  updated_at: string;
  faqs?: Faq[];
  seo?: Seo | null;
};

/** What `GET /pages` returns: the same row minus its body. */
export type CmsPageSummary = {
  id: number;
  title: string;
  slug: string;
  updated_at: string;
  seo?: Seo | null;
};

export type SearchHit = {
  title: string;
  excerpt: string | null;
  path: string;
};

export type SearchGroup = {
  type: string;
  label: string;
  /** Every match, not the number shown — the page says "5 of 23". */
  total: number;
  results: SearchHit[];
};

export type SearchResults = {
  data: { groups: SearchGroup[]; total: number };
  meta: { q: string; min_length: number };
};

export type PublishStatus = "draft" | "published" | "archived";

/** The raw override row — every field null means "derive it". */
export type SeoOverride = {
  title: string | null;
  description: string | null;
  canonical_url: string | null;
  robots: string | null;
  focus_keyword: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_path: string | null;
  schema_type: string | null;
  sitemap_include: boolean;
};

/**
 * Blog post as the CMS sees it — distinct from the public `BlogPost`, which
 * omits status, author_id and the raw SEO overrides the edit form must
 * round-trip. `seo` is what was typed; `seo_defaults` is what the site falls
 * back to, shown as placeholders.
 */
export type AdminBlogPost = {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  /** Detail-only — list responses omit it. */
  body?: string | null;
  status: PublishStatus;
  status_label: string;
  published_at: string | null;
  reading_minutes: number | null;
  cover_image_path: string | null;
  cover_image: string | null;
  author_id: number | null;
  author?: { id: number; name: string } | null;
  seo?: SeoOverride;
  seo_defaults?: Seo;
  created_at: string;
  updated_at: string;
};

export type AdminKnowledgeArticle = {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  /** Detail-only — list responses omit it. */
  body?: string | null;
  tags: string[];
  status: PublishStatus;
  status_label: string;
  published_at: string | null;
  knowledge_category_id: number | null;
  category?: { id: number; name: string } | null;
  /** Read-only telemetry the site writes; never editable. */
  view_count: number;
  helpful_count: number;
  seo?: SeoOverride;
  seo_defaults?: Seo;
  created_at: string;
  updated_at: string;
};

export type KnowledgeCategory = { id: number; name: string; slug: string };

/** A headline stat on a case study: the figure and what it measures. */
export type CaseStudyResult = { value: string; label: string };

export type AdminCaseStudy = {
  id: number;
  title: string;
  slug: string;
  client_name: string | null;
  summary: string | null;
  /** Detail-only — list responses omit it. */
  body?: string | null;
  results: CaseStudyResult[];
  status: PublishStatus;
  status_label: string;
  cover_image_path: string | null;
  cover_image: string | null;
  industry_id: number | null;
  industry?: { id: number; name: string } | null;
  seo?: SeoOverride;
  seo_defaults?: Seo;
  created_at: string;
  updated_at: string;
};

export type AdminPage = {
  id: number;
  title: string;
  slug: string;
  /** Detail-only — list responses omit it. */
  body?: string | null;
  template: string;
  status: PublishStatus;
  status_label: string;
  published_at: string | null;
  seo?: SeoOverride;
  seo_defaults?: Seo;
  created_at: string;
  updated_at: string;
};

/**
 * Brands have no status and no SEO: they are a filter facet on the product
 * listing, not a page of their own.
 */
export type AdminBrand = {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  logo_path?: string | null;
  logo?: string | null;
  sort_order?: number;
  is_featured?: boolean;
  product_count?: number;
};

/** Categories are taxonomy — a tree, and no publish status. */
export type AdminProductCategory = {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  parent_id?: number | null;
  parent_name?: string | null;
  sort_order?: number;
  product_count?: number;
  child_count?: number;
  seo?: SeoOverride;
  seo_defaults?: Seo;
};

export type AdminIndustry = {
  id: number;
  /** `name`, not `title` — this model's slug derives from name. */
  name: string;
  slug: string;
  summary?: string | null;
  /** Detail-only. */
  body?: string | null;
  icon?: string | null;
  sort_order?: number;
  solution_ids?: number[];
  case_study_count?: number;
  seo?: SeoOverride;
  seo_defaults?: Seo;
};

export type AdminService = {
  id: number;
  title: string;
  slug: string;
  summary: string | null;
  /** Detail-only. */
  body?: string | null;
  icon: string | null;
  status: PublishStatus;
  status_label: string;
  sort_order: number;
  faqs?: FaqItem[];
  seo?: SeoOverride;
  seo_defaults?: Seo;
  created_at: string;
  updated_at: string;
};

/** A FAQ as the cross-entity manager sees it, with its owner resolved. */
export type AdminFaq = {
  id: number;
  question: string;
  answer: string;
  sort_order: number;
  /** Morph key — "solution", not a class name. */
  owner_type: string | null;
  owner_id: number | null;
  owner_name?: string | null;
  /** True when the owning record has gone. Should never happen; surfaced so it can be cleared. */
  owner_missing?: boolean;
  updated_at?: string;
};

export type FaqOwnerGroup = {
  type: string;
  label: string;
  options: { id: number; name: string }[];
};

export type AdminRedirect = {
  id: number;
  from_path: string;
  to_path: string;
  status_code: number;
  is_active: boolean;
  /** Written by a slug change rather than by a person. */
  created_automatically: boolean;
  hit_count: number;
  last_hit_at: string | null;
  created_at?: string;
};

/** One indexable record in the SEO overview. */
export type SeoRow = {
  type: string;
  type_label: string;
  id: number;
  name: string;
  slug: string;
  admin_path: string;
  url: string | null;
  title: string | null;
  description: string | null;
  has_override: boolean;
  /** Which fields were typed rather than derived. */
  overridden: string[];
  sitemap_include: boolean;
  issues: string[];
};

export type SeoMeta = {
  total: number;
  current_page: number;
  last_page: number;
  per_page: number;
  /** Across the whole matching set, not the page — it is a headline figure. */
  with_issues: number;
  types: { value: string; label: string }[];
};

export type RoleOption = { slug: string; label: string; description: string };

export type AdminStaff = {
  id: number;
  name: string;
  email: string;
  is_active: boolean;
  roles?: { slug: string; label: string }[];
  role_slugs?: string[];
  created_at?: string;
  /** Returned once, by create only, and never readable again. */
  generated_password?: string | null;
};

/** What a relation picker needs: an id and something to show for it. */
export type PickerOption = { id: number; name: string };

/**
 * The largest CMS entity. `specifications` is a label→value map rather than a
 * list of rows because that is the shape the public product page reads and
 * the seeder writes; the editor converts to and from ordered rows.
 *
 * `images` holds storable paths and `image_urls` the resolved previews — the
 * form submits the former and renders the latter.
 */
export type AdminProduct = {
  id: number;
  name: string;
  slug: string;
  sku?: string | null;
  short_description?: string | null;
  /** Detail-only, rich text. */
  description?: string | null;
  brand_id?: number | null;
  brand_name?: string | null;
  product_category_id?: number | null;
  category_name?: string | null;
  specifications?: Record<string, string>;
  features?: string[];
  images?: string[];
  image_urls?: string[];
  datasheet_path?: string | null;
  status: PublishStatus;
  status_label?: string;
  is_featured?: boolean;
  sort_order?: number;
  solution_ids?: number[];
  related_product_ids?: number[];
  faqs?: FaqItem[];
  seo?: SeoOverride;
  seo_defaults?: Seo;
};

/** A FAQ as the CMS edits it. The API replaces the set wholesale, so no id. */
export type FaqItem = { question: string; answer: string };

export type AdminSolution = {
  id: number;
  title: string;
  slug: string;
  summary: string | null;
  /** Detail-only — list responses omit these two. */
  problem_statement?: string | null;
  overview?: string | null;
  benefits: string[];
  technologies: string[];
  icon: string | null;
  hero_image_path: string | null;
  hero_image: string | null;
  status: PublishStatus;
  status_label: string;
  sort_order: number;
  /** Present only when the relation was eager-loaded — i.e. on detail. */
  product_ids?: number[];
  industry_ids?: number[];
  faqs?: FaqItem[];
  seo?: SeoOverride;
  seo_defaults?: Seo;
  created_at: string;
  updated_at: string;
};

export type MediaItem = {
  id: number;
  filename: string;
  /** Store this on the owning record; `url` is for display only. */
  path: string;
  url: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  folder_id: number | null;
  /** False for the documents the Files tab holds. */
  is_image: boolean;
  download_url: string;
  created_at: string;
};

export type MediaFolder = {
  id: number;
  name: string;
  media_count: number;
};

/** The thumbnail sizes the resize dialog offers. */
export type ThumbnailSize = 90 | 120 | 180;

export type AdminDashboard = {
  counts: {
    open_tickets: number;
    overdue_tickets: number;
    customers: number;
    products: number;
    blog_posts: number;
    new_enquiries: number;
  };
  recent_tickets: Ticket[];
  high_priority: Ticket[];
  status_breakdown: Record<string, number>;
  metrics: DashboardMetrics;
};

export type DashboardMetrics = {
  window_days: number;
  /** One entry per day in the window, oldest first, gaps filled with zeroes. */
  volume: { date: string; created: number; resolved: number }[];
  /** `change` is null when the previous window was empty — see TicketMetrics. */
  volume_trend: { current: number; previous: number; change: number | null };
  /** Medians, not means, and null when nothing has been measured yet. */
  first_response_hours: number | null;
  resolution_hours: number | null;
  /** `of` is how many tickets the percentage was taken from. */
  sla_first_response: { pct: number | null; of: number };
  open_by_priority: { label: string; total: number }[];
  open_by_category: { label: string; total: number }[];
};
