"use client";

import { useActionState, useState } from "react";

import { MentionField } from "@/components/admin/mention-field";
import { deleteRecordNoteAction, postRecordNoteAction, type RecordNotesState } from "@/components/admin/record-notes-actions";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Alert } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { formatDate } from "@/lib/dates";
import { mentionSegments } from "@/lib/mentions";
import type { RecordNote } from "@/lib/admin";
import type { RevisionType } from "@/types/revisions";

/**
 * The record's team thread (C2): who wrote what, oldest first, and a note box
 * that can @-mention a colleague who can open this screen. The body is plain
 * text, drawn as React text spans — a mentioned name is a bold run, nothing
 * is parsed as markup. The dialog renders in the top layer, so its form never
 * sits inside the record's.
 */
export function RecordNotesDialog({ type, id, initial, className }: { type: RevisionType; id: number; initial: RecordNote[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(initial);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // A posted note comes back as the whole thread. React empties the box after a successful action; <Form> keeps it on a refusal.
  const [state, formAction, pending] = useActionState<RecordNotesState, FormData>(async (prev, formData) => {
    const out = await postRecordNoteAction(type, id, prev, formData);
    if (out.notes) setNotes(out.notes);
    return out;
  }, {});

  const remove = async (noteId: number) => {
    if (!window.confirm("Delete this note?")) return;
    setDeleting(noteId);
    setDeleteError(null);
    const out = await deleteRecordNoteAction(type, id, noteId);
    setDeleting(null);
    if (out.notes) setNotes(out.notes);
    else setDeleteError(out.error ?? "We could not delete the note. Try again.");
  };

  const count = notes.length;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className={className}
        onClick={() => setOpen(true)}
        aria-label={count ? `Team notes, ${count}` : "Team notes"}
        title="Notes for the team about this record"
      >
        {count ? `Team notes (${count})` : "Team notes"}
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Team notes" size="side" dataAttr="record-notes">
        <div className="grid gap-4">
          {deleteError && <Alert tone="err" title="Not deleted" dismissible={false}>{deleteError}</Alert>}

          {count === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-14 font-semibold text-ink">No notes yet</p>
              <p className="mt-1 text-13 text-muted">Notes are for the team: ask a colleague about this record, or leave context for whoever edits it next.</p>
            </div>
          ) : (
            <ol className="grid gap-3">
              {notes.map((note) => (
                <li key={note.id} className="rounded-lg border border-line-strong bg-card px-3 py-2.5">
                  <p className="text-12 text-muted">
                    <span className="font-semibold text-ink">{note.author_name ?? "Somebody"}</span>
                    {note.created_at && ` · ${formatDate(note.created_at, "dateTime")}`}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-14 text-ink [overflow-wrap:anywhere]">
                    {mentionSegments(note.body, note.mentioned.map((m) => m.name)).map((s, i) =>
                      s.mention ? <span key={i} className="font-semibold text-brand-ink">{s.text}</span> : <span key={i}>{s.text}</span>,
                    )}
                  </p>
                  {note.can_delete && (
                    <button
                      type="button"
                      onClick={() => void remove(note.id)}
                      disabled={deleting !== null}
                      className="mt-1 text-12 font-semibold text-err hover:underline disabled:opacity-60"
                    >
                      {deleting === note.id ? "Deleting…" : "Delete"}
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}

          <Form action={formAction} state={state}>
            {state.error && !state.fieldErrors?.body && <Alert tone="err" title="Note not saved" dismissible={false}>{state.error}</Alert>}
            <MentionField
              scope={type}
              id={`record-note-${type}-${id}`}
              name="body"
              label="Add a note"
              maxLength={2000}
              required
              error={state.fieldErrors?.body?.[0]}
              hint="Type @ to mention a colleague; they are told in their bell."
            />
            <Button type="submit" size="sm" pending={pending}>
              {pending ? "Posting…" : "Post note"}
            </Button>
          </Form>
        </div>
      </Modal>
    </>
  );
}
