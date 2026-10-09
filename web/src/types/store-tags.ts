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
