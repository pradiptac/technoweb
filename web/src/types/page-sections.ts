/**
 * The section page builder (2026-09-26, `docs/page-builder.md`).
 *
 * A page whose `template` is `builder` carries `sections` on its public read
 * — `App\Support\PageSections\SectionPresenter`'s shape: hidden sections
 * omitted, paths resolved to URLs with alt text and a focal point, a content
 * block inline, a slider/gallery/form as its current slug. The console edits
 * `blocks`, the stored shape (paths and ids), and posts it back whole.
 *
 * `type` is a plain string on the wire, the `Slider.layout` rule: the list is
 * the API's (`meta.section_types`) and a type this build does not know
 * renders nothing rather than failing a check nobody runs across the wire.
 */
import type { ContentBlock } from "./blocks";
import type { TeamMember } from "./api";
import type { SectionBackground } from "@/themes/options";

export type PageSectionType =
  | "hero" | "rich_text" | "media_text" | "features" | "cards" | "content_block"
  | "slider" | "gallery" | "form" | "faq" | "logos" | "testimonial" | "video" | "divider"
  /** The five self-contained bands of 0.107.0. */
  | "stats" | "steps" | "tabs" | "checklist" | "cta"
  /** The four of 0.109.0. */
  | "comparison" | "timeline" | "before_after" | "testimonials"
  /** The five of 0.111.0. */
  | "team" | "downloads" | "countdown" | "columns" | "map"
  /** One of the active theme's homepage sections, by its `HOME_SECTIONS` id (0.113.0). */
  | "theme_section"
  /** A scroll story (0.114.0): steps that scroll past a picture held beside them. */
  | "story"
  /** A library section placed linked (0.106.0): stored as `{saved_id}`, drawn as the library's section. */
  | "saved";

export type SectionButton = { label?: string | null; href?: string | null };

/** A picture as the public read carries it: the URL, its alt text and its focal point. */
type Picture<N extends string> = { [K in N]?: string | null } & { [K in `${N}_alt`]?: string } & { [K in `${N}_focus`]?: string | null };

export type HeroSectionData = Picture<"image"> & {
  kicker?: string; heading: string; lede?: string;
  layout: "split" | "centered" | "cover";
  primary?: SectionButton; secondary?: SectionButton;
};

export type RichTextSectionData = { heading?: string; body: string };

export type MediaTextSectionData = Picture<"image"> & {
  kicker?: string; heading: string; body?: string;
  media: "image" | "youtube" | "mp4";
  /** The eleven-character id — the API keeps nothing else. */
  youtube?: string | null;
  video?: string | null;
  side?: "left" | "right";
  primary?: SectionButton; secondary?: SectionButton;
};

export type FeatureItem = { icon?: string; title: string; body?: string; href?: string; link_label?: string };
export type FeaturesSectionData = { kicker?: string; heading?: string; lede?: string; columns?: 2 | 3 | 4; items: FeatureItem[] };

export type CardItem = {
  title: string; summary: string | null; path: string;
  image: string | null; image_alt: string | null; image_focus: string | null;
  icon: string | null; kicker: string | null; meta: string | null;
};
export type CardsSectionData = {
  kicker?: string; heading?: string; lede?: string;
  source: string; category?: string; limit?: number; columns?: 2 | 3 | 4;
  items: CardItem[];
  index_path: string | null;
};

export type ContentBlockSectionData = { block: ContentBlock };
export type EmbedSectionData = { heading?: string; lede?: string; slug: string };
export type FaqSectionData = { heading?: string; source: "page" | "custom"; items: { question: string; answer: string }[] };
export type LogosSectionData = { heading?: string; source: "clients" | "brands" };
export type TestimonialSectionData = Picture<"photo"> & { quote: string; name: string; role?: string };
export type VideoSectionData = { heading?: string; source: "youtube" | "mp4"; youtube?: string | null; video?: string | null; caption?: string };
export type DividerSectionData = { size?: "small" | "medium" | "large"; rule?: boolean };

type Head = { kicker?: string; heading?: string; lede?: string };
export type StatFigure = { value: string; label: string; icon?: string; percent?: number };
export type StatsSectionData = Head & { display: "figures" | "rings" | "bars"; columns?: 2 | 3 | 4; items: StatFigure[] };
export type StepItem = { title: string; body?: string; icon?: string };
export type StepsSectionData = Head & { layout: "vertical" | "horizontal"; items: StepItem[] };
export type TabItem = Picture<"image"> & { label: string; heading?: string; body: string };
export type TabsSectionData = Head & { items: TabItem[] };
export type ChecklistSectionData = Head & {
  columns?: 1 | 2 | 3; items: { text: string; icon?: string }[]; primary?: SectionButton; secondary?: SectionButton;
};
export type CtaSectionData = {
  kicker?: string; heading: string; lede?: string; tone?: "brand" | "accent";
  /** No second button: offer the site's "Call" button, as the theme's own band does. */
  call?: boolean;
  primary?: SectionButton; secondary?: SectionButton;
};

export type ComparisonSectionData = Head & {
  plans: { name: string; note?: string }[];
  /** The plan drawn as recommended, by position. */
  highlight?: number;
  /** One cell per plan, by position: "yes", "no", a few words, or null. */
  rows: { label: string; cells?: (string | null)[] }[];
  primary?: SectionButton;
};
export type TimelineSectionData = Head & { items: { date: string; title: string; body?: string }[] };
export type BeforeAfterSectionData = Picture<"before"> & Picture<"after"> & {
  heading?: string; lede?: string; before_label?: string; after_label?: string; start?: number; caption?: string;
};
export type TestimonialItem = Picture<"photo"> & { quote: string; name: string; role?: string };
export type TestimonialsSectionData = Head & { items: TestimonialItem[] };
/** The team as a live list — the public read carries `members` in `/team`'s shape. */
export type TeamSectionData = Head & { department?: string; limit?: number; group?: boolean; members?: TeamMember[] };
/** Each file resolved from the library: its address, size in bytes and extension. */
export type DownloadsSectionData = Head & { items: { title: string; note?: string; url: string; size?: number; extension?: string }[] };
/** `ends_at` is an instant with its offset; `ends_label` the API's words for it. */
export type CountdownSectionData = Head & {
  heading: string; ends_at: string; ends_label?: string; done_text?: string;
  primary?: SectionButton; secondary?: SectionButton;
};
export type ColumnsSectionData = Head & { columns: { heading?: string; body: string }[] };
/** `section` is an id from `HOME_SECTIONS` in `themes/options.ts`; the active theme draws it. */
export type ThemeSectionData = { section: string };
export type MapSectionData = { heading?: string; lede?: string; url: string; address?: string };

/**
 * One step of a scroll story as the public read carries it: the picture
 * resolved to its URL with alt text and focal point. Stored, the step holds
 * `image_path` instead (the console edits `StoredSection.data`).
 */
export type StoryItem = {
  title: string; body: string;
  image: string; image_alt: string | null; image_focus: string | null;
};
/** A scroll story (0.114.0): two to six steps, each with its own picture. */
export type StorySectionData = {
  kicker?: string | null; heading?: string | null; lede?: string | null;
  items: StoryItem[];
};

/**
 * How a section sits on the page (2026-10-05, `SectionRules::STYLE`): only
 * the keys that differ from the section's own behaviour are ever sent.
 */
export type SectionStyle = {
  pad_top?: "none" | "s" | "l" | "xl";
  pad_bottom?: "none" | "s" | "l" | "xl";
  width?: "medium" | "narrow";
  align?: "center";
  heading?: "s" | "l";
  /** An in-page link target: `/about#pricing`. */
  anchor?: string;
  /** The devices it shows on; absent is all three. */
  show_on?: ("phone" | "tablet" | "desktop")[];
  /** How the section's heading arrives as it scrolls into view (0.114.0). */
  headline?: "rise" | "wipe" | "shimmer";
  /** A scroll-linked effect on the whole section (0.114.0). */
  scroll?: "parallax" | "zoom" | "fade";
};

/** `reveal` is an id from `SECTION_REVEALS` (lib/motion-choices.ts), or null for the section's own default. */
type Of<T extends PageSectionType, D> = { id: string; type: T; background: SectionBackground | null; reveal?: string | null; style?: SectionStyle | null; data: D };

/** One section as the public site draws it. */
export type PageSection =
  | Of<"hero", HeroSectionData>
  | Of<"rich_text", RichTextSectionData>
  | Of<"media_text", MediaTextSectionData>
  | Of<"features", FeaturesSectionData>
  | Of<"cards", CardsSectionData>
  | Of<"content_block", ContentBlockSectionData>
  | Of<"slider", EmbedSectionData>
  | Of<"gallery", EmbedSectionData>
  | Of<"form", EmbedSectionData>
  | Of<"faq", FaqSectionData>
  | Of<"logos", LogosSectionData>
  | Of<"testimonial", TestimonialSectionData>
  | Of<"video", VideoSectionData>
  | Of<"divider", DividerSectionData>
  | Of<"stats", StatsSectionData>
  | Of<"steps", StepsSectionData>
  | Of<"tabs", TabsSectionData>
  | Of<"checklist", ChecklistSectionData>
  | Of<"cta", CtaSectionData>
  | Of<"comparison", ComparisonSectionData>
  | Of<"timeline", TimelineSectionData>
  | Of<"before_after", BeforeAfterSectionData>
  | Of<"testimonials", TestimonialsSectionData>
  | Of<"team", TeamSectionData>
  | Of<"downloads", DownloadsSectionData>
  | Of<"countdown", CountdownSectionData>
  | Of<"columns", ColumnsSectionData>
  | Of<"map", MapSectionData>
  | Of<"theme_section", ThemeSectionData>
  | Of<"story", StorySectionData>;

/** A section as stored and edited: paths and ids, and whatever the type's fields are. */
export type StoredSection = {
  id: string;
  type: PageSectionType | string;
  hidden: boolean;
  background: SectionBackground | null;
  reveal?: string | null;
  style?: SectionStyle | null;
  data: Record<string, unknown>;
};

export type SectionTypeOption = { value: PageSectionType; label: string; blurb: string };
export type SectionPreset = { value: string; label: string; blurb: string; sections: Omit<StoredSection, "id">[] };

/** `GET /admin/pages/builder`: everything the builder's selects are drawn from. */
export type PageBuilderOptions = {
  section_types: SectionTypeOption[];
  section_presets: SectionPreset[];
  hero_layouts: { value: string; label: string; blurb: string }[];
  card_sources: { value: string; label: string }[];
  content_blocks: { id: number; name: string; slug: string; type: string; type_label: string }[];
  sliders: { id: number; name: string; slug: string }[];
  galleries: { id: number; name: string; slug: string }[];
  forms: { id: number; name: string; slug: string }[];
  product_categories: { id: number; name: string; slug: string }[];
  store_categories: { id: number; name: string; slug: string }[];
  /** The section library and the page templates (0.106.0). Optional for an older API. */
  library?: {
    sections: { id: number; name: string; type: string | null }[];
    templates: { id: number; name: string; description: string | null; count: number }[];
  };
};

/** A library item (`/admin/saved-sections`, 0.106.0). */
export type SavedSection = {
  id: number;
  kind: "section" | "template";
  name: string;
  description: string | null;
  type: string | null;
  type_label: string | null;
  count: number;
  author?: string | null;
  updated_at: string | null;
  /** Detail only. */
  blocks?: StoredSection[];
  blocks_media?: Record<string, string>;
  linked_from?: { id: number; title: string; kind: "page" | "template" }[];
};
