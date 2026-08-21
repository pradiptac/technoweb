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
