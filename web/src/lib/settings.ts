import "server-only";
import { apiFetch } from "@/lib/api";
import { brandName } from "@/lib/brand";
import type { SiteSettings } from "@/lib/site-settings";

// Re-exported so callers that already fetch from here do not need a second
// import for the type. The pure helpers live in site-settings.ts because the
// header is a client component and cannot import a `server-only` module.
export type { SiteSettings } from "@/lib/site-settings";
export { statPairs, telHref } from "@/lib/site-settings";

export async function getSiteSettings(): Promise<SiteSettings> {
  try {
    const res = await apiFetch<{ data: SiteSettings }>("/settings", {
      revalidate: 600,
      tags: ["settings"],
    });
    return withCompany(res.data ?? {});
  } catch {
    // Settings decorate the chrome; they must never take a page down. The
    // footer renders without the social row and the site is otherwise intact.
    return withCompany({});
  }
}

/**
 * The company is never missing: a blank `company_name` falls back to the
 * runtime `SITE_NAME` (`lib/brand.ts`), so every header, footer and client
 * component handed these settings names this install's owner rather than a
 * literal of its own.
 */
function withCompany(settings: SiteSettings): SiteSettings {
  return settings.company_name ? settings : { ...settings, company_name: brandName() };
}
