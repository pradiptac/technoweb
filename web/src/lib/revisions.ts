import type { RevisionSnapshot, RevisionType } from "@/types/revisions";

/**
 * Restoring a version is the console loading it into the edit form, never a
 * server write (docs/page-builder.md "Page history"). The history dialog
 * announces this event on `document`; whatever form holds the record listens:
 * `FormDraft` for a page (its fields are real inputs), `LibraryEditor` for a
 * library item (its fields are state).
 */
export const REVISION_LOAD_EVENT = "tw:revision-load";

export type RevisionLoad = {
  type: RevisionType;
  id: number;
  /** When the version was saved, for the banner. */
  at: string | null;
  snapshot: RevisionSnapshot;
  /** Picture path → URL for the version's sections. */
  media: Record<string, string>;
};

export function announceRevisionLoad(detail: RevisionLoad) {
  document.dispatchEvent(new CustomEvent<RevisionLoad>(REVISION_LOAD_EVENT, { detail }));
}

/**
 * A page's snapshot as the page form's controls name them — the same
 * `Record<name, values[]>` shape `FormDraft` keeps, so the one restore path
 * writes it. `status` and `published_at` are not in a snapshot and are never
 * touched: restoring a version must not publish or unpublish anything.
 */
export function pageSnapshotValues(snapshot: RevisionSnapshot): Record<string, string[]> {
  return {
    title: [snapshot.title ?? ""],
    slug: [snapshot.slug ?? ""],
    body: [snapshot.body ?? ""],
    template: [snapshot.template || "default"],
    blocks: [JSON.stringify(snapshot.blocks ?? [])],
  };
}
