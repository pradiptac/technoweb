import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, PriorityBadge, StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { getCurrentCustomer } from "@/lib/auth";
import { getTicket } from "@/lib/portal";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { closeAction, reopenAction } from "./actions";
import { ReplyForm } from "./reply-form";
import type { Ticket } from "@/types/api";
import { DueClock, ThreadRefresh } from "@/components/portal/ticket-live";
import { TicketThread } from "@/components/portal/ticket-thread";
import { TicketTrail } from "@/components/portal/ticket-trail";

export async function generateMetadata({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  return buildMetadata({ title: `Ticket ${reference}`, path: `/portal/tickets/${reference}`, seo: noIndex });
}

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));

export default async function TicketDetailPage({
  params, searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { reference } = await params;
  const { created } = await searchParams;

  let ticket: Ticket;
  // The customer's own name for their bubbles — the ticket read does not
  // carry the customer relation, and `getCurrentCustomer` is cached per
  // request, so the layout's read is reused.
  const me = await getCurrentCustomer();
  try {
    ticket = await getTicket(reference);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const isClosed = ticket.status === "closed";
  const isResolved = ticket.status === "resolved";

  return (
    <>
      <Link href="/portal/tickets" className="inline-block py-1 text-13-5 font-semibold text-brand-ink hover:underline">
        ← All tickets
      </Link>

      {created && (
        <div className="mt-4">
          <Alert tone="ok" title={`Ticket ${ticket.reference} submitted`}>
            An engineer will respond within your SLA. You will get an email when they do.
          </Alert>
        </div>
      )}

      <div className="mt-4 mb-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-13 text-muted">{ticket.reference}</span>
          {ticket.is_overdue && <Badge tone="urgent">Overdue</Badge>}
          <PriorityBadge priority={ticket.priority} />
          <StatusBadge status={ticket.status} />
        </div>
        <h2 className="display-3 mt-3">{ticket.subject}</h2>
      </div>

      <dl className="mb-8 grid gap-px overflow-hidden rounded-lg border border-line-strong bg-line sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Category", value: ticket.category?.name ?? "Uncategorised" },
          { label: "Assigned engineer", value: ticket.assigned_to?.name ?? "Not yet assigned" },
          { label: "Raised", value: dateTime(ticket.created_at) },
          // The clock: the API always sent `due_at`, and only "Overdue" was shown.
          { label: "Response due", value: <DueClock dueAt={ticket.due_at} open={!isClosed && !isResolved} /> },
        ].map((row) => (
          <div key={row.label} className="bg-card p-4">
            <dt className="text-11-5 font-semibold uppercase tracking-[.08em] text-muted">{row.label}</dt>
            <dd className="mt-1 text-14">{row.value}</dd>
          </div>
        ))}
      </dl>

      {ticket.events && <TicketTrail events={ticket.events} status={ticket.status} />}

      <h3 className="mb-3 text-17">Conversation</h3>
      <ThreadRefresh count={ticket.messages?.length ?? 0} open={!isClosed} />
      <TicketThread
        reference={ticket.reference}
        description={ticket.description ?? ""}
        customerName={ticket.customer?.name ?? me?.name ?? "You"}
        createdAt={ticket.created_at}
        messages={ticket.messages ?? []}
      />

      <div className="mt-8 rounded-xl border border-line-strong bg-card p-6">
        {isClosed ? (
          <div className="flex flex-wrap items-center gap-4">
            <p className="text-14-5 text-muted">
              This ticket is closed. If the problem has come back, reopen it rather than
              raising a new one — the history stays attached.
            </p>
            <form action={reopenAction}>
              <input type="hidden" name="reference" value={ticket.reference} />
              <button type="submit" className="rounded border border-line-strong bg-card px-[22px] py-[13px] text-15 font-semibold hover:border-faint">
                Reopen ticket
              </button>
            </form>
          </div>
        ) : (
          <>
            <ReplyForm reference={ticket.reference} />
            {isResolved && (
              <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-line pt-5">
                <p className="text-13-5 text-muted">Happy that this is sorted?</p>
                <form action={closeAction}>
                  <input type="hidden" name="reference" value={ticket.reference} />
                  <button type="submit" className="rounded border border-line-strong bg-card px-4 py-[11px] text-13-5 font-semibold hover:border-faint">
                    Close this ticket
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
