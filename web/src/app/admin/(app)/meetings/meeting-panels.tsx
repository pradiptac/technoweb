"use client";

import { useActionState, useState, useTransition } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert, Field, Select, Textarea } from "@/components/ui/input";
import {
  cancelMeetingAction, moveMeetingAction, resyncMeetingAction, updateMeetingAction,
  type MeetingActionState, type MeetingResult,
} from "./actions";
import { SlotPicker } from "./slot-picker";
import type { AdminMeeting } from "@/types/meetings";

const initial: MeetingActionState = {};

const panel = "rounded-lg border border-line-strong bg-card p-4";

/**
 * A new time, and perhaps a different host — the picker the scheduler uses,
 * for this meeting's own type. The customer is told by the API; the event in
 * Google keeps its Meet link.
 */
export function MeetingMovePanel({
  meeting, typeSlug, hosts, minDate,
}: {
  meeting: AdminMeeting;
  typeSlug: string;
  hosts: { id: number; name: string }[];
  minDate: string;
}) {
  const action = moveMeetingAction.bind(null, meeting.reference);
  const [state, formAction, pending] = useActionState(action, initial);
  const [host, setHost] = useState<number | null>(meeting.host_id);
  const [outsideHours, setOutsideHours] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  return (
    <Form action={formAction} state={state} className={panel}>
      <h2 className="mb-1 text-13 font-semibold">Move the meeting</h2>
      <p className="mb-3 text-12-5 text-muted">
        The customer and the host are told, and the calendar event moves with the same Meet link.
      </p>

      {state.error && <Alert tone="err" title="Could not move it">{state.error}</Alert>}

      <Field label="Host" htmlFor="move_host" variant="float-static" error={err("host_id")}>
        <Select id="move_host" name="host_id" value={host ?? ""} onChange={(e) => setHost(e.currentTarget.value ? Number(e.currentTarget.value) : null)}>
          <option value="">Any free host</option>
          {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </Select>
      </Field>

      <SlotPicker
        key={`move-${state.taken ?? 0}`}
        type={typeSlug}
        host={host}
        outsideHours={outsideHours}
        googleBusy={googleBusy}
        initialDate={state.date ?? meeting.starts_at.slice(0, 10)}
        minDate={minDate}
        error={err("start")}
        exclude={meeting.reference}
      />

      <div className="mb-3 grid gap-2 text-12-5">
        <label className="flex gap-2.5">
          <input type="checkbox" name="outside_hours" value="1" checked={outsideHours}
            onChange={(e) => setOutsideHours(e.currentTarget.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand-600)]" />
          <span>Offer times outside working hours</span>
        </label>
        <label className="flex gap-2.5">
          <input type="checkbox" name="override_google_busy" value="1" checked={googleBusy}
            onChange={(e) => setGoogleBusy(e.currentTarget.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand-600)]" />
          <span>Ignore Google busy time</span>
        </label>
      </div>

      <Button type="submit" pending={pending}>{pending ? "Moving…" : "Move and tell them"}</Button>
    </Form>
  );
}

/** Cancelling asks for a reason, which the customer is sent. */
export function MeetingCancelPanel({ meeting }: { meeting: AdminMeeting }) {
  const action = cancelMeetingAction.bind(null, meeting.reference);
  const [state, formAction, pending] = useActionState(action, initial);
  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  return (
    <Form action={formAction} state={state} className={panel}>
      <h2 className="mb-1 text-13 font-semibold">Cancel the meeting</h2>
      <p className="mb-3 text-12-5 text-muted">The calendar event is deleted and the customer is emailed.</p>

      {state.error && <Alert tone="err" title="Could not cancel it">{state.error}</Alert>}

      <Field label="Reason (sent to the customer)" htmlFor="cancel_reason" error={err("reason")}>
        <Textarea id="cancel_reason" name="reason" rows={2} maxLength={500} />
      </Field>

      <Button
        type="submit" variant="destructive" pending={pending}
        onClick={(e) => { if (!window.confirm(`Cancel ${meeting.reference}? The customer is told straight away.`)) e.preventDefault(); }}
      >
        {pending ? "Cancelling…" : "Cancel the meeting"}
      </Button>
    </Form>
  );
}

/**
 * The outcome and the desk's note. The outcome is offered only once the
 * meeting has started — the API refuses it before — and `allowed_next` is
 * the list, never one restated here. `mine` saves through `my-meetings`.
 */
export function MeetingOutcomePanel({ meeting, started, mine = false }: { meeting: AdminMeeting; started: boolean; mine?: boolean }) {
  const action = updateMeetingAction.bind(null, meeting.reference, mine);
  const [state, formAction, pending] = useActionState(action, initial);
  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  const outcomes = meeting.allowed_next.filter((o) => o.value === "completed" || o.value === "no_show");
  const canRecord = started && meeting.status !== "cancelled" && outcomes.length > 0;
  const current = meeting.status === "completed" || meeting.status === "no_show" ? meeting.status : "";

  return (
    <Form action={formAction} state={state} className={panel}>
      <h2 className="mb-3 text-13 font-semibold">{canRecord ? "Outcome and notes" : "Notes"}</h2>

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}

      {canRecord ? (
        <Field label="Outcome" htmlFor="outcome" variant="float-static" error={err("status")}
          hint={meeting.needs_outcome ? "It is over — did it happen?" : undefined}>
          <Select id="outcome" name="status" defaultValue={current}>
            {!current && <option value="">Not recorded yet</option>}
            {outcomes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
      ) : meeting.status === "scheduled" ? (
        <p className="mb-3 text-12-5 text-muted">The outcome can be recorded once the meeting has started.</p>
      ) : null}

      <Field label="Private notes (never shown to the customer)" htmlFor="staff_note" error={err("staff_note")}>
        <Textarea id="staff_note" name="staff_note" rows={4} defaultValue={meeting.staff_note ?? ""} />
      </Field>

      <Button type="submit" variant="secondary" pending={pending}>{pending ? "Saving…" : "Save"}</Button>
    </Form>
  );
}

/** Where the event stands in Google, the words Google used, and Retry. */
export function MeetingGooglePanel({ meeting }: { meeting: AdminMeeting }) {
  const [busy, start] = useTransition();
  const [result, setResult] = useState<MeetingResult>({});
  const g = meeting.google;

  return (
    <section className={panel}>
      <h2 className="mb-2 text-13 font-semibold">Google Calendar</h2>
      <p className="text-13">{g.status_label}</p>
      {g.account && <p className="text-12-5 text-muted">Organised by {g.account}</p>}
      {g.attempts > 0 && <p className="text-12-5 text-muted">{g.attempts} attempt{g.attempts === 1 ? "" : "s"}</p>}

      {g.error && (
        <div className="mt-3">
          <Alert tone="warn" title="Google refused it" dismissible={false}>{g.error}</Alert>
        </div>
      )}
      {g.status === "off" && (
        <p className="mt-2 text-12-5 text-muted">
          Not synced — the calendar is not connected, or the event was made under another account. The customer was sent a calendar file instead.
        </p>
      )}

      {result.error && <Alert tone="err" title="That did not work">{result.error}</Alert>}
      {result.ok && !result.error && <Alert tone="ok" title="Retrying">{result.ok}</Alert>}

      {g.status === "failed" && meeting.status === "scheduled" && (
        <Button
          type="button" size="sm" variant="secondary" className="mt-3" disabled={busy}
          onClick={() => start(async () => setResult(await resyncMeetingAction(meeting.reference)))}
        >
          {busy ? "Retrying…" : "Retry the sync"}
        </Button>
      )}
    </section>
  );
}
