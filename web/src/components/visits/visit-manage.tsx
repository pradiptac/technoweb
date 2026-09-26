"use client";

import { useActionState, useState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert, Field, Textarea } from "@/components/ui/input";
import { PreferredTimesField } from "@/components/visits/preferred-times-field";
import type { CustomerVisit, VisitOptions } from "@/types/api";

export type VisitManageState = { ok?: string; error?: string; fieldErrors?: Record<string, string[]> };

const initial: VisitManageState = {};

/**
 * Cancel, or ask for other times — the two things a customer may do to their
 * own request, from the guest link and from the portal alike. The actions are
 * handed in already bound, so this component never knows whether a token or
 * a session is behind them.
 *
 * Both buttons appear only when the API says they will be accepted
 * (`can_cancel`, `can_reschedule`). Cancelling asks twice: it is the one
 * press here that cannot be undone from this screen.
 */
export function VisitManage({
  visit,
  rules,
  cancelAction,
  rescheduleAction,
}: {
  visit: CustomerVisit;
  rules: VisitOptions | null;
  cancelAction: (prev: VisitManageState, formData: FormData) => Promise<VisitManageState>;
  rescheduleAction: (prev: VisitManageState, formData: FormData) => Promise<VisitManageState>;
}) {
  const [cancelState, cancel, cancelling] = useActionState(cancelAction, initial);
  const [moveState, move, moving] = useActionState(rescheduleAction, initial);
  const [confirming, setConfirming] = useState(false);
  const [changing, setChanging] = useState(false);
  const err = (field: string) => moveState.fieldErrors?.[field]?.[0];

  if (!visit.can_cancel && !visit.can_reschedule) return null;

  return (
    <div className="grid gap-4">
      {cancelState.error && <Alert tone="err" title="Could not cancel">{cancelState.error}</Alert>}
      {moveState.ok && <Alert tone="ok" title="Sent">{moveState.ok}</Alert>}

      <div className="flex flex-wrap gap-3">
        {visit.can_reschedule && rules && !changing && (
          <Button type="button" variant="secondary" onClick={() => setChanging(true)}>Ask for another time</Button>
        )}
        {visit.can_cancel && !confirming && (
          <Button type="button" variant="ghost" onClick={() => setConfirming(true)}>Cancel this visit</Button>
        )}
      </div>

      {confirming && (
        <Form action={cancel} state={cancelState} className="rounded-lg border border-line-strong bg-card p-4">
          <p className="mb-3 text-14">
            Cancel {visit.reference}? {visit.status === "confirmed" ? "The engineer will be told not to come." : "We will not book it."}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="destructive" pending={cancelling}>{cancelling ? "Cancelling…" : "Yes, cancel it"}</Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>Keep it</Button>
          </div>
        </Form>
      )}

      {changing && rules && (
        <Form action={move} state={moveState} className="min-w-0 rounded-lg border border-line-strong bg-card p-4">
          {moveState.error && <Alert tone="err" title="Could not send">{moveState.error}</Alert>}
          <p className="mb-3 text-14 text-muted">
            {visit.status === "confirmed"
              ? "The time we booked will be released and the desk will confirm one of these instead."
              : "These replace the times you gave us before."}
          </p>
          <PreferredTimesField rules={rules} err={err} />
          <Field label="Anything to add? (optional)" htmlFor="visit-note" error={err("note")}>
            <Textarea id="visit-note" name="note" rows={2} maxLength={500} />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" pending={moving}>{moving ? "Sending…" : "Send new times"}</Button>
            <Button type="button" variant="ghost" onClick={() => setChanging(false)}>Never mind</Button>
          </div>
        </Form>
      )}
    </div>
  );
}
