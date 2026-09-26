"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { Select } from "@/components/ui/input";
import { VisitStatusBadge } from "@/components/visits/visit-summary";
import { moveVisitAction } from "./actions";
import type { AdminVisit } from "@/types/api";

/**
 * A visit's status and engineer, worked from its row — `LeadRowActions`'
 * arrangement. The status select is built from `allowed_next`, which never
 * offers "Confirmed": a time is what confirms, and that is set on the
 * record. Controlled, so a refused move puts the select back.
 */
export function VisitRowActions({ visit, me }: { visit: AdminVisit; me: number | null }) {
  const [status, setStatus] = useState(visit.status);
  const [owner, setOwner] = useState<{ id: number | null; name: string | null }>({ id: visit.assigned_to, name: visit.assignee_name ?? null });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const options = visit.allowed_next ?? [{ value: visit.status, label: visit.status_label }];
  const label = options.find((o) => o.value === status)?.label ?? visit.status_label;

  function onStatus(e: ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as AdminVisit["status"];
    const previous = status;
    setStatus(next);
    setError(null);
    start(async () => {
      const res = await moveVisitAction(visit.reference, { status: next });
      if (res.error) { setStatus(previous); setError(res.error); }
    });
  }

  function take() {
    if (me === null) return;
    const previous = owner;
    setOwner({ id: me, name: "you" });
    setError(null);
    start(async () => {
      const res = await moveVisitAction(visit.reference, { assigned_to: me });
      if (res.error) { setOwner(previous); setError(res.error); }
    });
  }

  return (
    <>
      <td data-label="Status" className="px-3 py-2">
        <span className="flex flex-wrap items-center gap-1.5">
          {options.length > 1 ? (
            <Select
              aria-label={`Status of ${visit.reference}`}
              value={status}
              disabled={pending}
              onChange={onStatus}
              className="w-[132px] py-1 text-12 max-xl:w-full"
            >
              {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          ) : (
            <VisitStatusBadge status={status} label={label} />
          )}
          {error && <span className="basis-full text-11-5 text-err">{error}</span>}
        </span>
      </td>
      <td data-label="Engineer" className="max-w-[18ch] px-3 py-2 text-muted">
        {owner.id !== null && owner.id === me ? (
          <span className="font-medium text-ink">You</span>
        ) : (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="truncate">{owner.name || "Unassigned"}</span>
            {me !== null && visit.is_open && (
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
