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

/**
 * A JSON-LD graph, built by the API.
 *
 * Deliberately opaque. The frontend renders it and never reads into it — the
 * shape is schema.org's and the authority on it is `App\Support\StructuredData`,
 * so a typed mirror here would be a second definition to keep in step with a
 * vocabulary neither side owns.
 */
export type SchemaGraph = Record<string, unknown>;

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
  /**
   * The types this record may declare itself to be, derived first.
   *
   * Sent by the API rather than listed here, because the console renders the
   * dropdown from it and Laravel validates against it — two hand-written
   * copies of one list of strings is drift nothing checks across the wire.
   * Absent on public responses, which have no dropdown to build.
   */
  schema_type_options?: string[];
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
  /** Published products in this category. Present on the catalogue endpoints. */
  product_count?: number;
  /** Practice areas this category's hardware is deployed in. Detail only. */
  related_solutions?: Solution[];
  seo?: Seo | null;
};

export type Product = {
  /** JSON-LD for this record, on detail responses only. */
  schema?: SchemaGraph;
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
  /** JSON-LD for this record, on detail responses only. */
  schema?: SchemaGraph;
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
  /** JSON-LD for this record, on detail responses only. */
  schema?: SchemaGraph;
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
  /** JSON-LD for this record, on detail responses only. */
  schema?: SchemaGraph;
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
  /** JSON-LD for this record, on detail responses only. */
  schema?: SchemaGraph;
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
  /** JSON-LD for this record, on detail responses only. */
  schema?: SchemaGraph;
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
  /** Whether the mega menu may show it. Not the same as published. */
  show_in_menu?: boolean;
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
  /** Whether the mega menu may show it. Not the same as published. */
  show_in_menu?: boolean;
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
  /** Whether the mega menu may show it. Not the same as published. */
  show_in_menu?: boolean;
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
  /** The canonical, which an editor may have pointed somewhere else. */
  url: string | null;
  /**
   * Where the record lives, as a path — never a canonical override, and
   * deliberately without an origin so it resolves against whatever host the
   * console is being used on.
   */
  public_path: string;
  title: string | null;
  description: string | null;
  focus_keyword: string | null;
  has_override: boolean;
  /** Which fields were typed rather than derived. */
  overridden: string[];
  sitemap_include: boolean;
  /** The subset of failed checks that mean something is *wrong*, not merely improvable. */
  issues: string[];
  score: SeoScore;
};

export type SeoBand = "good" | "fair" | "poor";

/** One thing a record is not doing, and why it is worth doing. */
export type SeoFailedCheck = {
  key: string;
  group: string;
  label: string;
  /** What the check is worth, which is what ranks the fixes when several failed. */
  weight: number;
  hint: string;
};

export type SeoScore = {
  value: number;
  band: SeoBand;
  passed: number;
  /** Checks that *apply* here — an industry has no body, so it is scored out of fewer. */
  checked: number;
  failed: SeoFailedCheck[];
};

export type SeoMeta = {
  total: number;
  current_page: number;
  last_page: number;
  per_page: number;
  /** Across the whole matching set, not the page — it is a headline figure. */
  with_issues: number;
  /** Always the whole site, never the filtered page. */
  site_score: {
    value: number;
    band: SeoBand;
    records: number;
    distribution: { good: number; fair: number; poor: number };
    /** Ranked by what each costs: how many records fail it × what it is worth. */
    top_issues: { key: string; label: string; group: string; weight: number; count: number }[];
    groups: Record<string, string>;
  };
  types: { value: string; label: string }[];
};

/** One way outgoing mail can leave the application. */
export type MailTransportOption = {
  value: string;
  label: string;
  blurb: string;
  /** The settings this transport reads; the form renders exactly these. */
  fields: string[];
  is_oauth: boolean;
  /** False when its composer package is not installed on this server. */
  available: boolean;
  /** What to run to install it. Null when nothing is needed. */
  install: string | null;
};

export type MailStatus = {
  /** Null means nothing was chosen, so .env is still in charge. */
  transport: string | null;
  transports: MailTransportOption[];
  account: string | null;
  connected_at: string | null;
  is_connected: boolean;
  /** Why mail last failed. Set by the code that swallows the failure. */
  error: string | null;
  /**
   * The mail queue.
   *
   * Mail leaves through it now, so a stopped scheduler means every message
   * silently stops — nothing throws, nothing is logged, no `mail_error` is
   * written, and the console looks perfectly healthy. `known: false` when the
   * driver is not `database` and this cannot be inspected.
   */
  queue?: {
    driver: string;
    known: boolean;
    pending?: number;
    failed?: number;
    /** Age of the oldest waiting job. The figure that distinguishes a busy
     *  minute from a broken deployment. */
    oldest_seconds?: number | null;
  };
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

export type CustomerStatus = "pending" | "active" | "rejected" | "suspended";

/**
 * A portal account as staff see it.
 *
 * Distinct from `Customer`, which is what a customer sees of themselves —
 * `status_note` is an internal judgement about somebody and has no business in
 * the shape the portal renders.
 */
export type AdminCustomer = {
  id: number;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  status: CustomerStatus;
  status_label: string;
  status_note: string | null;
  email_verified: boolean;
  email_verified_at: string | null;
  approved_at: string | null;
  approved_by?: string | null;
  ticket_count?: number;
  last_login_at: string | null;
  created_at: string;
};

/**
 * One line of the activity log.
 *
 * `actor` carries the name and address copied at the time, plus whether the
 * account still exists — the screen says "(removed)" rather than linking to a
 * staff record that has been deleted, which is exactly when this log matters.
 */
export type ActivityEntry = {
  id: number;
  action: string;
  actor: { id: number | null; name: string; email: string; exists: boolean };
  subject: { type: string; id: number; label: string | null } | null;
  context: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
};

/* ------------------------------------------------------------------ careers */

export type EmploymentType = "full_time" | "part_time" | "contract" | "internship" | "temporary";

export type ApplicationStatus =
  | "new" | "shortlisted" | "interviewing" | "offered" | "hired" | "rejected";

/** A vacancy as the public careers pages see it. */
export type JobOpening = {
  id: number;
  title: string;
  slug: string;
  department: string | null;
  location: string | null;
  employment_type: EmploymentType;
  employment_type_label: string;
  /** The value schema.org wants, so the JSON-LD does not have to re-map it. */
  employment_type_schema: string;
  openings: number;
  summary: string | null;
  description?: string | null;
  responsibilities: string[];
  requirements: string[];
  experience?: { name: string; range: string; min_years: number; max_years: number | null } | null;
  qualifications?: string[];
  /** Absent entirely when the range was left blank — see the note in the API. */
  salary: { min: number | null; max: number | null; period: string; currency: string; label: string } | null;
  published_at: string | null;
  closes_at: string | null;
  seo?: Seo | null;
};

export type AdminJobOpening = {
  id: number;
  title: string;
  slug: string;
  department: string | null;
  location: string | null;
  employment_type: EmploymentType;
  employment_type_label: string;
  openings: number;
  job_experience_level_id: number | null;
  experience_level?: string | null;
  qualification_ids?: number[];
  salary_min: number | null;
  salary_max: number | null;
  salary_period: string;
  salary_currency: string;
  summary: string | null;
  description: string | null;
  responsibilities: string[];
  requirements: string[];
  status: PublishStatus;
  published_at: string | null;
  closes_at: string | null;
  sort_order: number;
  /** Whether the public site is showing it, which `status` alone cannot say. */
  is_open: boolean;
  application_count?: number;
  seo?: SeoOverride | null;
  seo_defaults?: Seo;
  created_at: string;
};

export type AdminJobApplication = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  current_company: string | null;
  experience_years: number | null;
  cover_letter: string | null;
  portfolio_url: string | null;
  job: { id: number | null; title: string; slug?: string | null; exists: boolean };
  /** Metadata only. The file itself comes from the download route. */
  cv: { filename: string | null; mime: string | null; size: number | null } | null;
  status: ApplicationStatus;
  status_label: string;
  status_note: string | null;
  reviewed_by?: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type JobQualificationRow = { id: number; name: string; sort_order: number; job_count: number };

export type JobExperienceLevelRow = {
  id: number; name: string; range: string;
  min_years: number; max_years: number | null; sort_order: number; job_count: number;
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
  /** schema.org availability, or null when nobody has said. */
  availability?: string | null;
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
  /** Whether the mega menu may show it. Not the same as published. */
  show_in_menu?: boolean;
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
  /** Announced in place of the image. Short, factual, public. */
  alt_text: string | null;
  /** A working note for whoever files assets. Never rendered publicly. */
  description: string | null;
  /** Free labels, normalised lowercase by the API. Always present. */
  tags: string[];
  folder_id: number | null;
  /** False for the documents the Files tab holds. */
  is_image: boolean;
  download_url: string;
  /**
   * Only present when the API loaded the uploader relation, which the index
   * and the update response both do. Optional rather than nullable because
   * "the field was not sent" and "the account has gone" are different facts.
   */
  uploaded_by?: string | null;
  created_at: string;
  /** Moves when a file is cropped, resized, rotated or renamed. */
  updated_at: string;
};

export type MediaFolder = {
  id: number;
  name: string;
  media_count: number;
};

/**
 * The thumbnail sizes the resize dialog offers.
 *
 * The same three the API accepts — it 422s anything else — so
 * `THUMBNAIL_SIZES` below is the whitelist both sides agree on, and the resize
 * action filters against it rather than posting a value that can only bounce.
 */
export type ThumbnailSize = 90 | 120 | 180;

export const THUMBNAIL_SIZES: readonly ThumbnailSize[] = [90, 120, 180];

export const isThumbnailSize = (n: number): n is ThumbnailSize =>
  (THUMBNAIL_SIZES as readonly number[]).includes(n);

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

/** A slide in a carousel. `kind` decides which element renders. */
export type Slide = {
  id: number;
  kind: "image" | "video" | "youtube";
  url: string | null;
  poster_url: string | null;
  /** Video id only — the embed URL is built from it, never stored. */
  youtube_id: string | null;
  alt: string | null;
  heading: string | null;
  caption: string | null;
  link_url: string | null;
  link_label: string | null;
};

export type Slider = {
  id: number;
  name: string;
  slug: string;
  status?: string;
  autoplay: boolean;
  interval_ms: number;
  slides?: Slide[];
  slides_count?: number;
};

/**
 * A menu item, as the console edits it.
 *
 * `resolved_url` is where the item currently points, worked out by the API
 * from the record rather than stored — and **null is the interesting value**:
 * it means the record was deleted or lost its slug, so the public site drops
 * the item. The console shows that, because otherwise a broken entry looks
 * exactly like a working one until somebody notices the header is short.
 */
export type MenuItemNode = {
  id: number;
  parent_id: number | null;
  sort_order: number;
  label: string;
  type: string;
  type_label: string;
  target_type: string | null;
  target_id: number | null;
  url: string | null;
  icon: string | null;
  description: string | null;
  open_in_new_tab: boolean;
  is_active: boolean;
  resolved_url: string | null;
  children?: MenuItemNode[];
};

export type Menu = {
  id: number;
  name: string;
  location: string | null;
  location_label: string | null;
  item_count?: number;
  items?: MenuItemNode[];
  updated_at?: string | null;
};

/**
 * One node of a rendered menu, as the public endpoint sends it.
 *
 * `href` is already resolved from the record it points at, so the frontend
 * never composes a URL from a slug — which is what keeps the navigation
 * correct when somebody renames a solution on a different screen.
 */
export type NavNode = {
  label: string;
  href: string;
  icon: string | null;
  summary: string | null;
  new_tab: boolean;
  children: NavNode[];
};

export type MenuLocationOption = { value: string; label: string; hint: string; depth: number };
export type MenuTypeOption = { value: string; label: string; needs_record: boolean };
export type MenuTarget = { id: number; label: string; url: string | null };

/** A field in an editor-built form. `kind` decides which control renders. */
export type FormField = {
  id: number;
  kind: "text" | "email" | "tel" | "number" | "textarea" | "select" | "checkbox";
  name: string;
  label: string;
  placeholder: string | null;
  help: string | null;
  required: boolean;
  options: { value: string; label: string }[];
  width: "half" | "full";
};

export type SiteForm = {
  id: number;
  name: string;
  slug: string;
  status?: string;
  submit_label: string;
  success_message: string | null;
  /** Admin responses only — never on the public endpoint. */
  notify_email?: string | null;
  fields?: FormField[];
  fields_count?: number;
  submissions_count?: number;
};

export type FormSubmission = {
  id: number;
  form_slug: string;
  data: Record<string, string | boolean | null>;
  ip_address: string | null;
  read_at: string | null;
  created_at: string;
};

/* ---------------------------------------------------- programmatic pages */

export type LandingPageKind =
  | "brand" | "brand_category" | "brand_solution"
  | "location" | "service_location" | "solution_location";

export type LocationLevel = "country" | "state" | "city" | "area";

export type LocationSummary = {
  name: string;
  slug: string;
  level: LocationLevel;
  country: string | null;
  /** "Salt Lake, Kolkata, West Bengal", assembled by the API from the tree. */
  full_name: string;
  office_address: string | null;
  response_time: string | null;
  summary: string | null;
  /** Nearest first, so a breadcrumb reads outward without reversing it. */
  ancestors?: { name: string; slug: string; level: LocationLevel }[];
  children?: { name: string; slug: string; level: LocationLevel }[];
  services?: { title: string; slug: string }[];
  solutions?: { title: string; slug: string }[];
};

/**
 * One row of the published index, used by /brands, /locations and the sitemap.
 *
 * Deliberately not the whole page: three screens want a list of links and none
 * of them wants the body, which on a landing page is the largest column there
 * is.
 */
export type LandingPageSummary = {
  path: string;
  kind: LandingPageKind;
  title: string;
  heading: string;
  brand: { name: string; slug: string } | null;
  location: { name: string; slug: string; state: string | null } | null;
  updated_at: string | null;
};

export type LandingPage = {
  /** JSON-LD for this page, built by the API. */
  schema?: SchemaGraph;
  path: string;
  kind: LandingPageKind;
  title: string;
  heading: string;
  intro: string | null;
  body: string | null;
  brand?: Brand | null;
  category?: ProductCategory | null;
  solution?: Solution | null;
  service?: Service | null;
  location?: LocationSummary | null;
  /** The hardware the page is about. What makes it worth reading. */
  products?: Product[];
  faqs?: Faq[];
  seo?: Seo;
  updated_at: string | null;
};

/* --------------------------------------------- programmatic pages: admin */

export type LandingGateCheck = {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
  meta?: Record<string, unknown>;
};

export type AdminLandingPage = {
  id: number;
  kind: LandingPageKind;
  kind_label: string;
  path: string;
  title: string;
  heading: string;
  intro: string | null;
  body: string | null;
  status: "draft" | "published" | "archived";
  auto_generated: boolean;
  evidence: Record<string, string | number> | null;
  brand_id: number | null;
  product_category_id: number | null;
  solution_id: number | null;
  service_id: number | null;
  location_id: number | null;
  brand?: { id: number; name: string } | null;
  category?: { id: number; name: string } | null;
  solution?: { id: number; name: string } | null;
  service?: { id: number; name: string } | null;
  location?: { id: number; name: string } | null;
  /** Whether it may go live, and what is stopping it if not. */
  publishable: boolean;
  failures: { key: string; label: string; detail: string }[];
  checks: LandingGateCheck[];
  seo: SeoOverride;
  seo_defaults: Seo;
  faqs?: Faq[];
  public_path: string;
  published_at: string | null;
  updated_at: string | null;
};

export type LandingOpportunity = {
  kind: LandingPageKind;
  key: string;
  title: string;
  heading: string;
  path: string;
  brand_id?: number;
  product_category_id?: number;
  solution_id?: number;
  service_id?: number;
  location_id?: number;
  evidence: Record<string, string | number>;
};

export type AdminLocation = {
  id: number;
  parent_id: number | null;
  parent?: { id: number; name: string } | null;
  name: string;
  slug: string;
  level: LocationLevel;
  level_label: string;
  full_name: string;
  country: string | null;
  service_ids?: number[];
  solution_ids?: number[];
  children_count?: number;
  office_address: string | null;
  response_time: string | null;
  summary: string | null;
  sort_order: number;
  is_active: boolean;
  has_local_substance: boolean;
  landing_page_count?: number;
  created_at: string | null;
};
