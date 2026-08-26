import { cn } from "@/lib/utils";
import type { TicketPriority, TicketStatus } from "@/types/api";

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

export function Badge({ children, tone: t = "closed", className }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold tracking-[.03em] whitespace-nowrap",
      tone[t], className,
    )}>
      <i className="size-1.5 rounded-full bg-current" aria-hidden />
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
