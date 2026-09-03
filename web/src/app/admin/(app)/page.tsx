import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge, PriorityBadge, TONE_BAR, statusTone, statusLabel } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/empty";
import { getDashboard } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { cn } from "@/lib/utils";
import { IconTicket, IconClock, IconUsers, IconBox, IconPen, IconMail } from "@/components/icons";
import { StatTile, type Tone } from "@/components/admin/stat-tile";
import { DashboardMetricsPanel } from "./metrics";
import type { AdminDashboard, Ticket, TicketStatus } from "@/types/api";
import type { SVGProps } from "react";

export const metadata = buildMetadata({ title: "Dashboard", path: "/admin", seo: noIndex });

function TicketRow({ ticket }: { ticket: Ticket }) {
  return (
    <li>
      <Link
        href={`/admin/tickets/${ticket.reference}`}
        className="block rounded-lg border border-line-strong bg-card p-4 transition-colors duration-200 hover:border-brand-300 hover:bg-brand-50"
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

  /*
   * `StatTile` takes a formatted string, because the tile it is shared with
   * shows rates as well as counts and "24%" is not a number. Grouping stays
   * here, where the figure is known to be one.
   */
  const n = (v: number) => v.toLocaleString();

  /*
   * Two of these change colour with their own value, because a red panel
   * reading "0 overdue" invents an alarm that is not there -- and a dashboard
   * that cries wolf is one nobody reads. Nothing overdue is good news and gets
   * the green; nothing waiting is simply quiet.
   */
  const tiles: {
    label: string; value: string; href?: string; tone: Tone;
    icon: (p: SVGProps<SVGSVGElement>) => React.ReactElement;
  }[] = [
    { label: "Open tickets", value: n(dashboard.counts.open_tickets), tone: "info", icon: IconTicket },
    {
      label: "Overdue tickets", value: n(dashboard.counts.overdue_tickets),
      href: "/admin/tickets?overdue=1",
      tone: dashboard.counts.overdue_tickets > 0 ? "err" : "ok",
      // A clock, not a warning triangle: the tile already goes red when there
      // is something to be alarmed about, and green with a warning sign on it
      // is two things saying opposite words.
      icon: IconClock,
    },
    { label: "Active customers", value: n(dashboard.counts.customers), tone: "ok", icon: IconUsers },
    { label: "Published products", value: n(dashboard.counts.products), tone: "brand", icon: IconBox },
    { label: "Published blog posts", value: n(dashboard.counts.blog_posts), tone: "brand", icon: IconPen },
    {
      label: "New enquiries", value: n(dashboard.counts.new_enquiries),
      tone: dashboard.counts.new_enquiries > 0 ? "warn" : "info",
      icon: IconMail,
    },
  ];

  /*
   * The sales pipeline, and only for somebody who can open it.
   *
   * The API sends `leads: null` to a caller without `sales_manager`, so a
   * support engineer sees nothing here rather than figures whose tile answers
   * 403 when pressed — the argument `admin-nav.tsx` already makes for filtering
   * the sidebar. Null and not zeroes, because zero is a measurement and this is
   * an absence of one.
   *
   * **Overdue is the only tile that goes red.** A lead was promised a reply by
   * a date that has passed, which is the one figure here that is somebody
   * waiting; "new" and "unassigned" are ordinary states of a working pipeline
   * and colouring them as alarms is how a dashboard stops being read. Same rule
   * the ticket tiles above already follow.
   *
   * Each href is the filter that produces the number, so the tile and the list
   * it opens cannot disagree — the rule the store's `attention` block follows.
   */
  if (dashboard.leads) {
    tiles.push(
      {
        label: "New leads", value: n(dashboard.leads.new),
        href: "/admin/leads?status=new",
        tone: dashboard.leads.new > 0 ? "warn" : "info",
        icon: IconMail,
      },
      {
        label: "Overdue follow-ups", value: n(dashboard.leads.overdue),
        href: "/admin/leads?overdue=1",
        tone: dashboard.leads.overdue > 0 ? "err" : "ok",
        icon: IconClock,
      },
      {
        label: "Unassigned leads", value: n(dashboard.leads.unassigned),
        href: "/admin/leads?unassigned=1&open=1",
        tone: "info",
        icon: IconUsers,
      },
    );
  }

  const breakdown = Object.entries(dashboard.status_breakdown);
  const breakdownTotal = breakdown.reduce((sum, [, n]) => sum + n, 0) || 1;

  return (
    <>
      <PageHeader title="Dashboard" />

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <li key={t.label}><StatTile {...t} /></li>
        ))}
      </ul>

      <DashboardMetricsPanel metrics={dashboard.metrics} />

      {/* Recent tickets used to sit beside this. It was the queue with a
          different heading — /admin/tickets already lists newest-first and is
          one click away — so the dashboard was spending half its width
          repeating a screen rather than telling you what needs attention. */}
      <section className="mt-9">
        <h2 className="mb-3.5 text-[15px] font-semibold">High priority</h2>
        {dashboard.high_priority.length === 0 ? (
          <p className="text-[13.5px] text-muted">Nothing critical or high priority open right now.</p>
        ) : (
          <ul className="grid gap-2 lg:grid-cols-2">
            {dashboard.high_priority.map((t) => <TicketRow key={t.id} ticket={t} />)}
          </ul>
        )}
      </section>

      <section className="mt-9">
        <h2 className="mb-3.5 text-[15px] font-semibold">Status breakdown</h2>
        {/* An empty ul renders as a blank card that reads as broken, and a
            division by a zero total would render NaN-width bars anyway. */}
        {breakdownTotal === 0 ? (
          <p className="rounded-lg border border-line-strong bg-card p-5 text-[14px] text-muted">
            No tickets yet, so there is nothing to break down.
          </p>
        ) : (
        <ul className="grid gap-2.5 rounded-lg border border-line-strong bg-card p-5">
          {breakdown.map(([label, count]) => (
            <li key={label} className="flex items-center gap-3">
              {/* The API sends the status value; the wording is this side's
                  business, and `statusLabel` is the one place it is decided. */}
              <span className="w-[132px] shrink-0 text-[13px] text-muted">
                {statusLabel[label as TicketStatus] ?? label}
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                <span
                  // Same tone the status badge uses for that word. One map,
                  // exported from badge.tsx, so the chart and the queue cannot
                  // disagree about what "In progress" looks like.
                  className={cn("block h-full rounded-full", TONE_BAR[statusTone[label as TicketStatus] ?? "closed"])}
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
