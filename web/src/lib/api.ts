import "server-only";
import type {
  BlogPost, CaseStudy, Collection, Industry, KnowledgeArticle, Paginated,
  Product, ProductCategory, Service, Single, Solution,
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

  products: (query = "") =>
    apiFetch<Paginated<Product>>(`/products${query}`, { revalidate: 300, tags: ["products"] }),
  product: (slug: string) =>
    apiFetch<Single<Product>>(`/products/${slug}`, { revalidate: 300, tags: [`product:${slug}`] }),

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

  knowledgeArticles: (query = "") =>
    apiFetch<Paginated<KnowledgeArticle>>(`/knowledge-base${query}`, { revalidate: 300, tags: ["kb"] }),
  knowledgeArticle: (slug: string) =>
    apiFetch<Single<KnowledgeArticle>>(`/knowledge-base/${slug}`, { revalidate: 300, tags: [`kb:${slug}`] }),

  ticketCategories: () =>
    apiFetch<{ data: { id: number; name: string }[] }>("/ticket-categories", { revalidate: 3600, tags: ["ticket-categories"] }),
};
