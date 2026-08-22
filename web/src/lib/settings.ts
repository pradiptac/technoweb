import "server-only";
import { apiFetch } from "@/lib/api";

/**
 * Public site settings — social links, contact details, company name.
 *
 * A flat key/value map rather than a typed shape per key: the settings table
 * is deliberately open-ended, and a caller asking for a key that has not been
 * set should get undefined rather than a type error.
 */
export type SiteSettings = Record<string, string | undefined>;

export async function getSiteSettings(): Promise<SiteSettings> {
  try {
    const res = await apiFetch<{ data: SiteSettings }>("/settings", {
      revalidate: 600,
      tags: ["settings"],
    });
    return res.data ?? {};
  } catch {
    // Settings decorate the chrome; they must never take a page down. The
    // footer renders without the social row and the site is otherwise intact.
    return {};
  }
}

/**
 * Parses a "value|label" per line setting into pairs.
 *
 * The hero and support stat rows are edited as a block of lines rather than
 * eight separate settings: they are changed together, and this way an editor
 * can drop one without leaving an empty slot behind. A line missing its pipe
 * is skipped rather than rendering half a stat.
 */
export function statPairs(raw: string | undefined, fallback: readonly { value: string; label: string }[] = []) {
  const pairs = (raw ?? "")
    .split("\n")
    .map((line) => line.split("|"))
    .filter((parts) => parts.length >= 2 && parts[0].trim() && parts[1].trim())
    .map(([value, label]) => ({ value: value.trim(), label: label.trim() }));

  return pairs.length ? pairs : [...fallback];
}
