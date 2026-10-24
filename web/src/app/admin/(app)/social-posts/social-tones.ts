import type { SocialPostStatus } from "@/types/social-posts";

/** One badge colour per status, shared by the list and the review panel. */
export const statusTone: Record<SocialPostStatus, "open" | "progress" | "resolved" | "closed" | "urgent"> = {
  draft: "open",
  sending: "progress",
  sent: "resolved",
  shared_manually: "resolved",
  failed: "urgent",
  unconfirmed: "progress",
  discarded: "closed",
};
