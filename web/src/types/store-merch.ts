/**
 * Types for the store's specification filters and product videos
 * (2026-09-26, `docs/store-merch-plan.md`). Their own module so the shapes
 * that belong to one feature are read in one place; `types/api.ts` carries
 * the optional fields they hang off.
 */

/** One value a filter offers, with how many products ticking it would leave. */
export type StoreFacetValue = {
  /** The words as the shop has them — what the checkbox says and what is sent back. */
  value: string;
  /** The normalised form the API matches on. */
  key: string;
  /** Counted under every *other* label's selection, never this one's. */
  count: number;
  selected: boolean;
};

/** One filter group: a spec label and its values, in a natural order. */
export type StoreFacet = {
  label: string;
  key: string;
  values: StoreFacetValue[];
};

export type StoreFacetsResponse = {
  data: StoreFacet[];
  meta: { category: string; filtered: boolean };
};

/** The filter picker's options on the console's category form. */
export type AdminSpecLabel = {
  label: string;
  key: string;
  /** How many published products in the category carry it. */
  products: number;
  chosen: boolean;
};

/**
 * A store product's video. A YouTube video travels as its id — never a URL,
 * and never with YouTube's own thumbnail, which would be a request to
 * `i.ytimg.com` on load — and a file as its media-library URL.
 */
export type ProductVideo = {
  kind: "youtube" | "file";
  youtube_id?: string;
  url?: string;
  title?: string;
  /** An uploaded poster; without one the facade draws its own panel. */
  poster_url?: string;
};

/** The same, as the console edits it. */
export type AdminProductVideo = {
  kind: "youtube" | "file";
  /** A pasted link on the way in, the eleven-character id on the way out. */
  youtube_id?: string | null;
  path?: string | null;
  url?: string | null;
  title?: string | null;
  poster_path?: string | null;
  poster_url?: string | null;
};
