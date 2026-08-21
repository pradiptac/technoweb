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
    <div className="flex flex-col gap-1.5">
      <Select
        aria-label={`Status for ${ticket.reference}`}
        value={status}
        disabled={pending}
        onChange={onStatusChange}
        className="py-2 text-[13px]"
      >
        {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
      <Select
        aria-label={`Assignee for ${ticket.reference}`}
        value={assignedTo ?? ""}
        disabled={pending}
        onChange={onAssigneeChange}
        className="py-2 text-[13px]"
      >
        <option value="">Unassigned</option>
        {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </Select>
      {error && <span className="text-[11.5px] text-err">{error}</span>}
    </div>
  );
}
