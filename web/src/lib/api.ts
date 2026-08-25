import "server-only";
import type {
  BlogPost, Brand, CaseStudy, Collection, Industry, KnowledgeArticle, Paginated,
  CmsPage, Product, ProductCategory, Service, Single, SiteForm, Slider, Solution,
  CmsPageSummary,
  SearchResults,
} from "@/types/api";

/**
 * Typed fetch wrapper for the Laravel REST API.
 *
 * The browser NEVER talks to MySQL and never holds the API base URL secret —
 * but auth tokens live in httpOnly cookies and are attached server-side only,
 * so every authenticated call must run in a Server Component or Route Handler.
 */

const BASE = process.env.API_BASE_URL ?? "http://localhost:8000";
const VERSION = "v1";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors?: Record<string, string[]>,
    /**
     * A machine-readable refusal, where the endpoint offers one.
     *
     * The portal login uses it: "confirm your address" and "waiting for
     * approval" are both a 403 with the right password, and the two want
     * different screens — one offers a resend button, the other has nothing to
     * offer and should not pretend. Branching on `message` instead would mean
     * a reworded sentence silently changing behaviour.
     */
    readonly reason?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  token?: string;
  /** ISR window in seconds. Omit for dynamic (no-store) requests. */
  revalidate?: number;
  tags?: string[];
};

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, token, revalidate, tags, headers, ...rest } = options;

  const url = `${BASE}/api/${VERSION}${path.startsWith("/") ? path : `/${path}`}`;

  const res = await fetch(url, {
    ...rest,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...(revalidate !== undefined
      ? { next: { revalidate, ...(tags ? { tags } : {}) } }
      : { cache: "no-store" as const }),
  });

  if (res.status === 204) return undefined as T;

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(
      (payload as { message?: string })?.message ?? `Request failed (${res.status})`,
      res.status,
      (payload as { errors?: Record<string, string[]> })?.errors,
      (payload as { reason?: string })?.reason,
    );
  }

  return payload as T;
}

/**
 * Multipart variant for endpoints that accept file uploads (ticket
 * attachments). Content-Type is deliberately not set — fetch must generate the
 * multipart boundary itself, and setting it by hand breaks the request.
 */
export async function apiUpload<T>(
  path: string,
  formData: FormData,
  options: { token?: string; method?: string } = {},
): Promise<T> {
  const res = await fetch(`${BASE}/api/${VERSION}${path.startsWith("/") ? path : `/${path}`}`, {
    method: options.method ?? "POST",
    headers: {
      Accept: "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: formData,
    cache: "no-store",
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(
      (payload as { message?: string })?.message ?? `Upload failed (${res.status})`,
      res.status,
      (payload as { errors?: Record<string, string[]> })?.errors,
    );
  }

  return payload as T;
}

/**
 * Public, cacheable reads — safe to statically render and revalidate.
 *
 * Note the return shapes differ by endpoint and they are NOT interchangeable:
 * index routes backed by a Laravel paginator return `Paginated<T>` (data + meta
 * + links), while those returning a plain collection return `{ data: T[] }`.
 * Products and blog paginate; solutions, services and industries do not.
 */
export const publicApi = {
  solutions: () =>
    apiFetch<Collection<Solution>>("/solutions", { revalidate: 300, tags: ["solutions"] }),
  solution: (slug: string) =>
    apiFetch<Single<Solution>>(`/solutions/${slug}`, { revalidate: 300, tags: [`solution:${slug}`] }),

  services: () =>
    apiFetch<Collection<Service>>("/services", { revalidate: 600, tags: ["services"] }),
  service: (slug: string) =>
    apiFetch<Single<Service>>(`/services/${slug}`, { revalidate: 600, tags: [`service:${slug}`] }),

  industries: () =>
    apiFetch<Collection<Industry>>("/industries", { revalidate: 600, tags: ["industries"] }),
  industry: (slug: string) =>
    apiFetch<Single<Industry>>(`/industries/${slug}`, { revalidate: 600, tags: [`industry:${slug}`] }),

  /**
   * `cache: false` for user-supplied search terms.
   *
   * Search results must never be ISR-cached: the query space is unbounded, so
   * caching fills the cache with single-use entries, and a term that returned
   * nothing keeps returning nothing for the whole revalidate window even after
   * the content changes. Only the unfiltered listing is worth caching.
   */
  products: (query = "", cache = true) =>
    apiFetch<Paginated<Product>>(
      `/products${query}`,
      cache ? { revalidate: 300, tags: ["products"] } : {},
    ),
  product: (slug: string) =>
    apiFetch<Single<Product>>(`/products/${slug}`, { revalidate: 300, tags: [`product:${slug}`] }),

  /**
   * Brands that have a published product, for the catalogue filter. Cached
   * with the categories rather than with the products: this is taxonomy, and
   * it changes when the client starts carrying a new line, not when someone
   * edits a description.
   */
  brands: () => apiFetch<Collection<Brand>>("/brands", { revalidate: 600, tags: ["brands"] }),

  /**
   * One carousel by slug. Cached like other structural content — a slider is
   * furniture, not a search result — and tagged per slug so publishing one
   * does not invalidate the rest.
   */
  slider: (slug: string) =>
    apiFetch<Single<Slider>>(`/sliders/${slug}`, { revalidate: 600, tags: [`slider:${slug}`] }),

  /**
   * A form definition. Cached like other structural content — the shape of a
   * form changes when an editor edits it, not per visitor — and tagged per
   * slug so saving one does not invalidate the rest.
   */
  form: (slug: string) =>
    apiFetch<Single<SiteForm>>(`/forms/${slug}`, { revalidate: 600, tags: [`form:${slug}`] }),

  productCategories: () =>
    apiFetch<Collection<ProductCategory>>("/product-categories", { revalidate: 600, tags: ["product-categories"] }),
  productCategory: (slug: string) =>
    apiFetch<Single<ProductCategory>>(`/product-categories/${slug}`, { revalidate: 600, tags: [`product-category:${slug}`] }),

  caseStudies: () =>
    apiFetch<Collection<CaseStudy>>("/case-studies", { revalidate: 600, tags: ["case-studies"] }),
  caseStudy: (slug: string) =>
    apiFetch<Single<CaseStudy>>(`/case-studies/${slug}`, { revalidate: 600, tags: [`case-study:${slug}`] }),

  posts: (query = "") =>
    apiFetch<Paginated<BlogPost>>(`/blog${query}`, { revalidate: 300, tags: ["blog"] }),
  post: (slug: string) =>
    apiFetch<Single<BlogPost>>(`/blog/${slug}`, { revalidate: 300, tags: [`post:${slug}`] }),

  knowledgeArticles: (query = "", cache = true) =>
    apiFetch<Paginated<KnowledgeArticle>>(
      `/knowledge-base${query}`,
      cache ? { revalidate: 300, tags: ["kb"] } : {},
    ),
  knowledgeArticle: (slug: string) =>
    apiFetch<Single<KnowledgeArticle>>(`/knowledge-base/${slug}`, { revalidate: 300, tags: [`kb:${slug}`] }),

  /**
   * Published pages without their bodies — /privacy, /terms, /downloads and
   * whatever an editor adds next. Only the sitemap needs this; there was no
   * way to discover a CMS page before it, so all three were missing from
   * sitemap.xml.
   */
  pages: () =>
    apiFetch<Collection<CmsPageSummary>>("/pages", { revalidate: 600, tags: ["pages"] }),
  page: (slug: string) =>
    apiFetch<Single<CmsPage>>(`/pages/${slug}`, { revalidate: 600, tags: [`page:${slug}`] }),

  /**
   * Site-wide search. Never cached, for the reason spelled out on
   * `products` above: the query space is unbounded, so caching fills the
   * cache with single-use entries and serves a stale empty result for the
   * whole revalidate window.
   */
  search: (q: string) =>
    apiFetch<SearchResults>(`/search?q=${encodeURIComponent(q)}`, {}),

  ticketCategories: () =>
    apiFetch<{ data: { id: number; name: string }[] }>("/ticket-categories", { revalidate: 3600, tags: ["ticket-categories"] }),
};
