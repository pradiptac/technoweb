import type { Step, StepState } from "@/components/ui/stepper";
import type { TicketStatus } from "@/types/api";

/**
 * A ticket's status as a journey (2026-10-05), for `Stepper` on the
 * customer's screens. (An order has its own, `components/store/order-timeline.tsx`,
 * which reads the stamps as well as the status.) Pure: the API's status is the only input, so the stepper can
 * never disagree with the badge beside it.
 */

function walk(labels: string[], at: number, waitingNote?: string): Step[] {
  return labels.map((label, i) => {
    const state: StepState = i < at ? "done" : i === at ? (waitingNote ? "waiting" : "current") : "upcoming";
    return { label, state, note: i === at && waitingNote ? waitingNote : undefined };
  });
}

/** Received → assigned → being worked on → resolved → closed. A merged ticket has no journey of its own. */
export function ticketSteps(status: TicketStatus): Step[] {
  const labels = ["Received", "With an engineer", "Being worked on", "Resolved", "Closed"];
  switch (status) {
    case "open": return walk(labels, 0);
    case "assigned": return walk(labels, 1);
    case "in_progress": return walk(labels, 2);
    case "pending_customer": return walk(labels, 2, "Waiting for your reply");
    case "resolved": return walk(labels, 3);
    case "closed": return labels.map((label) => ({ label, state: "done" }));
  }
}
