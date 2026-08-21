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
  "og_title", "og_description", "schema_type",
] as const;

/**
 * Reads the SeoPanel fields.
 *
 * Returns null when the editor never entered anything, so an untouched panel
 * does not leave an all-null override row behind. Excluding something from the
 * sitemap is a deliberate act, so that alone counts as having said something.
 */
export function seoFromFormData(formData: FormData): Record<string, string | boolean | null> | null {
  const seo: Record<string, string | boolean | null> = {};
  for (const key of SEO_TEXT_FIELDS) seo[key] = str(formData, `seo_${key}`);
  seo.sitemap_include = formData.get("seo_sitemap_include") === "1";

  const touched = SEO_TEXT_FIELDS.some((k) => seo[k] !== null) || seo.sitemap_include === false;

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
