import "server-only";
import { ApiError, publicApi } from "@/lib/api";
import type { ContentEntry, ContentTypeSummary, Paginated } from "@/types/api";

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
export type Archive = { type: ContentTypeSummary; entries: Paginated<ContentEntry> };

export async function loadArchive(slug: string, pageParam?: string): Promise<Archive | null> {
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  try {
    const res = await publicApi.contentArchive(slug, page > 1 ? `?page=${page}` : "");
    if (!res.meta.type.archive_enabled) return null;
    return { type: res.meta.type, entries: res };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
