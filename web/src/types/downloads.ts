/**
 * The downloads centre on the wire (docs/downloads.md, API.md "Downloads").
 *
 * A public download never carries its file's address: the browser fetches
 * `/api/downloads/{id}` on this site, which counts the download and — for a
 * customers-only one — asks who is reading. `locked` is the one bit a page
 * needs about access.
 */

export type DownloadFile = {
  name: string;
  extension: string | null;
  size: number;
};

export type DownloadCategoryRef = { id: number; name: string; slug: string };

export type Download = {
  id: number;
  title: string;
  summary: string | null;
  version: string | null;
  released_on: string | null;
  /** The API's words for the date — "8 October 2026". */
  released_label: string | null;
  access: "public" | "customers";
  locked: boolean;
  category: DownloadCategoryRef | null;
  file: DownloadFile | null;
  updated_at: string | null;
};

export type DownloadCategory = DownloadCategoryRef & {
  description: string | null;
  /** Published downloads on this shelf. */
  count: number;
};

export type DownloadCategoryList = {
  data: DownloadCategory[];
  meta: { total: number; updated_at: string | null };
};

/* ---- The console ---- */

export type DownloadOption = { value: string; label: string; blurb?: string };

export type AdminDownloadMeta = {
  accesses: DownloadOption[];
  sources: DownloadOption[];
  statuses: DownloadOption[];
  extensions: string[];
  /** The largest private upload this server takes, in KB — php.ini included. */
  max_upload_kb: number;
};

export type AdminDownload = {
  id: number;
  title: string;
  summary: string | null;
  version: string | null;
  released_on: string | null;
  access: "public" | "customers";
  access_label: string;
  source: "library" | "upload";
  source_label: string;
  /** The library path, for a library download; null for an upload. */
  file_path: string | null;
  file: (DownloadFile & { mime: string | null }) | null;
  has_file: boolean;
  /** It says it has a file and nothing answers for it. */
  file_missing: boolean;
  status: "draft" | "published" | "archived";
  sort_order: number;
  download_count: number;
  download_category_id: number | null;
  category: { id: number; name: string; is_active: boolean } | null;
  attached_count?: number;
  /** Detail read only. */
  product_ids?: number[];
  store_product_ids?: number[];
  products?: { id: number; name: string }[];
  store_products?: { id: number; name: string }[];
  created_at: string | null;
  updated_at: string | null;
};

export type AdminDownloadOptions = AdminDownloadMeta & {
  categories: { id: number; name: string; is_active: boolean }[];
  products: { id: number; name: string }[];
  store_products: { id: number; name: string }[];
};

export type AdminDownloadCategory = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  downloads_count: number;
  updated_at: string | null;
};
