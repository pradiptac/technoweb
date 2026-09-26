"use client";

import { useActionState, useState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { istDateTimeLocal } from "@/lib/visit-dates";
import { confirmVisitAction, updateVisitAction, type VisitActionState } from "./actions";
import type { AdminVisit } from "@/types/api";

const initial: VisitActionState = {};

/**
 * Set the time. A `datetime-local` input posts a wall-clock time with no
 * offset, which the API reads in IST — so the default shown here is the
 * current appointment in IST, or the first preferred date at the start of
 * its window, whatever zone this browser is in.
 */
export function VisitConfirmPanel({
  visit,
  assignees,
  defaultMinutes,
  windows,
}: {
  visit: AdminVisit;
  assignees: { id: number; name: string }[];
  defaultMinutes: number;
  windows: { value: string; start: string }[];
}) {
  const action = confirmVisitAction.bind(null, visit.reference);
  const [state, formAction, pending] = useActionState(action, initial);
  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  const first = visit.preferred[0];
  const firstStart = first ? windows.find((w) => w.value === first.window)?.start : undefined;
  const suggested = visit.scheduled_start_at
    ? istDateTimeLocal(visit.scheduled_start_at)
    : first && firstStart ? `${first.date}T${firstStart}` : "";
  const currentMinutes = visit.scheduled_start_at && visit.scheduled_end_at
    ? Math.round((new Date(visit.scheduled_end_at).getTime() - new Date(visit.scheduled_start_at).getTime()) / 60000)
    : defaultMinutes;

  const booked = visit.status === "confirmed";

  return (
    <Form action={formAction} state={state} className="rounded-lg border border-line-strong bg-card p-4">
      <h2 className="mb-1 text-13 font-semibold">{booked ? "Move the visit" : "Confirm a time"}</h2>
      <p className="mb-3 text-12-5 text-muted">
        {booked
          ? "A new time emails the customer that it has moved, with a calendar file that updates the old one."
          : "The customer is emailed the time with a calendar file, and reminded the day before."}
      </p>

      {state.error && <Alert tone="err" title="Could not confirm">{state.error}</Alert>}

      <Field label="Arrives (IST)" htmlFor="start_at" variant="float-static" error={err("start_at")}>
        <Input id="start_at" name="start_at" type="datetime-local" required defaultValue={suggested} step={300} />
      </Field>

      <Field label="Allow (minutes)" htmlFor="minutes" variant="float-static" error={err("minutes")}>
        <Input id="minutes" name="minutes" type="number" min={15} max={720} step={15} defaultValue={currentMinutes} />
      </Field>

      <Field label="Engineer" htmlFor="confirm_assigned_to" variant="float-static" error={err("assigned_to")}>
        <Select id="confirm_assigned_to" name="assigned_to" defaultValue={visit.assigned_to ?? ""}>
          <option value="">Not decided yet</option>
          {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      </Field>

      <Button type="submit" pending={pending}>{pending ? "Saving…" : booked ? "Move and tell them" : "Confirm and tell them"}</Button>
    </Form>
  );
}

/** Status, engineer and the desk's own note. Cancelling asks for a reason, which the customer is sent. */
export function VisitStatusPanel({ visit, assignees }: { visit: AdminVisit; assignees: { id: number; name: string }[] }) {
  const action = updateVisitAction.bind(null, visit.reference);
  const [state, formAction, pending] = useActionState(action, initial);
  const [status, setStatus] = useState<string>(visit.status);
  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  return (
    <Form action={formAction} state={state} className="rounded-lg border border-line-strong bg-card p-4">
      <h2 className="mb-3 text-13 font-semibold">Status and notes</h2>

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}

      <Field label="Status" htmlFor="status" variant="float-static" error={err("status")}
        hint={visit.status === "requested" ? "Confirm a time above to book it." : undefined}>
        <Select id="status" name="status" value={status} onChange={(e) => setStatus(e.currentTarget.value)}>
          {visit.allowed_next.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
      </Field>

      {status === "cancelled" && visit.status !== "cancelled" && (
        <Field label="Reason (sent to the customer)" htmlFor="cancel_reason" error={err("cancel_reason")}>
          <Input id="cancel_reason" name="cancel_reason" maxLength={500} />
        </Field>
      )}

      <Field label="Engineer" htmlFor="assigned_to" variant="float-static">
        <Select id="assigned_to" name="assigned_to" defaultValue={visit.assigned_to ?? ""}>
          <option value="">Unassigned</option>
          {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      </Field>

      <Field label="Desk note (never shown to the customer)" htmlFor="staff_note" error={err("staff_note")}>
        <Textarea id="staff_note" name="staff_note" rows={3} defaultValue={visit.staff_note ?? ""} />
      </Field>

      <Button type="submit" variant="secondary" pending={pending}>{pending ? "Saving…" : "Save"}</Button>
    </Form>
  );
}

const EVENT_WORDS: Record<string, string> = {
  requested: "Requested",
  confirmed: "Confirmed",
  rescheduled: "Moved",
  assigned: "Engineer",
  status: "Status",
  reminded: "Reminder sent",
  cancelled_by_customer: "Cancelled by the customer",
  new_times_requested: "Customer asked for other times",
};

/** The trail, oldest first — read as a story. */
export function VisitTrail({ visit }: { visit: AdminVisit }) {
  const events = visit.events ?? [];

  return (
    <Card as="section" interactive={false} padding="sm">
      <h2 className="mb-3 text-13 font-semibold">History</h2>
      {events.length === 0 ? (
        <p className="text-13 text-muted">Nothing recorded yet.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {events.map((e) => (
            <li key={e.id} className="border-l-2 border-line-strong pl-3">
              <p className="text-12 text-faint">
                {e.actor_name || (e.type === "reminded" ? "System" : "Customer")}
                {e.created_at && ` · ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(e.created_at))}`}
              </p>
              <p className="text-13">
                <span className="font-semibold">{EVENT_WORDS[e.type] ?? e.type}</span>
                {(e.from || e.to) && <span className="text-muted"> {e.from ? `${e.from} → ` : ""}{e.to}</span>}
              </p>
              {e.note && <p className="whitespace-pre-wrap text-13 text-muted">{e.note}</p>}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
