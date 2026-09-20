"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { Badge, leadStatusTone } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { moveLeadAction } from "./actions";
import type { AdminLead } from "@/lib/admin";

/**
 * A lead's status and owner, worked from its row.
 *
 * The queue used to be read-only: answering an enquiry meant opening it,
 * finding the pipeline panel, saving and coming back, once per lead. The row
 * carries the two moves a triage pass makes — the status, from
 * `allowed_next` so only a legal move is offered (the rule the detail panel
 * follows), and **Take it**, which assigns the lead to whoever pressed it.
 * Everything else (a follow-up date, a value, a note) still wants the
 * record. Controlled, like `TicketRowActions`, so a refused move can put the
 * select back to what the server still holds.
 */
export function LeadRowActions({ lead, me }: { lead: AdminLead; me: number | null }) {
  const [status, setStatus] = useState(lead.status);
  const [owner, setOwner] = useState<{ id: number | null; name: string | null }>({ id: lead.assigned_to, name: lead.assignee_name ?? null });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const options = lead.allowed_next ?? [{ value: lead.status, label: lead.status_label }];
  const label = options.find((o) => o.value === status)?.label ?? lead.status_label;

  function onStatus(e: ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as AdminLead["status"];
    const previous = status;
    setStatus(next);
    setError(null);
    start(async () => {
      const res = await moveLeadAction(lead.id, { status: next });
      if (res.error) { setStatus(previous); setError(res.error); }
    });
  }

  function take() {
    if (me === null) return;
    const previous = owner;
    setOwner({ id: me, name: "you" });
    setError(null);
    start(async () => {
      const res = await moveLeadAction(lead.id, { assigned_to: me });
      if (res.error) { setOwner(previous); setError(res.error); }
    });
  }

  return (
    <>
      <td data-label="Status" className="px-3 py-2">
        <span className="flex flex-wrap items-center gap-1.5">
          {options.length > 1 ? (
            <Select
              aria-label={`Status of ${lead.name || lead.email || `lead ${lead.id}`}`}
              value={status}
              disabled={pending}
              onChange={onStatus}
              className="w-[132px] py-1 text-12 max-xl:w-full"
            >
              {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          ) : (
            <Badge tone={leadStatusTone[status] ?? "closed"}>{label}</Badge>
          )}
          {lead.is_overdue && <Badge tone="urgent">Overdue</Badge>}
          {error && <span className="basis-full text-11-5 text-err">{error}</span>}
        </span>
      </td>
      <td data-label="Owner" className="max-w-[18ch] px-3 py-2 text-muted">
        {owner.id !== null && owner.id === me ? (
          <span className="font-medium text-ink">You</span>
        ) : (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="truncate">{owner.name || "Unassigned"}</span>
            {me !== null && lead.is_open && (
              <button
                type="button"
                onClick={take}
                disabled={pending}
                className="rounded border border-line-strong bg-card px-1.5 py-0.5 text-11-5 font-semibold text-brand-ink transition-colors hover:border-brand-600 disabled:opacity-60"
              >
                Take it
              </button>
            )}
          </span>
        )}
      </td>
    </>
  );
}
