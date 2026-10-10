import type { StoredSection } from "./page-sections";

/**
 * Page history (0.145.0, docs/page-builder.md "Page history"). The keys are
 * morph-map aliases — the API's `App\Support\Revisions`. Every kind of record
 * that carries a draft share link has one since 0.148.0, plus the section
 * library.
 */
export type RevisionType =
  | "page" | "saved_section"
  | "blog_post" | "knowledge_article" | "case_study" | "solution" | "service" | "product"
  | "store_product" | "event" | "job_opening" | "entry" | "landing_page";

/** One row of the list: no snapshot, which is the heavy part. */
export type RevisionRow = {
  id: number;
  /** When this state was last saved; a folded run of saves keeps moving it. */
  saved_at: string | null;
  created_at: string | null;
  actor_name: string | null;
  /** Keys of `meta.labels`: what differs from the revision before. `created` marks the first. */
  changed: string[];
  blocks_count: number;
  size?: number;
};

export type RevisionMeta = {
  /** Key → words, from the API; the console lists none itself. */
  labels: Record<string, string>;
  keep: number;
  coalesce_minutes: number;
  /** Column → the edit form's control, only where the two are named differently. */
  fields?: Record<string, string>;
  /** The columns that are the written body, in the order a preview draws them. */
  body_columns?: string[];
  /** False for a kind whose form cannot take a version: History then offers Preview only. */
  restorable?: boolean;
};

export type RevisionList = { data: RevisionRow[]; meta: RevisionMeta };

/** The content columns a revision holds. Which keys exist depends on the kind. */
export type RevisionSnapshot = {
  title?: string | null;
  slug?: string | null;
  body?: string | null;
  template?: string | null;
  name?: string | null;
  description?: string | null;
  /** A solution's written body. */
  overview?: string | null;
  /** A landing page's heading and introduction. */
  heading?: string | null;
  intro?: string | null;
  /** `body` or `sections`: which of the two a record's page draws. */
  body_layout?: string | null;
  blocks?: StoredSection[] | null;
};

export type RevisionDetail = {
  data: RevisionRow & {
    type: RevisionType;
    subject_id: number;
    snapshot: RevisionSnapshot;
    /** Every picture path in the sections → its URL, so the builder can draw them. */
    blocks_media: Record<string, string>;
  };
  meta: RevisionMeta;
};
