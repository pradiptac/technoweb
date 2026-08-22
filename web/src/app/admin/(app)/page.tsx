import Link from "next/link";
import { StatusBadge, PriorityBadge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/empty";
import { getDashboard } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { cn } from "@/lib/utils";
import type { AdminDashboard, Ticket } from "@/types/api";

export const metadata = buildMetadata({ title: "Dashboard", path: "/admin", seo: noIndex });

function StatTile({ label, value, href }: { label: string; value: number; href?: string }) {
  const box = (
    <>
      <p className="text-[28px] font-semibold tracking-[-.02em]">{value}</p>
      <p className="mt-1 text-[13px] text-muted">{label}</p>
    </>
  );
  const base = "rounded-lg border border-line-strong bg-white p-5";

  return href ? (
    <Link href={href} className={cn(base, "block transition-all duration-200 ease-brand hover:border-brand-300 hover:shadow-2 hover:-translate-y-0.5")}>
      {box}
    </Link>
  ) : (
    <div className={base}>{box}</div>
  );
}

function TicketRow({ ticket }: { ticket: Ticket }) {
  return (
    <li>
      <Link
        href={`/admin/tickets/${ticket.reference}`}
        className="block rounded-lg border border-line-strong bg-white p-4 transition-colors duration-200 hover:border-brand-300 hover:bg-brand-50"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="font-mono text-xs text-muted">{ticket.reference}</span>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <PriorityBadge priority={ticket.priority} />
            <StatusBadge status={ticket.status} />
          </span>
        </div>
        <h3 className="mt-1.5 text-[14.5px]">{ticket.subject}</h3>
        <p className="mt-1 text-[13px] text-muted">
          {ticket.customer?.company ?? ticket.customer?.name ?? "Unknown customer"}
          {ticket.assigned_to ? ` · ${ticket.assigned_to.name}` : " · unassigned"}
        </p>
      </Link>
    </li>
  );
}

export default async function AdminDashboardPage() {
  let dashboard: AdminDashboard | null = null;
  try {
    dashboard = await getDashboard();
  } catch {
    return (
      <ErrorState title="We could not load the dashboard">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const tiles: { label: string; value: number; href?: string }[] = [
    { label: "Open tickets", value: dashboard.counts.open_tickets },
    { label: "Overdue tickets", value: dashboard.counts.overdue_tickets, href: "/admin/tickets?overdue=1" },
    { label: "Active customers", value: dashboard.counts.customers },
    { label: "Published products", value: dashboard.counts.products },
    { label: "Published blog posts", value: dashboard.counts.blog_posts },
    { label: "New enquiries", value: dashboard.counts.new_enquiries },
  ];

  const breakdown = Object.entries(dashboard.status_breakdown);
  const breakdownTotal = breakdown.reduce((sum, [, n]) => sum + n, 0) || 1;

  return (
    <>
      <h1 className="admin-title mb-6">Dashboard</h1>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <li key={t.label}><StatTile {...t} /></li>
        ))}
      </ul>

      <div className="mt-9 grid gap-9 lg:grid-cols-2">
        <section>
          <h2 className="mb-3.5 text-[15px] font-semibold">Recent tickets</h2>
          {dashboard.recent_tickets.length === 0 ? (
            <p className="text-[13.5px] text-muted">No tickets yet.</p>
          ) : (
            <ul className="grid gap-2">
              {dashboard.recent_tickets.map((t) => <TicketRow key={t.id} ticket={t} />)}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3.5 text-[15px] font-semibold">High priority</h2>
          {dashboard.high_priority.length === 0 ? (
            <p className="text-[13.5px] text-muted">Nothing critical or high priority open right now.</p>
          ) : (
            <ul className="grid gap-2">
              {dashboard.high_priority.map((t) => <TicketRow key={t.id} ticket={t} />)}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-9">
        <h2 className="mb-3.5 text-[15px] font-semibold">Status breakdown</h2>
        {/* An empty ul renders as a blank card that reads as broken, and a
            division by a zero total would render NaN-width bars anyway. */}
        {breakdownTotal === 0 ? (
          <p className="rounded-lg border border-line-strong bg-white p-5 text-[14px] text-muted">
            No tickets yet, so there is nothing to break down.
          </p>
        ) : (
        <ul className="grid gap-2.5 rounded-lg border border-line-strong bg-white p-5">
          {breakdown.map(([label, count]) => (
            <li key={label} className="flex items-center gap-3">
              <span className="w-[132px] shrink-0 text-[13px] text-muted">{label}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                <span
                  className="block h-full rounded-full bg-brand-500"
                  style={{ width: `${Math.round((count / breakdownTotal) * 100)}%` }}
                />
              </span>
              <span className="w-6 shrink-0 text-right text-[13px] font-semibold">{count}</span>
            </li>
          ))}
        </ul>
        )}
      </section>
    </>
  );
}
