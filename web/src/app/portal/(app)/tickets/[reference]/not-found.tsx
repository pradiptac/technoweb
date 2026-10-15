import Link from "next/link";
import { EmptyState } from "@/components/ui/empty";
import { IconTicket } from "@/components/icons";

export default function TicketNotFound() {
  return (
    <>
    {/* The page's one h1 — the portal layout has no heading of its own. */}
    <h1 className="sr-only">My tickets</h1>
    <EmptyState
      icon={<IconTicket />}
      title="Ticket not found"
      action={
        <Link
          href="/portal/tickets"
          className="rounded border border-line-strong bg-card px-4 py-[11px] text-13-5 font-semibold hover:border-faint"
        >
          Back to my tickets
        </Link>
      }
    >
      This reference does not match any ticket on your account. Check the reference, or
      browse your tickets below.
    </EmptyState>
    </>
  );
}
