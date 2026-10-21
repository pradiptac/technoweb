import { getRecordNotes } from "@/lib/admin";
import { RecordNotesDialog } from "@/components/admin/record-notes-dialog";
import type { RevisionType } from "@/types/revisions";

/**
 * "Team notes" on an edit screen (C2, docs/notifications.md). A server
 * component in the `PageHeader` row beside History — never inside the
 * record's `<Form>` or `<Tabs>`. Renders nothing when this account cannot read
 * the thread; an empty thread still draws the button, since writing the first
 * note is the point.
 */
export async function RecordNotesPanel({ type, id, className }: { type: RevisionType; id: number; className?: string }) {
  const notes = await getRecordNotes(type, id);
  if (notes === null) return null;

  return <RecordNotesDialog type={type} id={id} initial={notes} className={className} />;
}
