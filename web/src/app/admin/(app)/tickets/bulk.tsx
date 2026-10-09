"use client";

import { useActionState, useEffect } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { RowTick, TickAll, clearSelection, useSelection } from "@/components/admin/row-selection";
import { bulkTicketsAction, type BulkTicketState } from "./actions";
import type { StaffUser, TicketPriority, TicketStatus } from "@/types/api";

/*
 * The selection is the console's shared store (`components/admin/row-selection`),
 * keyed by this list's scope. It used to be a private copy of the same code here.
 */
const SCOPE = "tickets";

/** One row's tick. */
export function TicketTick({ id, reference }: { id: number; reference: string }) {
  return <RowTick scope={SCOPE} id={id} label={reference} />;
}

/** The header's tick: every ticket on this page, or none. */
export function TicketTickAll({ ids }: { ids: number[] }) {
  return <TickAll scope={SCOPE} ids={ids} noun="ticket" />;
}

const STATUSES: { value: TicketStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In progress" },
  { value: "pending_customer", label: "Pending customer" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const PRIORITIES: { value: TicketPriority; label: string }[] = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
];

const initial: BulkTicketState = {};

/**
 * What appears above the queue once anything is ticked — the media library's
 * selection bar, for tickets.
 *
 * One form and one Apply: a status, an assignee and a priority, each of which
 * may be left alone, sent together to `POST /admin/tickets/bulk`. The API
 * applies each ticket in its own transaction and answers with what it did
 * and what it refused, so a closed ticket in a selection being reopened is
 * reported by reference rather than failing the batch — a triage pass over
 * twenty rows should not stop at the one it cannot move. The bar says both
 * halves: a toast for the count, and the refusals in place until dismissed.
 *
 * The selection clears when the page's rows change — a new page, a new
 * filter — because a tick on a row that is no longer shown is a tick on
 * something the person cannot see.
 */
export function TicketBulkBar({ ids, staff }: { ids: number[]; staff: StaffUser[] }) {
  const current = useSelection(SCOPE);
  const toast = useToast();
  const [state, action, pending] = useActionState(bulkTicketsAction, initial);

  const pageKey = ids.join(",");
  useEffect(() => { clearSelection(SCOPE); }, [pageKey]);

  // A finished action clears the ticks: the rows they described have changed.
  useEffect(() => {
    if (state.ok) {
      toast({ tone: "ok", title: state.ok });
      clearSelection(SCOPE);
    }
  }, [state, toast]);

  const count = current.size;
  if (count === 0) return null;

  const noun = `${count} ticket${count === 1 ? "" : "s"}`;

  return (
    <div className="sticky top-13 z-20 mb-3 rounded-lg border border-brand-600 bg-brand-50 px-3 py-2.5" data-bulk-bar>
      <Form action={action} state={state} className="flex flex-wrap items-center gap-2">
        {[...current].map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
        <span className="text-13 font-semibold text-brand-ink">{noun} selected</span>
        <button type="button" onClick={() => clearSelection(SCOPE)} className="rounded px-2 py-1 text-12-5 font-medium text-brand-ink underline-offset-2 hover:underline">
          Select none
        </button>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-12-5 font-medium text-muted">
            Status
            <Select name="status" defaultValue="" className="w-auto py-1.5 text-13" disabled={pending}>
              <option value="">Leave</option>
              {STATUSES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </label>
          <label className="flex items-center gap-1.5 text-12-5 font-medium text-muted">
            Assign to
            <Select name="assigned_to" defaultValue="" className="w-auto py-1.5 text-13" disabled={pending}>
              <option value="">Leave</option>
              <option value="none">Unassigned</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </label>
          <label className="flex items-center gap-1.5 text-12-5 font-medium text-muted">
            Priority
            <Select name="priority" defaultValue="" className="w-auto py-1.5 text-13" disabled={pending}>
              <option value="">Leave</option>
              {PRIORITIES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </label>
          <Button type="submit" size="sm" pending={pending}>Apply</Button>
        </div>

        {state.error && <p role="alert" className="basis-full text-12-5 font-medium text-err">{state.error}</p>}
        {state.refused && state.refused.length > 0 && (
          <ul className="basis-full text-12-5 text-err">
            {state.refused.map((r) => <li key={r.reference}><span className="font-mono">{r.reference}</span> — {r.message}</li>)}
          </ul>
        )}
      </Form>
    </div>
  );
}
