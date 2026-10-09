import "server-only";
import { cache } from "react";

/**
 * One request's worth of "render this draft instead of asking the API".
 *
 * A draft share link (`/preview/<token>`, 0.138.0) renders the **real** detail
 * page of whatever record it opens. Those pages fetch their record from the
 * public endpoint, which answers 404 for a draft; so the preview route names
 * the record here first, and the twelve `publicApi` detail fetchers ask this
 * store before they ask the API. Nothing about the pages themselves knows a
 * preview exists, which is the point: a second copy of each page would be
 * twelve places to forget a field.
 *
 * `cache()` scopes the store to the request — the pattern `forcePreviewTheme`
 * uses (`themes/index.ts`) — so a visitor's request on the real site, which
 * never calls `setPreviewRecord`, sees an empty map and every fetcher behaves
 * exactly as it did. The preview page fills it after its own lookup and
 * **before it returns the detail page as its child** — the child is the only
 * reader, and it renders after its parent has returned, so the order is fixed
 * by the tree rather than by a race.
 */
export type PreviewKind =
  | "page"
  | "post"
  | "knowledge-article"
  | "case-study"
  | "solution"
  | "service"
  | "product"
  | "store-product"
  | "event"
  | "career"
  | "entry"
  | "landing-page";

const store = cache(() => ({ records: new Map<string, unknown>() }));

const keyOf = (kind: PreviewKind, key: string) => `${kind}:${key}`;

export function setPreviewRecord(kind: PreviewKind, key: string, record: unknown): void {
  store().records.set(keyOf(kind, key), record);
}

export function previewRecord<T>(kind: PreviewKind, key: string): T | null {
  const hit = store().records.get(keyOf(kind, key));
  return hit === undefined ? null : (hit as T);
}

/** Whether this request is rendering a draft from a share link. */
export function isPreviewing(): boolean {
  return store().records.size > 0;
}
