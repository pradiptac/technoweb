import Link from "next/link";
import { EmptyState } from "@/components/ui/empty";
import { IconTicket } from "@/components/icons";

export default function AdminTicketNotFound() {
  return (
    <EmptyState
      icon={<IconTicket />}
      title="Ticket not found"
      action={
        <Link
          href="/admin/tickets"
          className="rounded border border-line-strong bg-card px-4 py-[11px] text-[13.5px] font-semibold hover:border-faint"
        >
          Back to the queue
        </Link>
      }
    >
      No ticket matches that reference. Check the URL, or browse the queue below.
    </EmptyState>
  );
}
