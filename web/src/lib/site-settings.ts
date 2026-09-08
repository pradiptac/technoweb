/**
 * The shape of site settings, and the pure helpers for reading them.
 *
 * Deliberately separate from `lib/settings.ts`, which is `server-only`
 * because it fetches. The header is a client component and needs `telHref`;
 * importing it from the fetching module pulls `server-only` into the client
 * bundle and the whole page 500s.
 *
 * Nothing here touches the network, so it is safe on both sides.
 */

/**
 * A flat key/value map rather than a typed shape per key: the settings table
 * is deliberately open-ended, and a caller asking for a key that has not been
 * set should get undefined rather than a type error.
 */
export type SiteSettings = Record<string, string | undefined>;

/**
 * Read a boolean setting.
 *
 * Settings arrive as strings, and `"0"` is truthy in JavaScript — so
 * `if (settings.registration_enabled)` is true for a toggle that is switched
 * *off*. That is not a mistake anyone makes twice, and it is not one anyone
 * spots by reading either, so the comparison lives here rather than at each
 * call site.
 *
 * An unset value takes `fallback`, because a setting the API has not been
 * taught to return yet must not silently disable a feature.
 */
export function settingEnabled(
  settings: SiteSettings,
  key: string,
  fallback = true,
): boolean {
  const raw = settings[key];
  if (raw === undefined || raw === "") return fallback;

  return raw !== "0" && raw.toLowerCase() !== "false";
}

/**
 * The areas of the site that can carry a page banner.
 *
 * One per top-level entry in the navigation, plus `company` for the pages
 * that have no menu of their own — About, Contact, Careers. A page names its
 * own area rather than the area being derived from the URL: `/blog` and
 * `/case-studies` both live under Resources, and a path-to-section table
 * would be a second list of routes to keep in step with `mainNav`.
 */
export type BannerSection =
  | "solutions"
  | "products"
  | "services"
  | "industries"
  | "store"
  | "support"
  | "resources"
  | "company";

/**
 * The banner behind a page heading, or null for no banner.
 *
 * The section's own picture, then the site-wide default, then nothing — so a
 * single upload dresses every section and an area is differentiated only when
 * somebody chooses to. Nothing set means the heading renders exactly as it
 * did before banners existed, which is what makes the whole feature additive.
 *
 * `||`, not `??`. A path cleared in the console is stored as an empty string
 * and `??` only falls through on **null**, so a blanked section banner would
 * beat a perfectly good default and the page would render with none at all.
 * That is the newsletter footer's address bug, and it has now been made three
 * times in this codebase.
 */
export function bannerFor(settings: SiteSettings, section?: BannerSection): string | null {
  if (!section) return null;
  if (!settingEnabled(settings, "banner_enabled", true)) return null;

  return settings[`banner_${section}_url`] || settings.banner_default_url || null;
}

/**
 * A phone number as a `tel:` href.
 *
 * Strips everything a person types for legibility — spaces, brackets,
 * hyphens — since a dialler will not accept them, while keeping a leading
 * `+` so an international number still works.
 */
export function telHref(phone: string): string {
  return `tel:${phone.trim().replace(/(?!^\+)[^\d]/g, "")}`;
}

/**
 * Parses a "value|label" per line setting into pairs.
 *
 * The hero and support stat rows are edited as a block of lines rather than
 * eight separate settings: they change together, and this way an editor can
 * drop one without leaving an empty slot behind. A line missing its pipe is
 * skipped rather than rendering half a stat.
 */
export function statPairs(
  raw: string | undefined,
  fallback: readonly { value: string; label: string }[] = [],
) {
  const pairs = (raw ?? "")
    .split("\n")
    .map((line) => line.split("|"))
    .filter((parts) => parts.length >= 2 && parts[0].trim() && parts[1].trim())
    .map(([value, label]) => ({ value: value.trim(), label: label.trim() }));

  return pairs.length ? pairs : [...fallback];
}
