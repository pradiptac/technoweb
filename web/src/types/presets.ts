/**
 * Content-type presets (docs/content-presets.md): the newsroom, the coverage,
 * investors, testimonials and awards. A preset type is an ordinary custom
 * content type whose locked fields its own layout reads from `custom_data`.
 */

export type PresetKey = "newsroom_releases" | "newsroom_coverage" | "investors" | "testimonials" | "awards";
export type InstallKey = "newsroom" | "investors" | "testimonials" | "awards";

/** A file field's resolved value. */
export type PresetFile = { url: string; name: string; mime?: string | null };

/** A picture field's resolved value. */
export type PresetPicture = {
  url: string; alt: string | null; focus: string | null; blur?: string | null;
  width?: number | null; height?: number | null;
};

export type ReleaseData = { dateline?: string; release_pdf?: PresetFile; contact_name?: string; contact_email?: string; contact_phone?: string };
export type CoverageData = { publication?: string; article_url?: string; publication_logo?: PresetPicture; coverage_date?: string };
export type InvestorData = { document_type?: string; financial_year?: string; document?: PresetFile; document_date?: string };
export type TestimonialData = { quote?: string; role?: string; company?: string; photo?: PresetPicture; company_logo?: PresetPicture; featured?: boolean };
export type AwardData = { awarding_body?: string; year?: number | string; category?: string; badge?: PresetPicture; link?: string };

/** One row of a "From a preset" builder section. */
export type PresetRow = {
  id: number; title: string; slug: string; path: string; summary: string | null; published_at: string | null;
  image: string | null; image_alt?: string | null; image_focus?: string | null; image_blur?: string | null;
  custom_data?: Record<string, unknown>;
};

/** A document type's value and the words it is shown as. */
export type PresetOption = { value: string; label: string };

/** One tile of the console's presets strip. */
export type PresetTile = {
  key: InstallKey;
  label: string;
  blurb: string;
  slug: string;
  types: { preset: PresetKey; plural: string; slug: string; fields: { key: string; label: string; kind: string }[] }[];
  installed: { id: number; slug: string } | null;
  /** Why the default address cannot be used, or null. */
  clash: string | null;
};

/** A preset type's own settings row (`/admin/content-types/{id}/preset-settings`). */
export type PresetSetting = { key: string; value: string | null; type: string };
export type PresetSettingsMeta = { download_categories?: { id: number; name: string }[] };

/** Read one custom field's value off an entry, typed by the caller. */
export function presetValue<T>(data: Record<string, unknown> | undefined, key: string): T | undefined {
  const v = data?.[key];
  return v === null || v === undefined || v === "" ? undefined : (v as T);
}
