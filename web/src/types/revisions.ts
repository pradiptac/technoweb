import type { StoredSection } from "./page-sections";

/**
 * Page history (0.145.0, docs/page-builder.md "Page history"). The keys are
 * morph-map aliases — the API's `App\Support\Revisions`, the kinds with a
 * history so far.
 */
export type RevisionType = "page" | "saved_section";

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
