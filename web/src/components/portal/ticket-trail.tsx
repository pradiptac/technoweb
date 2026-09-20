import { formatDate } from "@/lib/dates";
import type { TicketEvent, TicketStatus } from "@/types/api";

const STATUS: Record<string, string> = {
  open: "Open", assigned: "Assigned", in_progress: "In progress", pending_customer: "Waiting on you",
  resolved: "Resolved", closed: "Closed",
};

/** A trail line as a sentence — the customer's own words for each state, never the enum's. */
function sentence(e: TicketEvent): string | null {
  const to = e.to ? (STATUS[e.to] ?? e.to) : null;
  switch (e.type) {
    case "created": return "Raised";
    case "assigned": return e.to ? `Assigned to ${e.to}` : "Unassigned";
    case "status_changed": return to ? `Marked ${to.toLowerCase()}` : null;
    case "priority_changed": return e.to ? `Priority set to ${e.to}` : null;
    case "closed_by_customer": return "Closed by you";
    case "reopened_by_customer": return "Reopened by you";
    default: return null;
  }
}

/**
 * The ticket's history the desk always saw and the customer never did:
 * raised, assigned, in progress, resolved — each with who and when. A
 * compact vertical line above the conversation, because a status badge
 * says where a ticket is and not how it got there.
 *
 * Built from the `events` the API sends (status and assignment changes,
 * never a note — the `publicMessages` boundary). An event type this file
 * has no sentence for is skipped rather than shown raw.
 */
export function TicketTrail({ events, status }: { events: TicketEvent[]; status: TicketStatus }) {
  const rows = events.map((e) => ({ ...e, text: sentence(e) })).filter((e) => e.text);
  if (rows.length < 2) return null;

  return (
    <ol className="mb-8 border-l-2 border-line pl-4 text-13" aria-label="Ticket history">
      {rows.map((e, i) => {
        const last = i === rows.length - 1;
        return (
          <li key={`${e.type}-${e.at}-${i}`} className="relative pb-3 last:pb-0">
            <span
              aria-hidden
              className={`absolute top-[5px] left-[-21px] size-2.5 rounded-full border-2 ${last ? "border-brand-600 bg-brand-600" : "border-line-strong bg-card"}`}
            />
            <span className={last ? "font-semibold text-ink" : "text-ink-2"}>{e.text}</span>
            <span className="ml-2 text-muted">
              {e.by && e.type !== "assigned" ? `by ${e.by} · ` : ""}
              {e.at ? formatDate(e.at, "dateTime") : ""}
            </span>
            {last && status && <span className="sr-only"> (current)</span>}
          </li>
        );
      })}
    </ol>
  );
}
