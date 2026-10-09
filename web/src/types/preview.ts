/**
 * Draft share links (0.138.0, docs/admin-console.md "Draft share links").
 * The keys are morph-map aliases — the API's `App\Support\PreviewLinks`.
 */
export type PreviewType =
  | "page"
  | "blog_post"
  | "knowledge_article"
  | "case_study"
  | "solution"
  | "service"
  | "product"
  | "store_product"
  | "event"
  | "job_opening"
  | "entry"
  | "landing_page";

/** A link as staff see it. `path` is a path, never a URL: the browser adds its own origin. */
export type PreviewLink = {
  id: number;
  type: PreviewType;
  subject_id: number;
  path: string;
  expires_at: string;
  expires_label: string;
  is_expired: boolean;
  views: number;
  last_viewed_at: string | null;
  created_by: string | null;
};

export type PreviewLinkMeta = { days: number[]; default_days: number };

export type PreviewLinkRead = { data: PreviewLink | null; meta: PreviewLinkMeta };

/** The public read of a draft: the record exactly as its detail endpoint sends it, minus the structured data. */
export type DraftPreview = {
  data: {
    type: PreviewType;
    slug: string | null;
    /** An entry's content type, for its address. */
    type_slug: string | null;
    /** A landing page's stored path. */
    path: string | null;
    record: Record<string, unknown>;
  };
  meta: {
    title: string;
    status: "draft" | "published" | "archived";
    status_label: string;
    published: boolean;
    expires_at: string;
    expires_label: string;
  };
};
