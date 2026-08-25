import { cn } from "@/lib/utils";
import type { TicketPriority, TicketStatus } from "@/types/api";

const tone = {
  open: "bg-info-soft text-info border-[#d6e4ee]",
  progress: "bg-warn-soft text-warn border-[#f2e2c6]",
  resolved: "bg-ok-soft text-ok border-[#d3e8cf]",
  closed: "bg-surface-2 text-muted border-line-strong",
  urgent: "bg-err-soft text-err border-[#f0d5d5]",
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

const statusTone: Record<TicketStatus, Tone> = {
  open: "open", assigned: "open", in_progress: "progress",
  pending_customer: "progress", resolved: "resolved", closed: "closed",
};
const statusLabel: Record<TicketStatus, string> = {
  open: "Open", assigned: "Assigned", in_progress: "In progress",
  pending_customer: "Pending customer", resolved: "Resolved", closed: "Closed",
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <Badge tone={statusTone[status]}>{statusLabel[status]}</Badge>;
}

const priorityTone: Record<TicketPriority, Tone> = {
  low: "closed", normal: "closed", high: "progress", critical: "urgent",
};
const priorityLabel: Record<TicketPriority, string> = {
  low: "Low", normal: "Normal", high: "High", critical: "Critical",
};

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return <Badge tone={priorityTone[priority]}>{priorityLabel[priority]}</Badge>;
}
