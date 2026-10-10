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
  /** Column → control name, where a form names a column differently (`meta.fields`). */
  fields?: Record<string, string>;
  snapshot: RevisionSnapshot;
  /** Picture path → URL for the version's sections. */
  media: Record<string, string>;
};

export function announceRevisionLoad(detail: RevisionLoad) {
  document.dispatchEvent(new CustomEvent<RevisionLoad>(REVISION_LOAD_EVENT, { detail }));
}

/**
 * A version’s snapshot as the edit form’s controls name them — the same
 * `Record<name, values[]>` shape `FormDraft` keeps, so the one restore path
 * writes it, for a page and for every other kind of record (0.148.0).
 *
 * A column is posted under its own name by every form; `fields` (the API’s
 * `meta.fields`) says where one is not. A list (the sections) goes as the JSON
 * the hidden `blocks` control holds, an absent value as an empty string, and a
 * page’s empty `template` as `default`. `status` and `published_at` are not in
 * a snapshot and are never touched: restoring a version must not publish or
 * unpublish anything. A column the form has no control for (a shop product’s
 * sections, for an account without the Content manager role; an entry type
 * without a body) is simply not written.
 */
export function snapshotValues(snapshot: RevisionSnapshot, fields: Record<string, string> = {}): Record<string, string[]> {
  const values: Record<string, string[]> = {};

  for (const [column, value] of Object.entries(snapshot)) {
    const name = fields[column] ?? column;

    if (column === "blocks") values[name] = [JSON.stringify(Array.isArray(value) ? value : [])];
    else if (column === "template") values[name] = [typeof value === "string" && value ? value : "default"];
    else if (column === "body_layout") values[name] = [value === "sections" ? "sections" : "body"];
    else values[name] = [typeof value === "string" ? value : ""];
  }

  return values;
}
