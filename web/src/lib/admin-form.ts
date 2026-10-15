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
 * A record's Sections tab (0.129.0, `RecordSectionsPanel`), as the two keys
 * the API takes: which of the two its page shows, and the builder's list.
 * Nothing when the form posted no `blocks` control — a form without the tab
 * leaves both alone, the rule `custom_fields` follows.
 */
export function sectionsFromFormData(formData: FormData): {
  body_layout?: import("@/types/page-sections").RecordBodyLayout;
  blocks?: import("@/types/page-sections").StoredSection[];
} {
  if (!formData.has("blocks")) return {};

  return {
    body_layout: str(formData, "body_layout") === "sections" ? "sections" : "body",
    blocks: jsonListFromFormData<import("@/types/page-sections").StoredSection>(formData, "blocks"),
  };
}

/**
 * The Fields tab's inputs, as the `custom_fields` object the API takes.
 *
 * `CustomFieldsPanel` names every control `cf__<key>` and posts one hidden
 * `custom_fields_schema` — `[{key, kind}]` — so this knows how each key was
 * submitted: several checkboxes under one name, a switch's hidden "0" with
 * its checkbox's "1" after it, a list's one JSON value. The controls stay the
 * ordinary primitives (`EditorField`, `CoverField`, `StringListField`), each
 * posting its own named input, which is what lets `<Form>` put a refused
 * submission back and `FormDraft` restore one.
 *
 * Returns `{}` when the panel was not on the form, so the key is absent from
 * the payload and the API leaves every value alone. A blank control sends
 * `null`, which clears that one field.
 */
export function customFieldsFromFormData(formData: FormData): { custom_fields?: Record<string, unknown> } {
  const raw = str(formData, "custom_fields_schema");
  if (!raw) return {};

  let schema: { key: string; kind: string }[];
  try {
    const parsed = JSON.parse(raw);
    schema = Array.isArray(parsed) ? parsed : [];
  } catch {
    return {};
  }

  const out: Record<string, unknown> = {};

  for (const { key, kind } of schema) {
    if (typeof key !== "string" || !/^[a-z][a-z0-9_]*$/.test(key)) continue;
    const name = `cf__${key}`;

    switch (kind) {
      case "multi_select":
        out[key] = formData.getAll(name).filter((v): v is string => typeof v === "string" && v !== "");
        break;
      case "boolean": {
        // The hidden "0" comes first and the checkbox's "1" after it.
        const values = formData.getAll(name);
        out[key] = values[values.length - 1] === "1";
        break;
      }
      case "list":
        out[key] = jsonListFromFormData<string>(formData, name);
        break;
      case "relation": {
        const id = Number(str(formData, name));
        out[key] = Number.isInteger(id) && id > 0 ? id : null;
        break;
      }
      default:
        out[key] = str(formData, name);
    }
  }

  return { custom_fields: out };
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
