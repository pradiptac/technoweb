import { IconCheck } from "@/components/icons";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Order } from "@/types/api";

/** The fields the line reads — the customer's order and the console's both carry them. */
type TimelineOrder = Pick<Order, "status" | "status_label" | "placed_at" | "paid_at" | "dispatched_at" | "payment_method" | "tracking_number" | "tracking_url" | "courier">;

type Step = { key: string; label: string; at: string | null; done: boolean; current: boolean; note?: string };

/**
 * An order as a line of four steps — Placed · Paid · Packed · Dispatched —
 * with the current one live, rather than four timestamps in a list.
 *
 * Read from the stamps the order already carries (`placed_at`, `paid_at`,
 * `dispatched_at`) and its status, so it says nothing the page did not: the
 * stamps are set on arrival and never cleared (the store's rule), which is
 * what makes them a history. A cash-on-delivery order has no `paid_at`
 * until the cash is banked and is packed regardless, so its second step
 * reads "Pay on delivery" and is passed rather than pretending; a
 * cancelled or refunded order shows where it stopped and says so, because a
 * line that keeps promising dispatch on a cancelled order is a lie.
 *
 * One component for the customer's order page, the shared-link page and the
 * console — so the desk and the customer see one picture.
 */
export function OrderTimeline({ order, className }: { order: TimelineOrder; className?: string }) {
  const status = order.status as string;
  const stopped = ["cancelled", "refund_requested", "refunded"].includes(status);
  const cod = order.payment_method === "cod";
  const paid = Boolean(order.paid_at);
  const packed = ["processing", "ready_for_dispatch", "dispatched", "completed"].includes(status) || Boolean(order.dispatched_at);
  const dispatched = ["dispatched", "completed"].includes(status) || Boolean(order.dispatched_at);

  const steps: Step[] = [
    { key: "placed", label: "Placed", at: order.placed_at ?? null, done: true, current: false },
    {
      key: "paid",
      label: cod && !paid ? "Pay on delivery" : "Paid",
      at: order.paid_at ?? null,
      done: paid || cod,
      current: !paid && !cod && !stopped,
      note: cod && !paid ? "Cash to the courier" : undefined,
    },
    { key: "packed", label: "Packed", at: null, done: packed, current: (paid || cod) && !packed && !stopped },
    {
      key: "dispatched",
      label: dispatched ? "Dispatched" : "Dispatch",
      at: order.dispatched_at ?? null,
      done: dispatched,
      current: packed && !dispatched && !stopped,
      note: dispatched && order.tracking_number ? `${order.courier ? `${order.courier} · ` : ""}${order.tracking_number}` : undefined,
    },
  ];

  return (
    <div className={cn("rounded-lg border border-line-strong bg-card p-4", className)}>
      <ol className="grid grid-cols-2 gap-y-4 sm:grid-cols-4 sm:gap-y-0" aria-label="Order progress">
        {steps.map((step, i) => (
          <li key={step.key} className="relative min-w-0 pr-3">
            {/* The line between steps: solid up to the last done step, hairline after. */}
            {i > 0 && (
              <span
                aria-hidden
                className={cn("absolute top-[11px] left-[-100%] hidden h-[2px] w-full sm:block", steps[i - 1].done && step.done ? "bg-brand-600" : "bg-line")}
              />
            )}
            <span
              className={cn(
                "relative z-10 grid size-6 place-items-center rounded-full border-2 text-brand-on",
                step.done ? "border-brand-600 bg-brand-600" : step.current ? "border-brand-600 bg-card" : "border-line-strong bg-card",
              )}
            >
              {step.done && <IconCheck className="size-3.5" />}
              {step.current && <span className="size-2 rounded-full bg-brand-600" aria-hidden />}
            </span>
            <p className={cn("mt-2 text-13-5 font-semibold", step.done || step.current ? "text-ink" : "text-faint")}>
              {step.label}
              {step.current && <span className="sr-only"> (current)</span>}
            </p>
            {step.at && <p className="text-12 text-muted">{formatDate(step.at, "dateTime")}</p>}
            {step.note && <p className="font-mono text-12 text-muted">{step.note}</p>}
          </li>
        ))}
      </ol>
      {stopped && (
        <p className="mt-3 border-t border-line pt-3 text-13 text-muted">
          This order is {order.status_label.toLowerCase()} — nothing further will be dispatched.
        </p>
      )}
      {order.tracking_url && dispatched && (
        <p className="mt-3 border-t border-line pt-3 text-13">
          <a href={order.tracking_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-ink underline underline-offset-2">
            Track the parcel
          </a>
        </p>
      )}
    </div>
  );
}
