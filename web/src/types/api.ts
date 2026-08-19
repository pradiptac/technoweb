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
