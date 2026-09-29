"use client";

import { useActionState, useState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { SlotPicker } from "./slot-picker";
import type { CustomerMeeting, MeetingOptions, MeetingSlot } from "@/types/meetings";

export type MeetingManageState = { ok?: string; error?: string; fieldErrors?: Record<string, string[]> };

const initial: MeetingManageState = {};

/**
 * Cancel, or move to another time — what a customer may do to their own
 * meeting, from the guest link and the portal alike (docs/meetings.md). The
 * actions arrive bound, so this never knows whether a token or a session is
 * behind them.
 *
 * Both buttons appear only when the API says they will be accepted
 * (`can_cancel`, `can_reschedule`); inside the change cutoff it says neither,
 * and the page says why. Moving uses the booking page's own day and time
 * picker for this meeting's type. A time taken while somebody was choosing
 * comes back as a 422 on `start`: the choice is cleared and the times asked
 * for again, from inside the action, so no effect has to watch for it.
 */
export function MeetingManage({
  meeting,
  options,
  cancelAction,
  rescheduleAction,
}: {
  meeting: CustomerMeeting;
  options: MeetingOptions | null;
  cancelAction: (prev: MeetingManageState, formData: FormData) => Promise<MeetingManageState>;
  rescheduleAction: (prev: MeetingManageState, formData: FormData) => Promise<MeetingManageState>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [changing, setChanging] = useState(false);
  const [slot, setSlot] = useState<MeetingSlot | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [cancelState, cancel, cancelling] = useActionState(cancelAction, initial);
  const [moveState, move, moving] = useActionState(async (prev: MeetingManageState, formData: FormData) => {
    const result = await rescheduleAction(prev, formData);
    if (result.fieldErrors?.start) {
      setSlot(null);
      setRefresh((n) => n + 1);
    }
    if (result.ok) {
      setSlot(null);
      setChanging(false);
    }
    return result;
  }, initial);

  const type = meeting.meeting_type?.slug;
  const canMove = meeting.can_reschedule && Boolean(options?.enabled && type);

  if (!meeting.can_cancel && !canMove) {
    return meeting.status === "scheduled" ? (
      <p className="text-14 text-muted">
        It is too close to the start to change it here
        {meeting.change_cutoff_hours ? ` (changes close ${meeting.change_cutoff_hours} hours before)` : ""} —
        reply to the confirmation email or call us.
      </p>
    ) : null;
  }

  return (
    <div className="grid gap-4">
      {cancelState.error && <Alert tone="err" title="Could not cancel">{cancelState.error}</Alert>}
      {moveState.ok && <Alert tone="ok" title="Moved">{moveState.ok}</Alert>}

      <div className="flex flex-wrap gap-3">
        {canMove && !changing && (
          <Button type="button" variant="secondary" onClick={() => setChanging(true)}>Choose another time</Button>
        )}
        {meeting.can_cancel && !confirming && (
          <Button type="button" variant="ghost" onClick={() => setConfirming(true)}>Cancel this meeting</Button>
        )}
      </div>

      {confirming && (
        <Form action={cancel} state={cancelState} className="rounded-lg border border-line-strong bg-card p-4">
          <p className="mb-3 text-14">Cancel {meeting.reference}? The invitation is withdrawn from your calendar and ours.</p>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="destructive" pending={cancelling}>{cancelling ? "Cancelling…" : "Yes, cancel it"}</Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>Keep it</Button>
          </div>
        </Form>
      )}

      {changing && canMove && options && type && (
        <Form action={move} state={moveState} className="min-w-0 rounded-lg border border-line-strong bg-card p-4">
          {moveState.error && <Alert tone="err" title="Could not move it">{moveState.error}</Alert>}
          <p className="mb-4 text-14 text-muted">
            The new time replaces {meeting.date_label}, {meeting.time_label} {meeting.timezone}, and your calendar
            invitation is updated.
            {meeting.reschedules_left > 0
              ? ` You can move it ${meeting.reschedules_left === 1 ? "once more" : `${meeting.reschedules_left} more times`}.`
              : ""}
          </p>
          <SlotPicker type={type} rules={options} value={slot} onChange={setSlot} refresh={refresh} />
          <input type="hidden" name="start" value={slot?.start ?? ""} />
          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="submit" pending={moving} disabled={!slot}>{moving ? "Moving…" : "Move to this time"}</Button>
            <Button type="button" variant="ghost" onClick={() => { setChanging(false); setSlot(null); }}>Never mind</Button>
          </div>
        </Form>
      )}
    </div>
  );
}
