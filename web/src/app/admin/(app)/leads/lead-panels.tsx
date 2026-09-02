"use client";

import { useActionState, useState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Badge, leadBandTone } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import {
  addLeadNoteAction, deleteLeadAction, updateLeadAction, type LeadActionState,
} from "./actions";
import type { AdminLead, LeadScoreReason } from "@/lib/admin";

const initial: LeadActionState = {};

/** `2026-09-02T…` → `2026-09-02`, which is what a date input wants. */
function dateValue(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

/**
 * The pipeline panel: status, owner, follow-up, value, and a note.
 *
 * One form and one request. These are decided together — "I called them, it is
 * worth about two lakh, chase on Friday" is a single thought — and four
 * separate saves would put four lines in a trail that is read as a story.
 */
export function LeadPipeline({
  lead,
  statuses,
  assignees,
}: {
  lead: AdminLead;
  /** The fallback: every status, for a response that carried no `allowed_next`. */
  statuses: { value: string; label: string }[];
  assignees: { id: number; name: string }[];
}) {
  const action = updateLeadAction.bind(null, lead.id);
  const [state, formAction, pending] = useActionState(action, initial);

  // Only the moves the API will accept, with the current status first so the
  // select can show what the lead is now.
  const options = lead.allowed_next ?? statuses;

  return (
    <Form action={formAction} state={state} className="rounded-lg border border-line-strong bg-card p-4">
      <h2 className="mb-3 text-[13px] font-semibold">Pipeline</h2>

      {/*
        An `Alert`, not a toast. A refused move is about this form — it names
        the two states and has to still be on screen while somebody picks a
        different one.
      */}
      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}

      <Field label="Status" htmlFor="status" variant="float-static">
        <Select id="status" name="status" defaultValue={lead.status}>
          {options.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
      </Field>

      <Field label="Owner" htmlFor="assigned_to" variant="float-static">
        <Select id="assigned_to" name="assigned_to" defaultValue={lead.assigned_to ?? ""}>
          <option value="">Unassigned</option>
          {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      </Field>

      <Field
        label="Follow up on"
        htmlFor="follow_up_at"
        variant="float-static"
        hint="A date in the past puts this in the overdue queue."
      >
        <Input id="follow_up_at" name="follow_up_at" type="date" defaultValue={dateValue(lead.follow_up_at)} />
      </Field>

      <Field label="Estimated value (₹)" htmlFor="value_rupees" hint="Roughly what this is worth if it closes. Optional.">
        <Input
          id="value_rupees"
          name="value_rupees"
          inputMode="decimal"
          defaultValue={lead.value_paise === null ? "" : (lead.value_paise / 100).toFixed(2)}
        />
      </Field>

      <Field label="Add a note with this change" htmlFor="note">
        <Textarea id="note" name="note" rows={3} placeholder="Called, sending a quotation on Monday…" />
      </Field>

      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
    </Form>
  );
}

/** The trail, and a box to add to it. */
export function LeadNotes({ lead }: { lead: AdminLead }) {
  const action = addLeadNoteAction.bind(null, lead.id);
  const [state, formAction, pending] = useActionState(action, initial);
  const notes = lead.notes ?? [];

  return (
    <section className="rounded-lg border border-line-strong bg-card p-4">
      <h2 className="mb-3 text-[13px] font-semibold">History</h2>

      {notes.length === 0 ? (
        <p className="mb-3 text-[13px] text-muted">Nothing recorded yet.</p>
      ) : (
        <ol className="mb-4 flex flex-col gap-3">
          {notes.map((note) => (
            <li key={note.id} className="border-l-2 border-line-strong pl-3">
              <p className="text-[12px] text-faint">
                {note.actor_name || "Someone"}
                {note.created_at && ` · ${new Date(note.created_at).toLocaleString()}`}
                {/* Typed by a person, or written by a status change. Saying
                    which stops a system line reading as somebody's opinion. */}
                {note.kind !== "note" && ` · ${note.kind}`}
              </p>
              <p className="whitespace-pre-wrap text-[13px]">{note.body}</p>
            </li>
          ))}
        </ol>
      )}

      <Form action={formAction} state={state}>
        {state.error && <Alert tone="err" title="Could not add that">{state.error}</Alert>}
        <Field label="Add a note" htmlFor="body">
          <Textarea id="body" name="body" rows={3} />
        </Field>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Adding…" : "Add note"}
        </Button>
      </Form>
    </section>
  );
}

/**
 * The score, and every check behind it.
 *
 * The number is never shown on its own. A score that cannot be argued with is
 * one that gets ignored the first time it is wrong, so each check says what it
 * was worth and — when it failed — what would have earned it.
 */
export function LeadScorePanel({ lead }: { lead: AdminLead }) {
  const reasons: LeadScoreReason[] = lead.score_reasons ?? [];
  const applied = reasons.filter((r) => r.applies);

  return (
    <section className="rounded-lg border border-line-strong bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-[13px] font-semibold">Score</h2>
        {lead.score_band === "unscored" ? (
          <span className="text-[13px] text-faint">Not scored</span>
        ) : (
          <Badge tone={leadBandTone[lead.score_band]}>{lead.score} · {lead.score_band}</Badge>
        )}
      </div>

      {applied.length === 0 ? (
        <p className="text-[13px] text-muted">
          {/* Honest about a backfilled row: it was never measured, which is a
              different thing from having been measured at zero. */}
          This lead arrived before scoring existed, so no checks were run on it.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {applied.map((reason) => (
              <li key={reason.key} className="flex items-baseline gap-2 text-[13px]">
                <span aria-hidden className={reason.passed ? "text-ok" : "text-faint"}>
                  {reason.passed ? "✓" : "✕"}
                </span>
                <span className="min-w-0">
                  <span className={reason.passed ? "" : "text-muted"}>{reason.label}</span>
                  <span className="text-faint"> · {reason.weight}</span>
                  {reason.hint && <span className="block text-[12px] text-faint">{reason.hint}</span>}
                </span>
              </li>
            ))}
          </ul>

          {applied.length < reasons.length && (
            <p className="mt-3 text-[12px] text-faint">
              {/* The rule `SeoScore` follows: scored out of what applies, so a
                  form that never asked for a message cannot be marked down for
                  not having one. */}
              {reasons.length - applied.length} check
              {reasons.length - applied.length === 1 ? "" : "s"} did not apply and were left out of the total.
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** Delete, behind a dialog that says what survives. */
export function LeadDelete({ id }: { id: number }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>Delete lead</Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Delete this lead?">
        {error && <Alert tone="err" title="Could not delete">{error}</Alert>}
        <p className="text-[13px]">
          The pipeline record, its notes and its history go. The enquiry it was made from is kept —
          that is the record of something a person actually sent.
        </p>
        <div className="mt-4 flex gap-2">
          <Button
            variant="destructive"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              // A failure returns here rather than redirecting, so the dialog
              // is still open to say so.
              const result = await deleteLeadAction(id);
              setPending(false);
              if (result?.error) setError(result.error);
            }}
          >
            {pending ? "Deleting…" : "Delete"}
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </Modal>
    </>
  );
}
