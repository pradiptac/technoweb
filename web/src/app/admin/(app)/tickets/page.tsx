import Link from "next/link";
import { Badge, PriorityBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { IconTicket } from "@/components/icons";
import { getStaff, getTickets, type TicketQueueParams } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { TicketRowActions } from "./ticket-row";
import type { Paginated, StaffUser, Ticket, TicketPriority, TicketStatus } from "@/types/api";
import type { ReactNode } from "react";

export const metadata = buildMetadata({ title: "Tickets", path: "/admin/tickets", seo: noIndex });

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In progress" },
  { value: "pending_customer", label: "Pending customer" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const PRIORITY_OPTIONS: { value: TicketPriority; label: string }[] = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
];

function formatDate(iso: string) {
  // No year: in a table it is nearly always the current one, and the
  // extra four characters wrap the column onto a second line. The full
  // date stays available in the cell's title attribute.
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(d);
}

function FilterField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="mb-0.5 block text-[11px] font-semibold text-faint">{label}</label>
      {children}
    </div>
  );
}

type SearchParams = {
  status?: string; priority?: string; assigned_to?: string; overdue?: string; q?: string; page?: string;
};

export default async function AdminTicketsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const queryParams: TicketQueueParams = {
    status: params.status as TicketStatus | undefined,
    priority: params.priority as TicketPriority | undefined,
    overdue: params.overdue === "1",
    q: params.q,
    page: Number(params.page) || 1,
  };
  if (params.assigned_to === "unassigned") queryParams.unassigned = true;
  else if (params.assigned_to) queryParams.assigned_to = Number(params.assigned_to);

  let result: Paginated<Ticket> | null = null;
  let staff: StaffUser[] = [];
  try {
    [result, staff] = await Promise.all([getTickets(queryParams), getStaff()]);
  } catch {
    return (
      <ErrorState title="We could not load the ticket queue">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const tickets = result.data;
  const hasFilters = Boolean(params.status || params.priority || params.assigned_to || params.overdue || params.q);
  const paginationParams: Record<string, string | undefined> = {
    status: params.status, priority: params.priority, assigned_to: params.assigned_to,
    overdue: params.overdue, q: params.q,
  };

  return (
    <>
      <h1 className="admin-title mb-6">Tickets</h1>

      <form className="mb-3 flex flex-wrap items-end gap-x-2 gap-y-2 border-b border-line pb-3" action="/admin/tickets">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Reference, subject, customer…" className="min-w-[200px] py-1.5 text-[13px]" />
        </FilterField>
        <FilterField label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">All</option>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Priority" htmlFor="priority">
          <Select id="priority" name="priority" defaultValue={params.priority ?? ""}>
            <option value="">All</option>
            {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Assignee" htmlFor="assigned_to">
          <Select id="assigned_to" name="assigned_to" defaultValue={params.assigned_to ?? ""}>
            <option value="">All</option>
            <option value="unassigned">Unassigned</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </FilterField>
        <label className="flex items-center gap-2 pb-2.5 text-[13.5px]">
          <input type="checkbox" name="overdue" value="1" defaultChecked={params.overdue === "1"} />
          Overdue only
        </label>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {hasFilters && <ButtonLink href="/admin/tickets" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </form>

      {tickets.length === 0 ? (
        <EmptyState icon={<IconTicket />} title="No tickets match those filters">
          Try a different combination, or clear the filters to see the full queue.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-white">
          <table className="admin-table w-full min-w-[860px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line-strong text-[10.5px] font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Ticket</th>
                <th scope="col" className="px-3 py-1.5 md:max-xl:hidden">Category</th>
                <th scope="col" className="px-3 py-1.5">Priority</th>
                <th scope="col" className="px-3 py-1.5 md:max-xl:hidden">Due</th>
                {/*
                  Category and Due are hidden between md and xl, not below md:
                  under md the row is a card and every field is worth showing,
                  but in the table band the two inline selects need ~205px each
                  to show "Pending customer" without clipping, and five columns
                  plus those will not fit 691px. These two are the ones a
                  triaging eye needs least; both are still on the ticket.
                */}
                <th scope="col" className="px-3 py-1.5">Status &amp; assignee</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} className="border-b border-line last:border-b-0 align-top">
                  <td data-label="Ticket" className="px-3 py-2">
                    <Link href={`/admin/tickets/${t.reference}`} className="block hover:underline">
                      {/*
                        min-w-0 on both, or the truncate never fires. A flex
                        item's automatic minimum size is its min-content —
                        here the whole subject line, because truncate sets
                        white-space: nowrap. So the cell demanded the full
                        subject width and pushed this table to 738px inside a
                        691px wrapper, clipping the Status column off the
                        right. max-w-[44ch] caps it on a wide screen; min-w-0
                        is what lets it give way on a narrow one.
                      */}
                      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                        <span className="font-mono text-[11.5px] text-faint">{t.reference}</span>
                        <span className="min-w-0 max-w-[26ch] truncate text-[13.5px] font-medium text-ink xl:max-w-[44ch]">{t.subject}</span>
                        {t.is_overdue && <Badge tone="urgent">Overdue</Badge>}
                      </span>
                    </Link>
                    <p className="text-[12px] text-muted">
                      {t.customer?.company ?? t.customer?.name ?? "Unknown customer"}
                    </p>
                  </td>
                  <td data-label="Category" className="px-3 py-2 text-muted md:max-xl:hidden">{t.category?.name ?? "Uncategorised"}</td>
                  <td data-label="Priority" className="px-3 py-2"><PriorityBadge priority={t.priority} /></td>
                  <td data-label="Due" className="px-3 py-2 text-muted md:max-xl:hidden">{t.due_at ? formatDate(t.due_at) : "—"}</td>
                  <td data-label="Status &amp; assignee" className="px-3 py-2">
                    <TicketRowActions ticket={t} staff={staff} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/tickets" params={paginationParams} />
    </>
  );
}
