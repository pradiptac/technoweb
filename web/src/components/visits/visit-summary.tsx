import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
import type { CustomerVisit, VisitStatus } from "@/types/api";

type Tone = NonNullable<ComponentProps<typeof Badge>["tone"]>;

/** One colour per visit state, shared by the portal, the guest page and the console. */
export const visitStatusTone: Record<VisitStatus, Tone> = {
  requested: "open",
  confirmed: "progress",
  completed: "resolved",
  cancelled: "closed",
  no_show: "urgent",
};

export function VisitStatusBadge({ status, label }: { status: VisitStatus; label: string }) {
  return <Badge tone={visitStatusTone[status] ?? "closed"}>{label}</Badge>;
}

/** An address on one line, parts that exist only. */
export function visitAddressLine(address: CustomerVisit["site_address"]): string {
  if (!address) return "";
  return [address.line1, address.line2, address.city, address.state, address.pin].filter(Boolean).join(", ");
}

/**
 * What a customer needs to see about their own request: where it stands, the
 * time we agreed or the times they asked for, and where. A server component;
 * the buttons that change it are `VisitManage`.
 */
export function VisitSummary({ visit }: { visit: CustomerVisit }) {
  const address = visitAddressLine(visit.site_address);

  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      <div className="min-w-0">
        <dt className="text-12 font-semibold uppercase tracking-[.06em] text-muted">Status</dt>
        <dd className="mt-1"><VisitStatusBadge status={visit.status} label={visit.status_label} /></dd>
      </div>
      <div className="min-w-0">
        <dt className="text-12 font-semibold uppercase tracking-[.06em] text-muted">About</dt>
        <dd className="mt-1 text-15">{visit.topic}</dd>
      </div>

      {visit.status === "confirmed" && visit.visit_date ? (
        <div className="min-w-0 sm:col-span-2">
          <dt className="text-12 font-semibold uppercase tracking-[.06em] text-muted">Booked for</dt>
          <dd className="mt-1 text-17 font-semibold">{visit.visit_date}, {visit.visit_time}</dd>
        </div>
      ) : visit.status === "requested" ? (
        <div className="min-w-0 sm:col-span-2">
          <dt className="text-12 font-semibold uppercase tracking-[.06em] text-muted">Times you asked for</dt>
          <dd className="mt-1">
            <ol className="grid gap-1 text-15">
              {visit.preferred.map((p, i) => <li key={`${p.date}-${p.window}`}>{i + 1}. {p.label}</li>)}
            </ol>
            <p className="mt-2 text-13 text-muted">We will confirm one of these by email.</p>
          </dd>
        </div>
      ) : null}

      {visit.status === "cancelled" && visit.cancel_reason && (
        <div className="min-w-0 sm:col-span-2">
          <dt className="text-12 font-semibold uppercase tracking-[.06em] text-muted">Why it was cancelled</dt>
          <dd className="mt-1 text-15">{visit.cancel_reason}</dd>
        </div>
      )}

      {address && (
        <div className="min-w-0 sm:col-span-2">
          <dt className="text-12 font-semibold uppercase tracking-[.06em] text-muted">Where</dt>
          <dd className="mt-1 break-words text-15">{address}</dd>
        </div>
      )}
    </dl>
  );
}
