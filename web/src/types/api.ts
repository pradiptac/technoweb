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

/* ------------------------------------------------------------------ store */

/**
 * What the store sells, as the console edits it.
 *
 * A different type from `AdminProduct` because it is a different table: what
 * the store sells is maintained separately from what the site advertises. The
 * fields that look the same are the ones a catalogue row and a shop line
 * genuinely share, not an argument for one record.
 *
 * **Every amount is paise, as an integer.** The form draws rupees and converts
 * by parsing the text — see `lib/money.ts`. A decimal on the wire is where a
 * price becomes 1179.9999.
 */
export type AdminStoreProduct = {
  id: number;
  name: string;
  slug: string;
  sku?: string | null;
  type: StoreProductType;
  type_label?: string;
  short_description?: string | null;
  /** Detail-only, rich text. */
  description?: string | null;
  store_category_id?: number | null;
  category_name?: string | null;
  brand_id?: number | null;
  brand_name?: string | null;
  price_paise: number;
  compare_at_paise?: number | null;
  track_stock: boolean;
  stock: number;
  in_stock: boolean;
  returnable: boolean;
  status: PublishStatus;
  status_label?: string;
  is_featured?: boolean;
  sort_order?: number;
  specifications?: Record<string, string>;
  features?: string[];
  images?: string[];
  image_urls?: string[];
  variations?: AdminProductVariation[];
  seo?: SeoOverride;
  seo_defaults?: Seo;
  created_at?: string;
  updated_at?: string;
  /** Detail only. Sent with an activation code; blank falls back to the store default. */
  activation_procedure?: string | null;
  activation_pdf_path?: string | null;
  /** Resolved from the media row — the stored filename is a hash. */
  activation_pdf_name?: string | null;
};

/** Physical ships, digital issues a code, service is work somebody does. */
export type StoreProductType = "physical" | "digital" | "service";

/**
 * One buyable configuration, as the console edits it.
 *
 * `id` is present on a stored row and absent on a new one, and it matters: the
 * API updates a row that carries one rather than deleting and recreating it,
 * because an order item records the variation it was bought as.
 *
 * A null `price_paise` means the product's price — not zero, and not a copy of
 * the parent's number that would then have to be changed twice.
 */
export type AdminProductVariation = {
  id?: number;
  name: string;
  sku?: string | null;
  /** Ordered pairs, kept in the order the selectors are meant to appear. */
  options?: Record<string, string>;
  price_paise?: number | null;
  stock: number;
  weight_grams?: number | null;
  image_path?: string | null;
  is_active: boolean;
};

export type AdminStoreCategory = {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  image_path?: string | null;
  image_url?: string | null;
  is_active: boolean;
  sort_order: number;
  product_count?: number;
  created_at?: string;
};

/** What the storefront reads. No stock count — see the API resource. */
export type StoreProduct = {
  id: number;
  name: string;
  slug: string;
  sku?: string | null;
  type: StoreProductType;
  short_description?: string | null;
  description?: string | null;
  specifications?: Record<string, string>;
  features?: string[];
  images: string[];
  image_alts: (string | null)[];
  price_paise: number;
  /** Only present when it is genuinely higher than the real price. */
  compare_at_paise?: number;
  in_stock: boolean;
  returnable: boolean;
  is_featured?: boolean;
  category?: StoreCategory | null;
  brand?: Brand | null;
  variations?: StoreVariation[];
  seo?: Seo;
};

export type StoreVariation = {
  id: number;
  name: string;
  sku?: string | null;
  options?: Record<string, string>;
  /** Already resolved: this variation's price, or the product's. */
  price_paise: number;
  in_stock: boolean;
  image_url?: string | null;
  image_alt?: string | null;
};

/**
 * The basket, as the server works it out.
 *
 * **Every figure here is computed by the API on every read.** Nothing about
 * money is stored on a cart line, so a price change reaches a basket that is
 * already full — which is the honest behaviour, and is what not storing a price
 * means rather than a feature that had to be built.
 */
export type CartSummary = {
  token: string;
  items: CartLine[];
  /** Quantities summed — what a cart badge means by "3 items". */
  item_count: number;
  subtotal_paise: number;
  discount_paise: number;
  /** The code as stored — never an amount, which would go stale. */
  coupon_code?: string | null;
  /** "10% off" or "₹500 off", worded by the API so two places cannot disagree. */
  coupon_label?: string | null;
  total_paise: number;
  taxable_paise: number;
  /** Extracted from the total, never added to it. */
  gst_paise: number;
  gst_rate: string;
  /** Whether anything in here needs an address and a courier. */
  has_shippable: boolean;
  /** Sentences to show the shopper: out of stock, price gone, and so on. */
  problems: string[];
};

/**
 * An order, as the person who placed it may see it.
 *
 * The access token is deliberately absent: it is returned once, on the response
 * that created the order, and is held server-side from then on. Echoing it in
 * every read would put the key to this page into a browser history and a
 * referrer header.
 */
export type Order = {
  order_number: string;
  status: OrderStatus;
  status_label: string;
  subtotal_paise: number;
  discount_paise: number;
  taxable_paise: number;
  gst_paise: number;
  total_paise: number;
  coupon_code?: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone?: string | null;
  billing_address?: PostalAddress | null;
  /** Null when nothing in the order travels. */
  shipping_address?: PostalAddress | null;
  gst_required: boolean;
  gstin?: string | null;
  company_name?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  has_invoice: boolean;
  courier?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  placed_at?: string | null;
  paid_at?: string | null;
  dispatched_at?: string | null;
  completed_at?: string | null;
  items?: OrderLine[];
  payments?: { status: string; status_label: string; method?: string | null; paid_at?: string | null }[];
};

export type OrderStatus =
  | "pending_payment" | "paid" | "processing" | "ready_for_dispatch"
  | "dispatched" | "completed" | "cancelled" | "refund_requested" | "refunded";

/** One line of what was sold — a snapshot, so nothing here joins to a product. */
export type OrderLine = {
  id: number;
  name: string;
  variation_name?: string | null;
  sku?: string | null;
  options?: Record<string, string> | null;
  type: StoreProductType;
  quantity: number;
  unit_price_paise: number;
  line_total_paise: number;
  returnable: boolean;
  slug?: string | null;
  /**
   * Whether a code has been issued for this line — never the code itself.
   * Revealing one is a recorded POST; a page anybody with the link may leave
   * open on a shared screen must not print a licence key.
   */
  has_codes: boolean;
};

/**
 * An order as the people who fulfil it see it.
 *
 * Everything the customer's own view carries, plus the three things it
 * withholds: the payment attempts in full, the status trail and the internal
 * notes. `access_token` is in neither — staff reach an order through the
 * console, and a live magic link in an admin listing is a link that gets pasted
 * into a chat window.
 */
/**
 * The shop at a glance.
 *
 * Every nullable field here is null *because nothing has been measured*, never
 * because a value failed to load — `average_paise` is null for a shop that has
 * sold nothing, and rendering it as ₹0 would be a measurement nobody took.
 */
export type StoreDashboard = {
  days: number;
  low_stock_threshold: number;
  orders: {
    total: number;
    paid: number;
    pending_payment: number;
    cancelled: number;
    period: number;
    /* These two overlap: an order holding a switch and a licence is in both. */
    with_physical: number;
    with_digital: number;
  };
  revenue: {
    total_paise: number;
    period_paise: number;
    gst_paise: number;
    discount_paise: number;
    refunded_paise: number;
    average_paise: number | null;
    sample: number;
  };
  catalogue: { products: number; published: number; out_of_stock: number };
  attention: {
    awaiting_payment: number;
    awaiting_dispatch: number;
    awaiting_codes: number;
    refund_requested: number;
    out_of_stock: number;
    codes_exhausted: number;
    failed_payments: number;
  };
  series: { day: string; revenue_paise: number; orders: number }[];
  recent: {
    order_number: string;
    customer_name: string;
    status: OrderStatus;
    status_label: string;
    total_paise: number;
    placed_at: string | null;
  }[];
  low_stock: { id: number; name: string; stock: number }[];
  codes_low: { id: number; name: string; available: number }[];
};

/** What sold between two dates. See `App\Support\Store\SalesReport`. */
export type StoreReport = {
  from: string;
  to: string;
  group: "day" | "week" | "month";
  days: number;
  totals: {
    orders: number;
    units: number;
    subtotal_paise: number;
    discount_paise: number;
    taxable_paise: number;
    gst_paise: number;
    total_paise: number;
    refunded_paise: number;
    /** Null, never zero, when nothing sold in the range. */
    average_paise: number | null;
  };
  series: { period: string; label: string; orders: number; revenue_paise: number; gst_paise: number; discount_paise: number }[];
  /** `id` is null for a product deleted since; the name is the order's own snapshot. */
  products: { id: number | null; name: string; sku: string | null; type: string; units: number; orders: number; revenue_paise: number }[];
  /** Every order placed, paid or not — so it does not add up to the revenue. */
  statuses: { status: string; label: string; orders: number; total_paise: number }[];
};

export type AdminOrder = {
  id: number;
  order_number: string;
  status: OrderStatus;
  status_label: string;
  /** What this order may move to, decided by the API's enum rather than here. */
  allowed_transitions?: { value: OrderStatus; label: string }[];
  customer_name: string;
  customer_email: string;
  customer_phone?: string | null;
  customer_id?: number | null;
  subtotal_paise: number;
  discount_paise: number;
  taxable_paise: number;
  gst_paise: number;
  total_paise: number;
  coupon_code?: string | null;
  billing_address?: PostalAddress | null;
  shipping_address?: PostalAddress | null;
  needs_shipping: boolean;
  gst_required: boolean;
  gstin?: string | null;
  company_name?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  has_invoice: boolean;
  courier?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  shipping_notes?: string | null;
  /** Whether somebody is waiting on a licence key. On the list as well. */
  awaiting_codes?: boolean;
  placed_at?: string | null;
  paid_at?: string | null;
  dispatched_at?: string | null;
  completed_at?: string | null;
  items?: AdminOrderLine[];
  payments?: AdminPayment[];
  history?: { from_status: string | null; to_status: string; note: string | null; actor_name: string | null; at: string | null }[];
  notes?: { id: number; body: string; actor_name: string | null; at: string | null }[];
};

export type AdminOrderLine = {
  id: number;
  name: string;
  variation_name?: string | null;
  sku?: string | null;
  options?: Record<string, string> | null;
  type: StoreProductType;
  quantity: number;
  unit_price_paise: number;
  line_total_paise: number;
  returnable: boolean;
  store_product_id?: number | null;
  needs_codes: boolean;
  codes_issued: number;
  codes_outstanding: number;
};

/** The gateway identifiers are here so a figure can be reconciled against the
 *  provider's own dashboard — which is why staff see them and buyers do not. */
export type AdminPayment = {
  id: number;
  gateway: string;
  status: string;
  status_label: string;
  amount_paise: number;
  method?: string | null;
  gateway_payment_id?: string | null;
  gateway_order_id?: string | null;
  failure_reason?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
};

/** One activation code, as the inventory lists it — never including the code. */
export type AdminDigitalCode = {
  id: number;
  status: string;
  status_label: string;
  order_number?: string | null;
  assigned_at?: string | null;
  revealed_at?: string | null;
  reveal_count: number;
  created_at?: string | null;
};

export type PostalAddress = {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  pin?: string | null;
  country?: string | null;
};

/**
 * What the gateway's own script needs to open a payment.
 *
 * `key_id` is public by design — it is in the script tag on every Razorpay
 * checkout there is. No secret appears here, and none may be added.
 */
export type PaymentSession = {
  gateway: "razorpay" | "cashfree" | "paytm";
  gateway_order_id: string;
  key_id: string;
  amount_paise: number;
  currency: string;
  order_number: string;
  name: string;
  prefill?: { name?: string | null; email?: string | null; contact?: string | null };
};

export type CartLine = {
  id: number;
  product_id: number;
  variation_id?: number | null;
  name: string;
  variation_name?: string | null;
  slug: string;
  sku?: string | null;
  type: StoreProductType;
  image_url?: string | null;
  quantity: number;
  unit_price_paise: number;
  line_total_paise: number;
  /** A term of the sale, carried on the line so the cart can say it. */
  returnable: boolean;
  shipped: boolean;
  /** What is wrong with this line, if anything. Reported, never fixed silently. */
  problem?: string | null;
};

export type StoreCategory = {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  image_url?: string | null;
  product_count?: number;
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

/* ----------------------------------------------------------- newsletter -- */

export type NewsletterSubscriber = {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  name: string;
  company: string | null;
  phone: string | null;
  status: string;
  status_label: string;
  source: string;
  customer_id: number | null;
  bounce_count: number;
  subscribed_at: string | null;
  unsubscribed_at: string | null;
  groups?: { id: number; name: string }[];
  /**
   * On the do-not-mail list, which is a different fact from the status and can
   * disagree with it: a row imported after somebody unsubscribed reads
   * `active` and is still unmailable. Both are shown, because the status alone
   * explains neither the exclusion nor how to undo it.
   */
  suppressed?: boolean;
};

export type NewsletterGroup = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  subscriber_count: number;
  /** How many of them can actually be mailed. A group of 900 with 40 mailable
   *  is a group somebody needs to look at. */
  active_count: number;
  /** `manual` for a group somebody curates, `customers` for the standing one. */
  source?: string;
  /**
   * Membership is derived rather than edited, so the console offers neither a
   * delete nor a member editor for it — both would appear to work and be undone
   * on the next sync.
   */
  managed?: boolean;
};

export type NewsletterBlock = { type: string; [key: string]: unknown };

export type NewsletterCampaign = {
  id: number;
  name: string;
  subject: string;
  preheader: string | null;
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
  status: string;
  status_label: string;
  is_editable: boolean;
  template_id: number | null;
  blocks: NewsletterBlock[];
  html_content?: string | null;
  text_content?: string | null;
  recipient_count: number;
  health_score: number | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  test_sent_at: string | null;
  created_at: string | null;
  /**
   * One attachment, stored as a media path plus the human name and size copied
   * from the row — the media row can be renamed or deleted later, and what was
   * sent must not change afterwards.
   */
  attachment_path?: string | null;
  attachment_name?: string | null;
  attachment_bytes?: number | null;
  attachment_url?: string | null;
  /**
   * How it performed. Present on the index, absent on a single read.
   *
   * Counts rather than rates, because a rate needs its denominator beside it —
   * 100% of two and 100% of two hundred are not the same claim.
   */
  performance?: {
    recipients: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
  };
  group_ids?: number[];
  groups?: { id: number; name: string }[];
  author?: string | null;
};

export type NewsletterTemplate = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  is_system: boolean;
  blocks?: NewsletterBlock[];
  html?: string | null;
};

export type NewsletterAudience = {
  group_contacts: number;
  duplicates_removed: number;
  unsubscribed_removed: number;
  bounced_removed: number;
  suppressed_removed: number;
  final_recipients: number;
};

export type NewsletterHealthCheck = {
  key: string;
  label: string;
  weight: number;
  passed: boolean;
  hint: string | null;
  blocking: boolean;
};

export type NewsletterHealth = {
  score: number;
  band: "good" | "fair" | "poor";
  checks: NewsletterHealthCheck[];
  failed: NewsletterHealthCheck[];
  /** The ones that stop a send outright, reported separately from the score:
   *  a 78 with no unsubscribe link is not "nearly good". */
  blocking: string[];
};

export type NewsletterSuppression = {
  id: number;
  email: string;
  reason: string;
  reason_label: string;
  note: string | null;
  created_at: string | null;
  /** False when the person unsubscribed themselves — staff may not undo that. */
  can_lift: boolean;
};

export type NewsletterImportAnalysis = {
  file: string;
  original_name: string;
  headers: string[];
  mapping: Record<string, number | null>;
  counts: {
    total: number; valid: number; invalid: number;
    duplicates: number; already_subscribed: number; suppressed: number;
  };
  problems: { line: number; email: string | null; outcome: string; reason: string }[];
  preview: Record<string, string | null>[];
};

export type NewsletterDashboard = {
  subscribers: { total: number; active: number; unsubscribed: number; bounced: number; suppressed: number };
  campaigns: { total: number; sent: number; draft: number; scheduled: number; emails_sent: number };
  rates: { open: number | null; click: number | null; bounce: number | null; delivery: number | null; sample: number };
  tracking_enabled: boolean;
  recent_campaigns: { id: number; name: string; status: string; status_label: string; recipients: number; completed_at: string | null }[];
  recent_unsubscribes: { email: string; reason: string; at: string | null }[];
};

export type NewsletterReport = {
  campaign: {
    id: number; name: string; subject: string; status: string; status_label: string;
    started_at: string | null; completed_at: string | null; health_score: number | null;
  };
  counts: {
    recipients: number; sent: number; failed: number; skipped: number;
    opened: number; clicked: number; bounced: number; unsubscribed: number;
  };
  rates: {
    delivery: number | null; open: number | null; click: number | null;
    click_to_open: number | null; bounce: number | null; unsubscribe: number | null;
  };
  links: { id: number; url: string; label: string | null; total_clicks: number; unique_clicks: number }[];
  timeline: { hour: string; opened: number; clicked: number }[];
  measurement_note: string;
  /** See `QueueHealth`. */
  queue?: QueueHealth;
};

/**
 * Whether anything is draining the queue, and whether the scheduler is alive.
 *
 * A campaign is sent by queued jobs, so with no worker running it sits at
 * `sending` for ever and nothing anywhere says why. `known` is false on a
 * queue driver this cannot inspect.
 *
 * `scheduler` is the half the backlog cannot supply. Before a send there is
 * nothing queued to be late, so `pending: 0` describes a healthy install and
 * one with no cron entry identically — the heartbeat separates them.
 */
export type QueueHealth = {
  driver: string;
  known: boolean;
  pending?: number;
  failed?: number;
  oldest_seconds?: number | null;
  stalled?: boolean;
  scheduler?: {
    known: boolean;
    /** Null when the scheduler has never been seen on this install. */
    last_run_seconds?: number | null;
    running?: boolean;
  };
  /**
   * A worker's own pulse, written from inside the process that sends.
   *
   * The second right answer to "will this be delivered": a bare
   * `php artisan queue:work` delivers mail perfectly well and never touches
   * the scheduler's heartbeat.
   */
  worker?: {
    known: boolean;
    last_seen_seconds?: number | null;
    running?: boolean;
  };
  /** Either of the two above. The verdict the send screen asks for. */
  delivering?: boolean;
};
