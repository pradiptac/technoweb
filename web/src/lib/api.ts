import "server-only";
import { clientIpHeaders } from "@/lib/client-ip";
import { previewRecord, type PreviewKind } from "@/lib/preview-store";
import type { StoreFacetsResponse, VideoShelfRow } from "@/types/store-merch";
import type { StoreTagChip } from "@/types/store-tags";
import type {
  ContentBlock,
  BlogPost,
  PublicComment,
  BlogTaxonomy, Brand, CaseStudy, Certification, Client, Collection, Industry, KnowledgeArticle, Paginated, TeamMember,
  CmsPage, Product, ProductCategory, Service, ServiceCategory, Single, SiteForm, Slider, Solution,
  CmsPageSummary, Gallery, JobOpening, Popup,
  ContentEntry, ContentTypeSummary,
  SearchResults,
  LandingPageSummary, LandingPage as LandingPageRecord,
  NavNode,
  StoreProduct, StoreCategory, StoreFeedPage, DraftPreview,
} from "@/types/api";
import type {
  EventAvailability, EventDetail, EventRegistration, EventRegistrationPayload, EventRegistrationResult, EventSummary,
} from "@/types/events";
import type { Download, DownloadCategoryList } from "@/types/downloads";

/**
 * Nothing in the preview store means an ordinary request, and then this is
 * just the fetch. See `lib/preview-store.ts`.
 */
function previewOr<T>(kind: PreviewKind, key: string, fetcher: () => Promise<Single<T>>): Promise<Single<T>> {
  const hit = previewRecord<T>(kind, key);
  return hit ? Promise.resolve({ data: hit }) : fetcher();
}

/**
 * Typed fetch wrapper for the Laravel REST API.
 *
 * The browser NEVER talks to MySQL and never holds the API base URL secret —
 * but auth tokens live in httpOnly cookies and are attached server-side only,
 * so every authenticated call must run in a Server Component or Route Handler.
 */

const BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";
const VERSION = "v1";

/**
 * The absolute API URL for a versioned path — for the few route handlers
 * that stream a body through rather than calling `apiFetch`, so the base
 * and the version are still decided in one place.
 */
export function apiUrl(path: string): string {
  return `${BASE}/api/${VERSION}${path.startsWith("/") ? path : `/${path}`}`;
}

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

  /*
    Who is asking, for the API's per-visitor rate limits — on uncached calls
    only. A cached read is shared by every visitor and its cache key includes
    the headers, so naming one visitor there would split the cache per address
    (and a prerender has no visitor to name). Every throttled endpoint is a
    write or a no-store read, which is exactly the set this covers.
  */
  const forwarded = revalidate === undefined ? await clientIpHeaders() : {};

  const res = await fetch(url, {
    ...rest,
    headers: {
      Accept: "application/json",
      ...forwarded,
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
      ...(await clientIpHeaders()),
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
  /*
   * Programmatic landing pages.
   *
   * `landingPage` is a **single lookup on a stored path**, not a resolution
   * chain. `/products/[slug]` has to try the category endpoint and then the
   * product endpoint because two kinds of record share one segment, and that
   * ordering is a documented cost here; this family avoids repeating it by
   * letting the database own the whole path.
   *
   * Cached like any other content page. The key space is bounded — the API
   * refuses to publish past a configured cap — so unlike a search query this is
   * safe to keep, and the tag is the path so one page can be busted alone.
   */
  landingPages: (kind?: string) =>
    apiFetch<Collection<LandingPageSummary>>(`/landing-pages${kind ? `?kind=${kind}` : ""}`, {
      revalidate: 600,
      tags: ["landing-pages"],
    }),
  landingPage: (path: string) =>
    previewOr<LandingPageRecord>("landing-page", path, () =>
      apiFetch<Single<LandingPageRecord>>(`/landing-pages/lookup?path=${encodeURIComponent(path)}`, {
        revalidate: 600,
        tags: ["landing-pages", `landing-page:${path}`],
      }),
    ),

  /*
   * `inMenu` asks for the subset the mega menu may show.
   *
   * A separate cache tag, because they are two different answers to two
   * different questions and a shared tag would have the menu serving the index
   * page's list. Both are revalidated together when a record changes, since
   * one edit can move a record between them.
   */
  solutions: (inMenu = false) =>
    apiFetch<Collection<Solution>>(`/solutions${inMenu ? "?in_menu=1" : ""}`, {
      revalidate: 300,
      tags: inMenu ? ["solutions", "menu"] : ["solutions"],
    }),
  solution: (slug: string) =>
    previewOr<Solution>("solution", slug, () =>
      apiFetch<Single<Solution>>(`/solutions/${slug}`, { revalidate: 300, tags: ["solutions", `solution:${slug}`] }),
    ),

  services: (inMenu = false) =>
    apiFetch<Collection<Service>>(`/services${inMenu ? "?in_menu=1" : ""}`, {
      revalidate: 600,
      tags: inMenu ? ["services", "menu"] : ["services"],
    }),
  service: (slug: string) =>
    previewOr<Service>("service", slug, () =>
      apiFetch<Single<Service>>(`/services/${slug}`, { revalidate: 600, tags: ["services", `service:${slug}`] }),
    ),
  /**
   * The service categories, active only and in order — the tabs the services
   * are grouped under. Tagged `services`, which every service and category
   * save purges, so moving a service between tabs shows on the next request.
   */
  serviceCategories: () =>
    apiFetch<Collection<ServiceCategory>>("/service-categories", { revalidate: 600, tags: ["services"] }),

  industries: (inMenu = false) =>
    apiFetch<Collection<Industry>>(`/industries${inMenu ? "?in_menu=1" : ""}`, {
      revalidate: 600,
      tags: inMenu ? ["industries", "menu"] : ["industries"],
    }),
  industry: (slug: string) =>
    apiFetch<Single<Industry>>(`/industries/${slug}`, { revalidate: 600, tags: ["industries", `industry:${slug}`] }),

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
    previewOr<Product>("product", slug, () =>
      apiFetch<Single<Product>>(`/products/${slug}`, { revalidate: 300, tags: ["products", `product:${slug}`] }),
    ),

  /*
   * The shop, which is a different list from the catalogue above.
   *
   * Cached like any other content, and **never with a search term in it** —
   * `?q=` has an unbounded key space, so caching it fills the cache with
   * single-use entries and serves a stale empty result for the whole
   * revalidate window. Same `cache` flag the catalogue takes, for the same
   * reason.
   *
   * A price and a stock figure are content that changes without an editor
   * touching anything, so the window is shorter than the catalogue's: five
   * minutes of a wrong price is five minutes of somebody being quoted a number
   * the shop has since corrected.
   */
  storeProducts: (query = "", cache = true) =>
    apiFetch<Paginated<StoreProduct>>(
      `/store/products${query}`,
      cache ? { revalidate: 120, tags: ["store-products"] } : {},
    ),
  storeProduct: (slug: string) =>
    previewOr<StoreProduct>("store-product", slug, () =>
      apiFetch<Single<StoreProduct>>(`/store/products/${slug}`, {
        revalidate: 120,
        tags: ["store-products", `store-product:${slug}`],
      }),
    ),
  /**
   * The shopping feed, one page at a time. Cached an hour, matching the
   * route that renders it: Merchant Center fetches on a schedule, not on
   * every request, and a price is not the kind of thing that changes twice
   * in an hour without an editor knowing.
   */
  storeFeed: (page = 1) =>
    apiFetch<StoreFeedPage>(`/store/feed?page=${page}&per_page=200`, {
      revalidate: 3600,
      tags: ["store-products"],
    }),
  /**
   * "Shop the videos" (0.140.0): the products that carry a video, a tile
   * each. `query` is `?limit=…&product=<slug>&others=0…` and is built by the
   * caller from settings and a slug, never from a visitor's input — so it is
   * cached, under `store-products` (a price or a stock change) and
   * `store-videos` (a product's videos or the settings changing), which the
   * product and settings save actions purge. A cached fetch is what lets the
   * ISR product page carry the row: no cookie, no header, no `no-store`.
   */
  storeVideos: (query = "") =>
    apiFetch<Collection<VideoShelfRow>>(`/store/videos${query}`, {
      revalidate: 120,
      tags: ["store-products", "store-videos"],
    }),

  /**
   * The tags the shop front's row offers (0.141.0): visible tags of published
   * products, with their counts — of one category when `category` is given.
   * `{data: []}` in a 200 when there are none or the row is off. Tagged
   * `store-products` and `store-tags`: a product save and every Tags-screen
   * action purge them.
   */
  storeTags: (category?: string) =>
    apiFetch<Collection<StoreTagChip>>(
      `/store/tags${category ? `?category=${encodeURIComponent(category)}` : ""}`,
      { revalidate: 300, tags: ["store-products", "store-tags"] },
    ),
  storeCategories: () =>
    apiFetch<Collection<StoreCategory>>("/store/categories", {
      revalidate: 600,
      tags: ["store-categories"],
    }),
  storeCategory: (slug: string) =>
    apiFetch<Single<StoreCategory>>(`/store/categories/${slug}`, {
      revalidate: 600,
      tags: ["store-categories", `store-category:${slug}`],
    }),
  /**
   * A category's specification filters with their counts (2026-09-26).
   * `query` is `?spec[..]..` or empty. **Cached only when it is empty**: a
   * combination somebody ticked is a user's query, the rule `storeProducts`
   * keeps for `?q=` — pass `cache: false` whenever a spec is in it.
   */
  storeFacets: (slug: string, query = "", cache = true) =>
    apiFetch<StoreFacetsResponse>(
      `/store/categories/${encodeURIComponent(slug)}/facets${query}`,
      cache ? { revalidate: 300, tags: ["store-products", "store-categories"] } : {},
    ),

  /**
   * Brands that have a published product, for the catalogue filter. Cached
   * with the categories rather than with the products: this is taxonomy, and
   * it changes when the client starts carrying a new line, not when someone
   * edits a description.
   */
  brands: () => apiFetch<Collection<Brand>>("/brands", { revalidate: 600, tags: ["brands"] }),
  /**
   * The brands the company is an authorised partner of — `partner_tier` set,
   * products or no products. Same tag as the listing: a brand edit is what
   * changes either.
   */
  partnerBrands: () =>
    apiFetch<Collection<Brand>>("/brands?partners=1", { revalidate: 600, tags: ["brands"] }),

  /*
   * The company profile. Plain collections, 200 when empty; each tag is what
   * its console action calls `updateTag` on, so an edit reaches the pages
   * that render it at once.
   */
  team: () => apiFetch<Collection<TeamMember>>("/team", { revalidate: 600, tags: ["team"] }),
  clients: () => apiFetch<Collection<Client>>("/clients", { revalidate: 600, tags: ["clients"] }),
  certifications: () =>
    apiFetch<Collection<Certification>>("/certifications", { revalidate: 600, tags: ["certifications"] }),

  /**
   * Every popup that is live right now, for the whole site.
   *
   * The whole set rather than the one for a page, because the caller cannot
   * say which page it is on: a layout has no pathname in the App Router, so
   * the match happens in the browser against the patterns each row carries.
   * That is a handful of rows of public content against a round trip per
   * navigation, which is the right way round.
   *
   * Cached like the other furniture, and tagged as a set rather than per
   * record — there is no per-popup read to invalidate, so publishing one has
   * to turn the whole list over.
   */
  popups: () =>
    apiFetch<Collection<Popup>>("/popups", { revalidate: 600, tags: ["popups"] }),

  /**
   * One carousel by slug. Cached like other structural content — a slider is
   * furniture, not a search result — and tagged per slug so publishing one
   * does not invalidate the rest.
   */
  slider: (slug: string) =>
    apiFetch<Single<Slider>>(`/sliders/${slug}`, { revalidate: 600, tags: [`slider:${slug}`] }),

  /**
   * One content block by slug — a `[cta]`, `[stats]`, `[pricing]` or
   * `[stack]` shortcode. Tagged per slug and with `blocks`, so a console save
   * refreshes the one block and the default band's read together.
   */
  block: (slug: string) =>
    apiFetch<Single<ContentBlock>>(`/blocks/${slug}`, { revalidate: 600, tags: ["blocks", `block:${slug}`] }),

  /**
   * The site's default CTA, or `data: null` — a 200 either way (the menu
   * rule: every page ending on the closing band asks, and Next caches only
   * a 200).
   */
  defaultCta: () =>
    apiFetch<{ data: ContentBlock | null }>("/blocks/default/cta", { revalidate: 600, tags: ["blocks"] }),

  /**
   * One gallery by slug. Cached and tagged exactly like a slider — both are
   * furniture embedded in a body, so publishing one must not invalidate the
   * rest.
   */
  gallery: (slug: string) =>
    apiFetch<Single<Gallery>>(`/galleries/${slug}`, { revalidate: 600, tags: [`gallery:${slug}`] }),

  /**
   * The navigation for a place in the layout.
   *
   * **`data: null` when no menu is assigned**, which is the whole of what
   * makes this additive: the caller falls back to the navigation built into
   * the site, so an install that has never opened the menu screen renders
   * exactly what it renders today. An empty array would blank the header
   * instead. It is a null in a 200 rather than a 404 because Next's data
   * cache stores only 200s — as a 404 this was four uncached round trips on
   * every layout render of an install with nothing assigned.
   *
   * Tagged `menus` rather than per location: there are two of them and they
   * are saved from one screen, so invalidating both is one tag and no
   * bookkeeping.
   */
  menu: (location: string) =>
    apiFetch<{ data: NavNode[] | null }>(`/menus/${location}`, { revalidate: 600, tags: ["menus", `menu:${location}`] }),

  /**
   * A form definition. Cached like other structural content — the shape of a
   * form changes when an editor edits it, not per visitor — and tagged per
   * slug so saving one does not invalidate the rest.
   */
  form: (slug: string) =>
    apiFetch<Single<SiteForm>>(`/forms/${slug}`, { revalidate: 600, tags: [`form:${slug}`] }),

  productCategories: (inMenu = false) =>
    apiFetch<Collection<ProductCategory>>(`/product-categories${inMenu ? "?in_menu=1" : ""}`, {
      revalidate: 600,
      tags: inMenu ? ["product-categories", "menu"] : ["product-categories"],
    }),
  productCategory: (slug: string) =>
    apiFetch<Single<ProductCategory>>(`/product-categories/${slug}`, { revalidate: 600, tags: ["product-categories", `product-category:${slug}`] }),

  /*
   * Vacancies.
   *
   * A short revalidate window on purpose: a role that has just closed should
   * stop being advertised in minutes, not hours. The detail endpoint 404s the
   * moment a closing date passes, so a stale list would send people to a page
   * that is already gone.
   */
  careers: () =>
    apiFetch<Collection<JobOpening>>("/careers", { revalidate: 120, tags: ["careers"] }),
  career: (slug: string) =>
    previewOr<JobOpening>("career", slug, () =>
      apiFetch<Single<JobOpening>>(`/careers/${slug}`, { revalidate: 120, tags: ["careers", `career:${slug}`] }),
    ),

  /*
   * Events (docs/events-contract.md).
   *
   * `query` is only ever written by this codebase — `?when=past&per_page=6`,
   * the sitemap's page walk — never by a visitor, so the key space is a
   * handful of entries and safe to keep. The window is the vacancies' two
   * minutes, for the vacancies' reason: an event stops being "upcoming"
   * because the clock moved, not because an editor saved anything, and a
   * page that goes on advertising yesterday's seminar for ten minutes is ten
   * minutes of people being invited to something that is over. A console
   * save purges `events` (and `event:<slug>`) and is seen at once.
   */
  events: (query = "") =>
    apiFetch<Paginated<EventSummary>>(`/events${query}`, { revalidate: 120, tags: ["events"] }),
  event: (slug: string) =>
    previewOr<EventDetail>("event", slug, () =>
      apiFetch<Single<EventDetail>>(`/events/${encodeURIComponent(slug)}`, {
        revalidate: 120,
        tags: ["events", `event:${slug}`],
      }),
    ),

  /*
   * The downloads centre (docs/downloads.md). The unfiltered list and the
   * shelves are cached and tagged `downloads`, which every console save
   * purges; a search is never cached (`cache: false`) — the rule the
   * catalogue's and the knowledge base's `?q=` follow.
   */
  downloads: (query = "", cache = true) =>
    apiFetch<Paginated<Download>>(`/downloads${query}`, cache ? { revalidate: 300, tags: ["downloads"] } : {}),
  downloadCategories: () =>
    apiFetch<DownloadCategoryList>("/download-categories", { revalidate: 300, tags: ["downloads"] }),

  caseStudies: () =>
    apiFetch<Collection<CaseStudy>>("/case-studies", { revalidate: 600, tags: ["case-studies"] }),
  caseStudy: (slug: string) =>
    previewOr<CaseStudy>("case-study", slug, () =>
      apiFetch<Single<CaseStudy>>(`/case-studies/${slug}`, { revalidate: 600, tags: ["case-studies", `case-study:${slug}`] }),
    ),

  /**
   * The blog listing.
   *
   * `cache` must be **false** whenever `?q=` is present: a search has an
   * unbounded key space, so caching it fills the cache with single-use entries
   * and serves a stale empty result for the whole revalidate window. The
   * knowledge base learned this the hard way and carries the same flag.
   */
  posts: (query = "", cache = true) =>
    apiFetch<Paginated<BlogPost>>(
      `/blog${query}`,
      cache ? { revalidate: 300, tags: ["blog"] } : {},
    ),
  /** The hero's four. Falls back to the latest when nothing is featured. */
  featuredPosts: (limit = 4) =>
    apiFetch<{ data: BlogPost[] }>(
      `/blog/featured?limit=${limit}`,
      { revalidate: 300, tags: ["blog"] },
    ),
  /**
   * Categories with counts, and the archive.
   *
   * A longer window than the listing on purpose — this is the part of the page
   * that changes least, and it is fetched on every blog route.
   */
  blogTaxonomy: () =>
    apiFetch<{ data: BlogTaxonomy }>(
      "/blog/taxonomy",
      { revalidate: 900, tags: ["blog", "blog-taxonomy"] },
    ),
  /**
   * Approved comments on a post.
   *
   * A short window, and tagged so approving one in the console can clear it:
   * a reader who has just been told their comment will appear "once it has
   * been read" should not then find it missing for fifteen minutes after it
   * was.
   */
  postComments: (slug: string) =>
    apiFetch<{ data: PublicComment[]; meta: { open: boolean; total: number } }>(
      `/blog/${slug}/comments`,
      { revalidate: 60, tags: ["blog", `blog-comments:${slug}`] },
    ),
  post: (slug: string) =>
    previewOr<BlogPost>("post", slug, () =>
      apiFetch<Single<BlogPost>>(`/blog/${slug}`, { revalidate: 300, tags: ["blog", `post:${slug}`] }),
    ),

  knowledgeArticles: (query = "", cache = true) =>
    apiFetch<Paginated<KnowledgeArticle>>(
      `/knowledge-base${query}`,
      cache ? { revalidate: 300, tags: ["kb"] } : {},
    ),
  knowledgeArticle: (slug: string) =>
    previewOr<KnowledgeArticle>("knowledge-article", slug, () =>
      apiFetch<Single<KnowledgeArticle>>(`/knowledge-base/${slug}`, { revalidate: 300, tags: ["kb", `kb:${slug}`] }),
    ),

  /**
   * Published pages without their bodies — /privacy, /terms, /downloads and
   * whatever an editor adds next. Only the sitemap needs this; there was no
   * way to discover a CMS page before it, so all three were missing from
   * sitemap.xml.
   */
  pages: () =>
    apiFetch<Collection<CmsPageSummary>>("/pages", { revalidate: 600, tags: ["pages"] }),
  page: (slug: string) =>
    previewOr<CmsPage>("page", slug, () =>
      apiFetch<Single<CmsPage>>(`/pages/${slug}`, { revalidate: 600, tags: ["pages", `page:${slug}`] }),
    ),

  /*
   * Custom content types (docs/custom-content.md). Tagged
   * `content-types` for the list and `entries:<type>` for everything under
   * one type, which is what the console's saves invalidate — an entry
   * renamed moves the archive, and a type's settings (its sort, its per
   * page) move every page of it.
   */
  contentTypes: () =>
    apiFetch<Collection<ContentTypeSummary>>("/content-types", { revalidate: 600, tags: ["content-types"] }),
  /** A type's archive: a page of its published entries, and the type in `meta.type`. */
  contentArchive: (type: string, query = "") =>
    apiFetch<Paginated<ContentEntry> & { meta: Paginated<ContentEntry>["meta"] & { type: ContentTypeSummary } }>(
      `/types/${type}${query}`,
      { revalidate: 600, tags: ["content-types", `entries:${type}`] },
    ),
  entry: (type: string, slug: string) =>
    previewOr<ContentEntry>("entry", `${type}/${slug}`, () =>
      apiFetch<Single<ContentEntry>>(`/types/${type}/${slug}`, {
        revalidate: 600,
        // `entries` is every type's: a library section edited in the console can sit on any entry.
        tags: ["entries", `entries:${type}`, `entry:${type}:${slug}`],
      }),
    ),

  /**
   * A draft opened from its share link (0.138.0). Never cached: the link can
   * be revoked at any moment, and a cached answer would keep a revoked draft
   * on screen.
   */
  preview: (token: string) => apiFetch<DraftPreview>(`/preview/${token}`, { cache: "no-store" }),

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

/**
 * The half of events that is about one visitor, and so is never cached:
 * whether there is room right now, registering, and a registration read or
 * cancelled through the token in its link (docs/events-contract.md).
 *
 * Apart from `publicApi` because nothing here may enter an ISR render — each
 * call is `no-store`, which inside a page that exports `generateStaticParams`
 * is a 500 rather than a fallback. They are called from route handlers,
 * Server Actions and the one dynamic page (`/events/registration/[token]`),
 * and being uncached they carry the visitor's address, which is what the
 * API's per-visitor throttles count.
 */
export const eventApi = {
  availability: (slug: string) =>
    apiFetch<{ data: EventAvailability }>(`/events/${encodeURIComponent(slug)}/availability`),

  /**
   * `token` is the portal session when there is one, so the registration is
   * filed under the customer's account — the route is public, and without the
   * header the API sees nobody at all.
   */
  register: (slug: string, payload: EventRegistrationPayload, token?: string) =>
    apiFetch<EventRegistrationResult>(`/events/${encodeURIComponent(slug)}/register`, {
      method: "POST",
      body: payload,
      token,
    }),

  registration: (token: string) =>
    apiFetch<{ data: EventRegistration }>(`/events/registrations/${encodeURIComponent(token)}`),

  cancelRegistration: (token: string) =>
    apiFetch<{ data: EventRegistration }>(`/events/registrations/${encodeURIComponent(token)}/cancel`, {
      method: "POST",
    }),
};
