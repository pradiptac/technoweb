"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { Select } from "@/components/ui/input";
import { updateTicketAssignee, updateTicketStatus } from "./actions";
import type { StaffUser, Ticket, TicketStatus } from "@/types/api";

/**
 * Inline status + assignee controls for one queue row. Controlled (not
 * defaultValue) so a failed mutation can revert the visible selection —
 * an uncontrolled select would keep showing the pending, never-applied value.
 */
export function TicketRowActions({ ticket, staff }: { ticket: Ticket; staff: StaffUser[] }) {
  const [status, setStatus] = useState<TicketStatus>(ticket.status);
  const [assignedTo, setAssignedTo] = useState<number | null>(ticket.assigned_to?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const statusOptions = [
    { value: ticket.status, label: ticket.status_label },
    ...ticket.allowed_transitions,
  ];

  function onStatusChange(e: ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as TicketStatus;
    const previous = status;
    setStatus(next);
    setError(null);
    startTransition(async () => {
      try {
        await updateTicketStatus(ticket.reference, next);
      } catch {
        setStatus(previous);
        setError("Could not update status.");
      }
    });
  }

  function onAssigneeChange(e: ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value ? Number(e.target.value) : null;
    const previous = assignedTo;
    setAssignedTo(next);
    setError(null);
    startTransition(async () => {
      try {
        await updateTicketAssignee(ticket.reference, next);
      } catch {
        setAssignedTo(previous);
        setError("Could not update assignee.");
      }
    });
  }

  return (
    // Side by side, not stacked. Two full-width bordered selects one above the
    // other were 88px of a 110px row — the single largest thing in the console
    // and the reason only four tickets fitted on screen.
    //
    // 112px never fitted, on any screen. A select 112px wide with 13px of
    // left padding, pr-9 for the chevron and 2px of border leaves 61px for
    // text: "Unassigned" needs 67 and "Pending customer" 103, so the desktop
    // row was showing "Unassigne" long before anyone looked at a phone. 156px
    // is the longest option plus the chrome, with a couple of px of slack — if a status label or a staff
    // name gets longer, this needs measuring again.
    //
    // Below xl they go full width and stack. Two 156px selects side by side
    // need ~320px of column, which is what kept this table at 836px when
    // every other admin table fitted 710px — and a clipped Status column is
    // worse than a taller row. Below md the row is a card and the same
    // full-width rule is what that layout wants anyway.
    <div className="flex flex-wrap items-center gap-1 max-xl:w-full">
      <Select
        aria-label={`Status for ${ticket.reference}`}
        value={status}
        disabled={pending}
        onChange={onStatusChange}
        className="w-[156px] py-1 text-[12px] max-xl:w-full"
      >
        {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
      <Select
        aria-label={`Assignee for ${ticket.reference}`}
        value={assignedTo ?? ""}
        disabled={pending}
        onChange={onAssigneeChange}
        className="w-[156px] py-1 text-[12px] max-xl:w-full"
      >
        <option value="">Unassigned</option>
        {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </Select>
      {error && <span className="basis-full text-[11.5px] text-err">{error}</span>}
    </div>
  );
}
