import { Badge } from "@/components/ui/badge";
import { Stepper, type Step } from "@/components/ui/stepper";
import { formatDate } from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import type { CustomerReturn, ReturnStatus } from "@/types/returns";

/**
 * A customer's returns of one order, as they read them (docs/store.md
 * "Returns"): the reference, where it has got to, what is coming back and
 * what the desk said. A server component — the guest's order page and the
 * portal's both draw it, and neither needs the browser for it.
 *
 * One map from a status to a badge tone, shared with the console's screens:
 * two maps for one word drift the first time somebody adds a state.
 */
export const RETURN_TONE: Record<ReturnStatus, "open" | "progress" | "resolved" | "closed" | "urgent"> = {
  requested: "open",
  approved: "progress",
  received: "progress",
  refunded: "resolved",
  rejected: "closed",
  closed: "closed",
};

/** The four stops of a return that is going ahead. A refusal or a close has no path to draw. */
function steps(status: ReturnStatus): Step[] | null {
  const labels = ["Requested", "Approved", "Items received", "Refunded"];
  const at = { requested: 0, approved: 1, received: 2, refunded: 3 }[status as "requested" | "approved" | "received" | "refunded"];
  if (at === undefined) return null;

  return labels.map((label, i) => ({
    label,
    state: status === "refunded" ? "done" : i < at ? "done" : i === at ? "current" : "upcoming",
  }));
}

export function OrderReturns({ returns }: { returns: CustomerReturn[] }) {
  if (returns.length === 0) return null;

  return (
    <ul className="grid gap-3">
      {returns.map((r) => {
        const path = steps(r.status);

        return (
          <li key={r.reference} data-return className="rounded-lg border border-line-strong bg-card p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="font-mono text-13-5 font-medium text-ink">{r.reference}</span>
              <Badge tone={RETURN_TONE[r.status]}>{r.status_label}</Badge>
              {r.requested_at && <span className="text-12-5 text-muted">Asked for on {formatDate(r.requested_at)}</span>}
            </div>

            <ul className="mt-2 text-14 text-ink-2">
              {r.items.map((line) => (
                <li key={line.order_item_id}>
                  {line.quantity} × {line.name ?? "An item"}
                  {line.variation_name ? ` (${line.variation_name})` : ""}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-13 text-muted">
              {r.reason_label}
              {r.photos_count > 0 ? ` · ${r.photos_count} photograph${r.photos_count === 1 ? "" : "s"} sent` : ""}
            </p>

            {path && <Stepper steps={path} label={`Progress of return ${r.reference}`} className="mt-4" />}

            {r.status === "requested" && (
              <p className="mt-3 text-13 text-muted">
                We are looking at it. Please do not send anything back until we have approved it.
              </p>
            )}
            {r.decision_note && (r.status === "approved" || r.status === "rejected") && (
              <p className="mt-3 whitespace-pre-line rounded-md bg-surface-2 px-3 py-2 text-13-5 text-ink-2">
                <span className="font-semibold">From us: </span>{r.decision_note}
              </p>
            )}
            {r.status === "refunded" && r.refund_paise !== null && (
              <p className="mt-3 text-13-5 text-ink-2">
                Refunded <span className="font-semibold tabular-nums">{formatPaise(r.refund_paise)}</span>
                {r.refunded_at ? ` on ${formatDate(r.refunded_at)}` : ""}. It can take a few working days to show on your statement.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
