import { Badge } from "@/components/ui/badge";
import type { CustomerStatus } from "@/types/api";

/**
 * One mapping from account status to badge tone, shared by the list and the
 * detail screen.
 *
 * `pending` is deliberately the warn tone rather than the neutral one: it is
 * the only status that means somebody outside the building is waiting, and a
 * queue that looks the same as an archive is a queue nobody works.
 */
const tone: Record<CustomerStatus, "open" | "progress" | "resolved" | "closed" | "urgent"> = {
  pending: "progress",
  active: "resolved",
  rejected: "urgent",
  suspended: "closed",
};

export function CustomerStatusBadge({
  status, label,
}: {
  status: CustomerStatus;
  label: string;
}) {
  return <Badge tone={tone[status]}>{label}</Badge>;
}

/**
 * Whether the address was ever confirmed.
 *
 * Shown beside the status rather than folded into it, because they answer
 * different questions and an account can be approved without one — staff who
 * know a customer may activate them off a phone call. Somebody reviewing the
 * queue has to be able to see which they are looking at.
 */
export function VerifiedBadge({ verified }: { verified: boolean }) {
  return verified
    ? <Badge tone="open">Email confirmed</Badge>
    : <Badge tone="urgent">Email unconfirmed</Badge>;
}
