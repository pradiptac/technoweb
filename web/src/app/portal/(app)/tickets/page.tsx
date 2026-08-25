import Link from "next/link";
import { Badge, PriorityBadge, StatusBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { IconTicket } from "@/components/icons";
import { getTickets } from "@/lib/portal";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { cn } from "@/lib/utils";
import { NewTicketButton } from "../portal-nav";
import type { Paginated, Ticket } from "@/types/api";

export const metadata = buildMetadata({ title: "My tickets", path: "/portal/tickets", seo: noIndex });

const filters = [
  { label: "All", value: undefined },
  { label: "Open", value: "open" },
  { label: "In progress", value: "in_progress" },
  { label: "Awaiting you", value: "pending_customer" },
  { label: "Resolved", value: "resolved" },
  { label: "Closed", value: "closed" },
];

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(iso));
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const params = await searchParams;

  let result: Paginated<Ticket> | null = null;
  try {
    result = await getTickets({ status: params.status, page: Number(params.page) || 1 });
  } catch {
    return (
      <ErrorState title="We could not load your tickets">
        The support system is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const tickets = result.data;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h2 className="display-3">My tickets</h2>
        <div className="ml-auto"><NewTicketButton /></div>
      </div>

      <ul className="mb-6 flex flex-wrap gap-1.5" aria-label="Filter by status">
        {filters.map((f) => {
          const active = params.status === f.value || (!params.status && !f.value);
          return (
            <li key={f.label}>
              <Link
                href={f.value ? `/portal/tickets?status=${f.value}` : "/portal/tickets"}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "block rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors duration-200",
                  active
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-line-strong bg-card text-muted hover:border-faint hover:text-ink",
                )}
              >
                {f.label}
              </Link>
            </li>
          );
        })}
      </ul>

      {tickets.length === 0 ? (
        <EmptyState
          icon={<IconTicket />}
          title={params.status ? "Nothing with that status" : "No tickets yet"}
          action={params.status ? undefined : <NewTicketButton />}
        >
          {params.status
            ? "Try a different filter, or view all tickets."
            : "Raise your first ticket and it lands straight on the support desk."}
        </EmptyState>
      ) : (
        <ul className="grid gap-2.5">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link
                href={`/portal/tickets/${t.reference}`}
                className="block rounded-lg border border-line-strong bg-card p-4.5 transition-colors duration-200 hover:border-brand-300 hover:bg-brand-50"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="font-mono text-xs text-muted">{t.reference}</span>
                  {t.is_overdue && <Badge tone="urgent">Overdue</Badge>}
                  <span className="ml-auto flex flex-wrap items-center gap-2">
                    <PriorityBadge priority={t.priority} />
                    <StatusBadge status={t.status} />
                  </span>
                </div>
                <h3 className="mt-2 text-[15.5px]">{t.subject}</h3>
                <p className="mt-1.5 text-[13px] text-muted">
                  {t.category?.name ?? "Uncategorised"} · raised {formatDate(t.created_at)}
                  {t.assigned_to ? ` · ${t.assigned_to.name}` : " · not yet assigned"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {result.meta.last_page > 1 && (
        <nav className="mt-7 flex items-center justify-between gap-3" aria-label="Pagination">
          <span className="text-[13px] text-muted">
            Page {result.meta.current_page} of {result.meta.last_page} · {result.meta.total} tickets
          </span>
          <span className="flex gap-2">
            {result.meta.current_page > 1 && (
              <Link
                href={`/portal/tickets?${new URLSearchParams({ ...(params.status ? { status: params.status } : {}), page: String(result.meta.current_page - 1) })}`}
                className="rounded border border-line-strong bg-card px-3.5 py-2.5 text-[13.5px] font-semibold hover:border-faint"
              >
                Previous
              </Link>
            )}
            {result.meta.current_page < result.meta.last_page && (
              <Link
                href={`/portal/tickets?${new URLSearchParams({ ...(params.status ? { status: params.status } : {}), page: String(result.meta.current_page + 1) })}`}
                className="rounded border border-line-strong bg-card px-3.5 py-2.5 text-[13.5px] font-semibold hover:border-faint"
              >
                Next
              </Link>
            )}
          </span>
        </nav>
      )}
    </>
  );
}
