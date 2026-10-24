/**
 * LinkedIn and X posts for published records (C7, docs/social-posts.md).
 * The admin shapes only: a social post has no public face.
 */

export type SocialNetworkId = "linkedin" | "x";

export type SocialPostStatus =
  | "draft" | "sending" | "sent" | "shared_manually" | "failed" | "unconfirmed" | "discarded";

export type SocialSubject = {
  type: "blog_post" | "case_study" | "event" | "entry";
  id: number;
  title: string;
  /** "Blog post", "Press release"… — the API's words. */
  kind: string;
  /** A console path, never a URL. */
  admin_path: string;
  public_url: string;
  image: string | null;
};

export type SocialPost = {
  id: number;
  network: SocialNetworkId;
  network_label: string;
  status: SocialPostStatus;
  status_label: string;
  text: string;
  url: string;
  source: "publish" | "manual";
  /** The wording is still being written; an editor's own text wins. */
  ai_pending: boolean;
  /** X only: what X counts once the site appends a space and the link. */
  x_length: number | null;
  limit: number;
  drafted_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  sent_at: string | null;
  remote_url: string | null;
  error: string | null;
  created_at: string | null;
  subject: SocialSubject | null;
};

export type SocialNetworkInfo = { value: SocialNetworkId; label: string; limit: number; connected: boolean };

export type SocialPostList = {
  data: SocialPost[];
  meta: {
    current_page: number; last_page: number; per_page: number; total: number;
    networks: SocialNetworkInfo[];
    statuses: { value: SocialPostStatus; label: string }[];
    waiting: number;
  };
};

/** `meta.open_url` on an approval: where the person finishes the share themselves. */
export type SocialApproval = { post: SocialPost; open_url: string | null };

export type LinkedInOrganization = { id: string; name: string | null };

/** `GET /admin/settings/social`. */
export type SocialAccountsStatus = {
  linkedin: {
    configured: boolean;
    connected: boolean;
    /** Connected, with a page chosen and a live token — the API will post. */
    ready: boolean;
    account: string | null;
    organization: LinkedInOrganization | null;
    expires_at: string | null;
    error: string | null;
    callback_path: string;
  };
};
