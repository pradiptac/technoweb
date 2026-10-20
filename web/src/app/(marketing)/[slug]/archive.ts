import "server-only";
import { ApiError, publicApi } from "@/lib/api";
import type { ContentTypeSummary } from "@/types/api";

/**
 * The second thing a top-level slug can be: a custom content type's archive
 * (docs/custom-content.md). The catch-all asks for a CMS page first and this
 * only when there is none, the `products/[slug]/resolve.ts` idea — a page and
 * a type cannot share a slug (the API refuses a type named after a page), so
 * the order only matters for a page made *after* a type, and the page wins.
 *
 * A type with its archive switched off answers here as `null`, so the route
 * 404s while its entries stay reachable at `/{type}/{entry}`.
 */
export type Archive = { type: ContentTypeSummary; entries: Awaited<ReturnType<typeof publicApi.contentArchive>> };

/**
 * `filters` is a preset's (docs/content-presets.md): the investors page's
 * `?type=` and `?year=`. A filtered read is never ISR-cached — the key space
 * is open, and a cached empty answer would outlive the document that fills it.
 */
export async function loadArchive(slug: string, pageParam?: string, filters: { type?: string; year?: string } = {}): Promise<Archive | null> {
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (filters.type) params.set("type", filters.type.slice(0, 60));
  if (filters.year) params.set("year", filters.year.slice(0, 7));
  const query = params.size > 0 ? `?${params.toString()}` : "";

  try {
    const res = await publicApi.contentArchive(slug, query, !filters.type && !filters.year);
    if (!res.meta.type.archive_enabled) return null;
    return { type: res.meta.type, entries: res };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
