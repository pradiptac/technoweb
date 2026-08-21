import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, PriorityBadge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import { getStaff, getTicket } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { cn } from "@/lib/utils";
import { TicketRowActions } from "../ticket-row";
import { ReplyForm } from "./reply-form";
import type { StaffUser, Ticket, TicketMessage } from "@/types/api";

export async function generateMetadata({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  return buildMetadata({ title: `Ticket ${reference}`, path: `/admin/tickets/${reference}`, seo: noIndex });
}

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));

const fileSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function Message({ message }: { message: TicketMessage }) {
  const fromStaff = message.author.type === "staff";
  const internal = fromStaff && message.is_internal;

  return (
    <li
      className={cn(
        "rounded-lg border p-4.5",
        fromStaff ? "border-brand-200 bg-brand-50" : "border-line-strong bg-white",
        internal && "border-dashed",
      )}
    >
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <b className="text-[14px] font-semibold">{message.author.name}</b>
        {internal ? (
          <Badge tone="progress">Internal note</Badge>
        ) : (
          <span className={cn(
            "rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[.05em]",
            fromStaff ? "bg-brand-600 text-white" : "bg-surface-2 text-muted",
          )}>
            {fromStaff ? "Staff reply" : "Customer"}
          </span>
        )}
        <time className="ml-auto font-mono text-[11.5px] text-muted" dateTime={message.created_at}>
          {dateTime(message.created_at)}
        </time>
      </div>

      <div className="text-[14.5px] leading-[1.62] whitespace-pre-wrap">{message.body}</div>

      {message.attachments && message.attachments.length > 0 && (
        <ul className="mt-3.5 flex flex-wrap gap-2 border-t border-line pt-3">
          {message.attachments.map((a) => (
            <li key={a.id}>
              <a
                href={a.url}
                className="inline-flex items-center gap-2 rounded border border-line-strong bg-white px-2.5 py-2 text-[12.5px] font-medium hover:border-brand-300"
              >
                {a.filename}
                <span className="font-mono text-[11px] text-muted">{fileSize(a.size)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default async function AdminTicketDetailPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;

  let ticket: Ticket;
  let staff: StaffUser[] = [];
  try {
    [ticket, staff] = await Promise.all([getTicket(reference), getStaff()]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <Link href="/admin/tickets" className="inline-block py-1 text-[13.5px] font-semibold text-brand-600 hover:underline">
        ← All tickets
      </Link>

      <div className="mt-4 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-[13px] text-muted">{ticket.reference}</span>
            {ticket.is_overdue && <Badge tone="urgent">Overdue</Badge>}
            <PriorityBadge priority={ticket.priority} />
          </div>
          <h2 className="display-3 mt-3">{ticket.subject}</h2>
        </div>
        <TicketRowActions ticket={ticket} staff={staff} />
      </div>

      <dl className="mb-8 grid gap-px overflow-hidden rounded-lg border border-line-strong bg-line sm:grid-cols-2">
        {[
          { label: "Category", value: ticket.category?.name ?? "Uncategorised" },
          { label: "Raised", value: dateTime(ticket.created_at) },
        ].map((row) => (
          <div key={row.label} className="bg-white p-4">
            <dt className="text-[11.5px] font-semibold uppercase tracking-[.08em] text-muted">{row.label}</dt>
            <dd className="mt-1 text-[14px]">{row.value}</dd>
          </div>
        ))}
      </dl>

      <h3 className="mb-3 text-[17px]">Conversation</h3>
      <ul className="grid gap-3">
        {/* The original request, rendered as the first message in the thread. */}
        <li className="rounded-lg border border-line-strong bg-white p-4.5">
          <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <b className="text-[14px] font-semibold">{ticket.customer?.name ?? "Customer"}</b>
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[.05em] text-muted">
              Original request
            </span>
            <time className="ml-auto font-mono text-[11.5px] text-muted" dateTime={ticket.created_at}>
              {dateTime(ticket.created_at)}
            </time>
          </div>
          <div className="text-[14.5px] leading-[1.62] whitespace-pre-wrap">{ticket.description}</div>
        </li>

        {ticket.messages?.map((m) => <Message key={m.id} message={m} />)}
      </ul>

      <div className="mt-8 rounded-xl border border-line-strong bg-white p-6">
        <ReplyForm reference={ticket.reference} />
      </div>
    </>
  );
}
