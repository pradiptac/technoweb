import { cn } from "@/lib/utils";
import type { OrderStatus, TicketPriority, TicketStatus } from "@/types/api";

/*
  The border is the badge's own text colour at low alpha, not a literal.

  The text was already tokenised and inverted correctly; the borders were four
  pale hexes chosen for the light palette, so in dark a near-black chip wore a
  bright pastel outline. Same defect `Alert` had, and the same fix — a border
  derived from the token cannot drift from it.
*/
const tone = {
  open: "bg-info-soft text-info border-info/25",
  progress: "bg-warn-soft text-warn border-warn/25",
  resolved: "bg-ok-soft text-ok border-ok/25",
  closed: "bg-surface-2 text-muted border-line-strong",
  urgent: "bg-err-soft text-err border-err/25",
  /* For standing rather than state — an elevated role, not a problem. */
  brand: "bg-brand-50 text-brand-ink border-brand-200",
} as const;

type Tone = keyof typeof tone;

export function Badge({
  children, tone: t = "closed", dot = true, className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  /**
   * The leading dot.
   *
   * On by default, because a badge here almost always stands for a *state* —
   * open, overdue, paid — and the dot is what makes a row of them scannable
   * without reading. A blog category is not a state, it is a label, and a
   * column of dotted pills down a card reads as a status list. Off for those.
   */
  dot?: boolean;
  className?: string;
}) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold tracking-[.03em] whitespace-nowrap",
      tone[t], className,
    )}>
      {dot && <i className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

/**
 * The solid fill a chart bar uses for a tone.
 *
 * Exported beside the badge tones so a bar and a badge for the same word are
 * the same colour by construction. Two maps would drift the first time
 * somebody restyled one of them, and a dashboard where "Critical" is red in
 * the list and green in the chart is worse than one with no colour at all.
 *
 * These are fills behind no text, so the bar they sit in is a graphical object
 * -- WCAG 1.4.11's 3:1 against the track, not 4.5:1. `closed` is `bg-muted`
 * rather than the badge's `bg-surface-2`, because the track *is* surface-2 and
 * a bar the colour of its own track is not a bar.
 */
export const TONE_BAR: Record<Tone, string> = {
  open: "bg-info",
  progress: "bg-warn",
  resolved: "bg-ok",
  closed: "bg-muted",
  urgent: "bg-err",
  brand: "bg-brand-500",
};

/**
 * An order status, as a tone.
 *
 * Here rather than in the orders list, where it started, for the reason
 * `TONE_BAR` is here: the dashboard draws a dot for the same word the queue
 * draws a badge for, and two maps drift the first time somebody restyles one.
 * The same argument the ticket module already settled.
 *
 * `refund_requested` is the only `urgent`: it is the one state where somebody
 * is waiting on a decision a person has to make. `pending_payment` is `open`
 * rather than a warning — a basket at the payment screen is ordinary, and
 * colouring every one of them as a problem makes the colour mean nothing by
 * the end of the first week.
 */
export const orderStatusTone: Record<OrderStatus, Tone> = {
  pending_payment: "open",
  paid: "resolved",
  processing: "progress",
  ready_for_dispatch: "progress",
  dispatched: "progress",
  completed: "resolved",
  cancelled: "closed",
  refund_requested: "urgent",
  refunded: "closed",
};

/**
 * A lead's pipeline status, as a tone.
 *
 * Here beside the others for the reason `TONE_BAR` is: the queue and the
 * detail screen both draw a badge for the same word, and two maps drift the
 * first time somebody restyles one.
 *
 * `new` is `open` rather than a warning — an unanswered enquiry an hour old is
 * ordinary, and colouring every one as a problem makes the colour mean nothing
 * by the end of the first week. Overdue is what earns `urgent`, and it is a
 * separate badge because it is a different fact.
 */
export const leadStatusTone: Record<string, Tone> = {
  new: "open",
  contacted: "progress",
  qualified: "brand",
  won: "resolved",
  lost: "closed",
  spam: "closed",
};

/**
 * A score band.
 *
 * `unscored` is deliberately not a colour at all — a backfilled lead that was
 * never measured is not a lead that scored zero, and rendering the two the same
 * would be the number claiming something it never established.
 */
export const leadBandTone: Record<string, Tone> = {
  hot: "urgent",
  warm: "progress",
  cold: "closed",
  unscored: "closed",
};

export const statusTone: Record<TicketStatus, Tone> = {
  open: "open", assigned: "open", in_progress: "progress",
  pending_customer: "progress", resolved: "resolved", closed: "closed",
};
export const statusLabel: Record<TicketStatus, string> = {
  open: "Open", assigned: "Assigned", in_progress: "In progress",
  pending_customer: "Pending customer", resolved: "Resolved", closed: "Closed",
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <Badge tone={statusTone[status]}>{statusLabel[status]}</Badge>;
}

export const priorityTone: Record<TicketPriority, Tone> = {
  low: "closed", normal: "closed", high: "progress", critical: "urgent",
};
const priorityLabel: Record<TicketPriority, string> = {
  low: "Low", normal: "Normal", high: "High", critical: "Critical",
};

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return <Badge tone={priorityTone[priority]}>{priorityLabel[priority]}</Badge>;
}
