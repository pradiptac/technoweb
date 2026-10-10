import { getRevisions } from "@/lib/admin";
import { RevisionDialog } from "@/components/admin/revision-dialog";
import type { RevisionType } from "@/types/revisions";

/**
 * "History" on an edit screen (0.145.0, `docs/page-builder.md` "Page
 * history"): reads the record's saved versions and hands them to the dialog.
 *
 * A server component that sits in the `PageHeader` row beside
 * `PreviewLinkPanel` — never inside the record's `<Form>` (the dialog has
 * buttons of its own, and a form inside a form is invalid markup) and never as
 * a child of `<Tabs>`, which reads its children by position. Renders nothing
 * when this account cannot read the history, or the record has none yet.
 */
export async function RevisionPanel({
  type, id, pageId = null, className,
}: {
  type: RevisionType;
  id: number;
  /** The page the sections belong to, for the preview; null for a library item. */
  pageId?: number | null;
  className?: string;
}) {
  const read = await getRevisions(type, id);
  if (!read || read.data.length === 0) return null;

  return <RevisionDialog type={type} id={id} pageId={pageId} initial={read.data} meta={read.meta} className={className} />;
}
