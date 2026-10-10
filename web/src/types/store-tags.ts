/**
 * Shop tags (0.141.0, `docs/store.md` "Tags"). Their own module so the shapes
 * that belong to one feature are read in one place; `types/api.ts` carries the
 * optional `tags` field they hang off.
 */

/** What a product row and the detail carry: only tags switched on for the shop front. */
export type StoreTagRef = { name: string; slug: string };

/** One chip in the row under the search bar, with how many published products carry it. */
export type StoreTagChip = StoreTagRef & { count: number };

/** A tag as the Tags screen draws it. */
export type AdminStoreTag = {
  id: number;
  name: string;
  slug: string;
  is_visible: boolean;
  sort_order: number;
  /** Every product carrying it, drafts included — what deleting it would touch. */
  products_count?: number;
  /** The tag page's own heading and introduction (0.157.0); the heading falls back to the name. */
  heading?: string | null;
  /** Rich text, sanitised on write. */
  intro?: string | null;
  /** `/store/tags/<slug>` — a path; the browser supplies the origin. */
  public_path?: string;
  /** Detail only. */
  seo?: import("./api").SeoOverride;
  seo_defaults?: import("./api").Seo;
};

/**
 * A tag's page (0.157.0, `GET /store/tags/{slug}`). `count` is published
 * products; `indexable` is the API's rule (three or more) and the page is
 * `noindex, follow` and out of the sitemap without it.
 */
export type StoreTagPage = {
  name: string;
  slug: string;
  heading: string | null;
  intro: string | null;
  count: number;
  indexable: boolean;
  updated_at?: string | null;
  seo?: import("./api").Seo;
  schema?: Record<string, unknown>;
};

/** A row of `GET /store/tags?all=1`, the sitemap's read. */
export type StoreTagSitemapRow = StoreTagChip & {
  updated_at?: string | null;
  indexable: boolean;
  seo?: { sitemap_include: boolean };
};

export type StoreTagSettings = {
  store_tags_enabled: boolean;
  store_tags_limit: number;
  store_tags_auto: boolean;
};

export type StoreTagsMeta = {
  settings: StoreTagSettings;
  /** Products with no tags that the rule has never decided. */
  untagged: number;
  max_per_product: number;
  name_max: number;
};
