/**
 * Content blocks (2026-09-24) — CTA banners, stat bars, pricing tables and
 * technology stacks. One record shape, `type` + `layout` + `content`, from
 * `App\Http\Resources\ContentBlockResource` (public) and
 * `Admin\ContentBlockAdminResource` (the console).
 *
 * The field is `content`, not `data`: a Laravel resource whose array holds a
 * `data` key is not wrapped, and every read here is `{ data: … }`.
 *
 * Layouts are plain strings, the `Slider.layout` rule: the lists are the
 * API's enums, sent as `meta.layouts`, and an unknown value renders nothing
 * rather than failing a type check nobody runs across the wire.
 */

export type BlockType = "cta" | "stats" | "pricing" | "stack";

export type BlockLink = { label?: string | null; href?: string | null };

/** A CTA's words, buttons and whatever its layout adds. Every field is plain text. */
export type CtaContent = {
  kicker?: string | null;
  heading: string;
  body?: string | null;
  primary?: BlockLink | null;
  /** `call` is "Call {phone}" from Settings — the band's second button as it always was. */
  secondary_mode?: "call" | "link" | "none" | null;
  secondary?: BlockLink | null;
  // split
  image?: string | null;
  image_alt?: string;
  image_focus?: string | null;
  image_side?: "left" | "right" | null;
  // two_path
  paths?: { icon?: string | null; title: string; body?: string | null; cta: BlockLink }[];
  // reassurance
  promises?: string[];
  // newsletter / gated_download / webinar
  placeholder?: string | null;
  button_label?: string | null;
  /** A gated download's file is never in the public read; this says there is one. */
  has_download?: boolean;
  // countdown
  ends_at?: string | null;
  expired?: "hide" | "message" | null;
  expired_message?: string | null;
  // webinar
  starts_at?: string | null;
  duration_minutes?: number | null;
  where?: string | null;
  // hiring
  limit?: number | null;
  // app_qr
  url?: string | null;
  ios_url?: string | null;
  android_url?: string | null;
  qr?: string | null;
};

export type StatItem = {
  value: string;
  label: string;
  icon?: string | null;
  description?: string | null;
  badge?: string | null;
  series?: number[] | null;
  percent?: number | null;
  delta?: string | null;
  anomaly?: boolean | null;
};

export type StatsContent = {
  kicker?: string | null;
  heading?: string | null;
  heading_emphasis?: string | null;
  lede?: string | null;
  items: StatItem[];
  recognitions?: { icon?: string | null; score: string; name: string }[] | null;
};

export type PricingPlan = {
  name: string;
  badge?: string | null;
  description?: string | null;
  price_monthly_paise?: number | null;
  price_yearly_paise?: number | null;
  price_label?: string | null;
  period?: string | null;
  features?: string[] | null;
  cta?: BlockLink | null;
  highlighted?: boolean | null;
};

export type PricingSet = {
  label: string;
  plans: PricingPlan[];
  /** Comparison rows: one cell per plan — `yes`, `no` or a short text. */
  rows?: { label: string; group?: string | null; cells: (string | null)[] }[] | null;
};

export type PricingContent = {
  kicker?: string | null;
  heading?: string | null;
  lede?: string | null;
  billing?: { enabled?: boolean | null; monthly_label?: string | null; yearly_label?: string | null; yearly_note?: string | null } | null;
  sets: PricingSet[];
};

/** A technology on the stack, as the public read resolves it. */
export type StackItem = {
  label: string;
  type?: string | null;
  badge?: string | null;
  description?: string | null;
  weight?: number | null;
  icon?: string | null;
  /** A media-library picture, or a brand's own logo. */
  image?: string | null;
  /** True when `image` is a catalogue brand's logo (drawn on a light disc in dark). */
  brand?: boolean;
  colour?: string | null;
  href?: string | null;
};

export type StackGroup = {
  name: string;
  speed_seconds?: number | null;
  direction?: "cw" | "ccw" | null;
  items: StackItem[];
};

export type StackContent = {
  kicker?: string | null;
  heading?: string | null;
  lede?: string | null;
  center?: { image: string | null; image_alt?: string } | null;
  groups: StackGroup[];
};

type BlockBase = { id: number; name: string; slug: string; layout: string; updated_at?: string | null };

/** A published block, as a shortcode or the default band receives it. */
export type ContentBlock =
  | (BlockBase & { type: "cta"; content: CtaContent })
  | (BlockBase & { type: "stats"; content: StatsContent })
  | (BlockBase & { type: "pricing"; content: PricingContent })
  | (BlockBase & { type: "stack"; content: StackContent });

export type BlockLayoutOption = { value: string; label: string; blurb: string };

export type BlockMeta = {
  types: { value: BlockType; label: string; plural: string }[];
  layouts: Record<BlockType, BlockLayoutOption[]>;
};

/** A block as the console edits it: `content` as stored — paths and brand ids — plus previews. */
export type AdminContentBlock = {
  id: number;
  type: BlockType;
  layout: string;
  name: string;
  slug: string;
  status: "draft" | "published" | "archived";
  is_default: boolean;
  shortcode: string;
  content: Record<string, unknown>;
  /** A URL for every stored `*_path` in `content`. */
  media: Record<string, string>;
  /** The public shape, for the Preview dialog. */
  preview: Record<string, unknown>;
  created_at?: string | null;
  updated_at?: string | null;
};
