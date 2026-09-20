import { Badge } from "@/components/ui/badge";
import type { ApplicationStatus } from "@/types/api";

/**
 * One mapping from application status to badge tone.
 *
 * `new` takes the warn tone rather than the neutral one for the same reason a
 * pending customer does: it is the only status that means somebody outside the
 * building is waiting, and a queue that looks like an archive is a queue nobody
 * works.
 */
const tone: Record<ApplicationStatus, "open" | "progress" | "resolved" | "closed" | "urgent"> = {
  new: "progress",
  shortlisted: "open",
  interviewing: "open",
  offered: "resolved",
  hired: "resolved",
  rejected: "closed",
};

export function ApplicationStatusBadge({ status, label }: { status: ApplicationStatus; label: string }) {
  return <Badge tone={tone[status]}>{label}</Badge>;
}
