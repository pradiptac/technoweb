/**
 * Shared helpers for the CMS forms. Plain functions, imported by the
 * "use server" action files of every entity.
 */

/** Trimmed string, or null — never "". */
export function str(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  const s = typeof value === "string" ? value.trim() : "";
  return s === "" ? null : s;
}

const SEO_TEXT_FIELDS = [
  "title", "description", "canonical_url", "robots", "focus_keyword",
  "og_title", "og_description", "og_image_path", "schema_type",
] as const;

/**
 * Reads the SeoPanel fields.
 *
 * Returns null when the editor never entered anything, so an untouched panel
 * does not leave an all-null override row behind. Excluding something from the
 * sitemap is a deliberate act, so that alone counts as having said something.
 */
export function seoFromFormData(
  formData: FormData,
): Record<string, string | boolean | string[] | null> | null {
  const seo: Record<string, string | boolean | string[] | null> = {};
  for (const key of SEO_TEXT_FIELDS) seo[key] = str(formData, `seo_${key}`);
  seo.sitemap_include = formData.get("seo_sitemap_include") === "1";

  /*
    Split here, once.

    The field is comma-separated because that is what an editor types, and the
    API takes an array because a stored delimiter is a decision every later
    reader has to make the same way — the scorer, the resource and the console
    would each have to split it, and one of them eventually splits on the wrong
    character. Doing it at the boundary means only this line knows.

    De-duplicated with order kept: the first phrase typed is the one that
    matters most, and `media.tags` normalises the same way for the same reason.
  */
  const keywords = str(formData, "seo_secondary_keywords");
  seo.secondary_keywords = keywords
    ? [...new Set(keywords.split(",").map((k) => k.trim()).filter(Boolean))].slice(0, 10)
    : [];

  const touched = SEO_TEXT_FIELDS.some((k) => seo[k] !== null)
    || (seo.secondary_keywords as string[]).length > 0
    || seo.sitemap_include === false;

  return touched ? seo : null;
}

/**
 * Reads a repeater that submitted its rows as one hidden JSON value —
 * StringListField, ResultsField, FaqField.
 *
 * Anything unparseable becomes an empty list rather than throwing: a
 * malformed hidden field should not cost the editor the rest of the form,
 * and the API validates the contents regardless.
 */
export function jsonListFromFormData<T>(formData: FormData, key: string): T[] {
  const raw = str(formData, key);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/**
 * A comma-separated tag field to the array the API stores.
 * Deduplicated and order-preserving, so "wifi, Wi-Fi, wifi" is not three tags.
 */
export function tagsFromFormData(formData: FormData, key = "tags"): string[] {
  const raw = str(formData, key);
  if (!raw) return [];

  const seen = new Set<string>();
  const out: string[] = [];

  for (const tag of raw.split(",")) {
    const t = tag.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }

  return out;
}
