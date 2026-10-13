import type { TenderState } from "@/types/tenders";

/**
 * A tender's window as a badge tone (0.174.0, `docs/tenders.md`).
 *
 * One map, so the list's badge and any other screen that shows a state
 * cannot colour the same word two ways — the rule a chart bar and a badge
 * for one status already follow.
 */
export function stateTone(state: TenderState): "open" | "progress" | "resolved" | "closed" {
  switch (state) {
    case "open":
      return "resolved";
    // Not `urgent`: a deadline approaching is the ordinary life of a tender,
    // and red is for something gone wrong.
    case "closing_soon":
      return "progress";
    case "upcoming":
      return "open";
    default:
      return "closed";
  }
}
