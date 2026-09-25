/**
 * Badge tones for the messaging states, in one place so the list, the
 * editor and the report colour a word the same way.
 */
export function approvalTone(status: string): "resolved" | "progress" | "urgent" | "closed" | "open" {
  switch (status) {
    case "approved":
    case "not_required":
      return "resolved";
    case "pending":
      return "progress";
    case "rejected":
    case "paused":
      return "urgent";
    default:
      return "closed";
  }
}

export function broadcastTone(status: string): "resolved" | "progress" | "urgent" | "closed" | "open" {
  switch (status) {
    case "sent":
      return "resolved";
    case "sending":
      return "progress";
    case "scheduled":
      return "open";
    case "cancelled":
      return "urgent";
    default:
      return "closed";
  }
}

export function deliveryTone(status: string): "resolved" | "progress" | "urgent" | "closed" | "open" {
  switch (status) {
    case "read":
    case "delivered":
      return "resolved";
    case "sent":
      return "open";
    case "failed":
      return "urgent";
    case "pending":
      return "progress";
    default:
      return "closed";
  }
}
