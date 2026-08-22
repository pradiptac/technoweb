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
