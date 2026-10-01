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
import type { SectionBackground } from "@/themes/options";

export type PageSectionType =
  | "hero" | "rich_text" | "media_text" | "features" | "cards" | "content_block"
  | "slider" | "gallery" | "form" | "faq" | "logos" | "testimonial" | "video" | "divider";

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

/** `reveal` is an id from `SECTION_REVEALS` (lib/motion-choices.ts), or null for the section's own default. */
type Of<T extends PageSectionType, D> = { id: string; type: T; background: SectionBackground | null; reveal?: string | null; data: D };

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
  | Of<"divider", DividerSectionData>;

/** A section as stored and edited: paths and ids, and whatever the type's fields are. */
export type StoredSection = {
  id: string;
  type: PageSectionType | string;
  hidden: boolean;
  background: SectionBackground | null;
  reveal?: string | null;
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
};
