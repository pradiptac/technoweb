/**
 * Importing a WordPress / WooCommerce site (docs/wordpress-import.md) — the
 * shapes `GET /admin/imports/wordpress/{id}` answers with.
 */

export type WordPressImportStatus =
  | "pending" | "scanning" | "analysing" | "ready" | "running" | "completed" | "failed" | "cancelled" | "expired";

export type WordPressImportSection = "content" | "catalogue" | "customers" | "custom";

/**
 * Why records were skipped, or written with something missing — grouped,
 * largest first. `info` says what was made of something (0.110.0: the forms,
 * pricing blocks and galleries a page held), neither a loss nor a refusal.
 */
export type WordPressImportReason = {
  reason: string;
  count: number;
  kind: "skip" | "warn" | "info";
  examples: string[];
};

/** One kind of thing, as the dry run planned it or the commit did it. */
export type WordPressImportStep = {
  key: string;
  label: string;
  create: number;
  update: number;
  skip: number;
  warn: number;
  reasons: WordPressImportReason[];
};

/** An ACF field seen on a kind of record, with the kind inferred from its values. */
export type WordPressAcfField = {
  source: string;
  key: string;
  label: string;
  kind: string | null;
  /** Why it cannot be kept ("a repeater or flexible content"), or null. */
  unsupported: string | null;
  count: number;
};

export type WordPressContentTypeChoice = {
  source: string;
  name: string;
  slug: string;
  problem: string | null;
  imported: boolean;
  entries: number;
};

/** What the review asks a person to settle, as the API offers it. */
export type WordPressImportOptions = {
  media_scope?: { value: "referenced" | "all"; library: number };
  /** How pages arrive (0.109.0): laid out as builder sections, or one text body. */
  page_layout?: { value: "sections" | "html"; pages: number };
  currency?: string;
  tax_basis?: { value: "keep" | "add_gst"; choices: string[] };
  content_types?: WordPressContentTypeChoice[];
  acf?: Record<string, WordPressAcfField[]>;
  acf_exposed?: boolean;
  newsletter?: { customers: number; group: string; sequences: string[] };
};

/** What a `PATCH` sends back. */
export type WordPressImportDecisions = {
  media_scope?: "referenced" | "all";
  page_layout?: "sections" | "html";
  tax_basis?: "keep" | "add_gst";
  type_slugs?: Record<string, string>;
  acf_kinds?: Record<string, Record<string, string>>;
};

export type WordPressImport = {
  id: number;
  site_url: string;
  status: WordPressImportStatus;
  sections: WordPressImportSection[];
  error: string | null;
  uploaded_by: string | null;
  created_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
  can_resume: boolean;
  /** On history rows only. */
  site_name?: string;
  decisions?: WordPressImportDecisions;
  progress?: {
    collections: Record<string, number>;
    totals: Record<string, number>;
    requests: number;
    current: string | null;
    tasks_done: number;
    tasks_total: number;
    analyse_step: string | null;
    analyse_percent: number;
    commit_step: string | null;
    commit_percent: number;
  };
  site?: {
    name: string;
    url: string;
    woocommerce: boolean;
    acf: boolean;
    yoast: boolean;
    counts: Record<string, number>;
    missing: Record<string, string>;
  } | null;
  analysis?: {
    steps: WordPressImportStep[];
    notices: string[];
    decisions: WordPressImportOptions;
    analysed_at: string | null;
  } | null;
  result?: { steps: WordPressImportStep[]; notices: string[] } | null;
};

/** `GET /admin/imports/wordpress`. */
export type WordPressImportIndex = {
  data: WordPressImport[];
  meta: { active: WordPressImport | null; delivering: boolean; sections: WordPressImportSection[] };
};
