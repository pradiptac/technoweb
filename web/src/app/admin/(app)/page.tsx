import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge, PriorityBadge, TONE_BAR, statusTone, statusLabel } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/empty";
import { getDashboard } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { cn } from "@/lib/utils";
import { IconTicket, IconClock, IconUsers, IconBox, IconPen, IconMail, IconTools, IconMeeting } from "@/components/icons";
import { istDate } from "@/lib/visit-dates";
import { StatTile, type Tone } from "@/components/admin/stat-tile";
import { Card } from "@/components/ui/card";
import { DashboardMetricsPanel } from "./metrics";
import type { AdminDashboard, Ticket, TicketStatus } from "@/types/api";
import type { CSSProperties, SVGProps } from "react";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "Dashboard", path: "/admin", seo: noIndex });

function TicketRow({ ticket }: { ticket: Ticket }) {
  return (
    <li>
      <Link
        href={`/admin/tickets/${ticket.reference}`}
        className="block rounded-lg border border-line-strong bg-card p-4 transition-colors duration-(--duration-base) hover:border-brand-300 hover:bg-brand-50"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="font-mono text-xs text-muted">{ticket.reference}</span>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <PriorityBadge priority={ticket.priority} />
            <StatusBadge status={ticket.status} />
          </span>
        </div>
        <h3 className="mt-1.5 text-14-5">{ticket.subject}</h3>
        <p className="mt-1 text-13 text-muted">
          {ticket.customer?.company ?? ticket.customer?.name ?? "Unknown customer"}
          {ticket.assigned_to ? ` · ${ticket.assigned_to.name}` : " · unassigned"}
        </p>
      </Link>
    </li>
  );
}

export default async function AdminDashboardPage({ searchParams }: {
  searchParams: Promise<{ volume?: string }>;
}) {
  await requireScreen();
  // The volume chart's period. The API allowlists it and falls back to a month.
  const { volume } = await searchParams;
  let dashboard: AdminDashboard | null = null;
  try {
    dashboard = await getDashboard(typeof volume === "string" ? volume : undefined);
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
  /*
   * Every tile is a link to the list that produces its number, filtered the
   * same way the API counted it — `?open=1` is `Ticket::open()`, `?overdue=1`
   * is `overdue()`, and so on — so the figure and the screen behind it
   * cannot disagree. The one exception is "New enquiries", which opens the
   * leads pipeline only for somebody who may: the tile is shown to every
   * role and the list answers 403 to most of them.
   */
  type Tile = {
    label: string; value: string; href?: string; tone: Tone;
    icon: (p: SVGProps<SVGSVGElement>) => React.ReactElement;
  };

  /*
   * Grouped by the desk each figure belongs to (the client, 2026-09-29): a
   * wall of thirteen same-sized tiles made the reader sort them every time.
   * A group with no tiles for this role is not drawn at all.
   */
  const support: Tile[] = [
    { label: "Open tickets", value: n(dashboard.counts.open_tickets), href: "/admin/tickets?open=1", tone: "info", icon: IconTicket },
    {
      label: "Overdue tickets", value: n(dashboard.counts.overdue_tickets),
      href: "/admin/tickets?overdue=1",
      tone: dashboard.counts.overdue_tickets > 0 ? "err" : "ok",
      // A clock, not a warning triangle: the tile already goes red when there
      // is something to be alarmed about, and green with a warning sign on it
      // is two things saying opposite words.
      icon: IconClock,
    },
    { label: "Active customers", value: n(dashboard.counts.customers), href: "/admin/customers?status=active", tone: "ok", icon: IconUsers },
  ];
  const content: Tile[] = [
    { label: "Published products", value: n(dashboard.counts.products), href: "/admin/products?status=published", tone: "brand", icon: IconBox },
    { label: "Published blog posts", value: n(dashboard.counts.blog_posts), href: "/admin/blog?status=published", tone: "brand", icon: IconPen },
  ];
  const sales: Tile[] = [
    {
      label: "New enquiries", value: n(dashboard.counts.new_enquiries),
      href: dashboard.leads ? "/admin/leads?status=new" : undefined,
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
  const diary: Tile[] = [];

  if (dashboard.leads) {
    sales.push(
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

  /*
    Engineer visits (2026-09-26): requests waiting for somebody to pick a
    time, and what is in today's diary. Null for a role that cannot open the
    queue, the rule the leads tiles follow; each href is the queue's filter.
  */
  if (dashboard.visits) {
    const todayIst = istDate();
    diary.push(
      {
        label: "Visits to confirm", value: n(dashboard.visits.awaiting),
        href: "/admin/visits?status=requested",
        tone: dashboard.visits.awaiting > 0 ? "warn" : "info",
        icon: IconClock,
      },
      {
        label: "Visits today", value: n(dashboard.visits.today),
        href: `/admin/visits?status=confirmed&from=${todayIst}&to=${todayIst}`,
        tone: "info",
        icon: IconTools,
      },
    );
  }

  /*
    Online meetings (2026-09-29): what is in today's diary, and what is over
    and still owed an outcome. Null for a role that cannot open the list, the
    rule the visits and leads tiles follow; each href is the list's filter.
  */
  if (dashboard.meetings) {
    const todayIst = istDate();
    diary.push(
      {
        label: "Meetings today", value: n(dashboard.meetings.today),
        href: `/admin/meetings?status=scheduled&from=${todayIst}&to=${todayIst}`,
        tone: "info",
        icon: IconMeeting,
      },
      {
        label: "Meetings to record", value: n(dashboard.meetings.needs_outcome),
        href: "/admin/meetings?needs_outcome=1",
        tone: dashboard.meetings.needs_outcome > 0 ? "warn" : "ok",
        icon: IconClock,
      },
    );
  }

  const breakdown = Object.entries(dashboard.status_breakdown);
  const breakdownTotal = breakdown.reduce((sum, [, n]) => sum + n, 0) || 1;

  return (
    <>
      <PageHeader title="Dashboard" />

      {/*
        Each group keeps its tiles on one row from `sm`, and asks for as much
        width as that row needs — 9.5rem a tile, enough for "Overdue
        follow-ups" on one line — growing in proportion to its tile count. The
        panels then wrap by themselves: two or three abreast on a desktop, one
        a row where the screen cannot hold that, never a group split over two
        rows of its own (the client, 2026-09-29: one line per title).
      */}
      <div className="flex flex-wrap gap-3">
        {([
          ["Support", support],
          ["Sales", sales],
          ["Visits and meetings", diary],
          ["Content", content],
        ] as const).filter(([, list]) => list.length > 0).map(([title, list]) => (
          <Card
            key={title} as="section" interactive={false} padding="none" className="min-w-0 p-3"
            style={{ flex: `${list.length} 1 calc(${list.length} * 9.5rem + ${list.length - 1} * 0.5rem + 1.5rem + 2px)` }}
          >
            <h2 className="mb-2 text-12-5 font-semibold text-muted">{title}</h2>
            <ul
              className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(var(--tiles),minmax(0,1fr))]"
              style={{ "--tiles": list.length } as CSSProperties}
            >
              {list.map((t) => (
                <li key={t.label}><StatTile {...t} compact /></li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <DashboardMetricsPanel metrics={dashboard.metrics} />

      {/* Recent tickets used to sit beside this. It was the queue with a
          different heading — /admin/tickets already lists newest-first and is
          one click away — so the dashboard was spending half its width
          repeating a screen rather than telling you what needs attention. */}
      <section className="mt-9">
        <h2 className="mb-3.5 text-15 font-semibold">High priority</h2>
        {dashboard.high_priority.length === 0 ? (
          <p className="text-13-5 text-muted">Nothing critical or high priority open right now.</p>
        ) : (
          <ul className="grid gap-2 lg:grid-cols-2">
            {dashboard.high_priority.map((t) => <TicketRow key={t.id} ticket={t} />)}
          </ul>
        )}
      </section>

      <section className="mt-9">
        <h2 className="mb-3.5 text-15 font-semibold">Status breakdown</h2>
        {/* An empty ul renders as a blank card that reads as broken, and a
            division by a zero total would render NaN-width bars anyway. */}
        {breakdownTotal === 0 ? (
          <p className="rounded-lg border border-line-strong bg-card p-5 text-14 text-muted">
            No tickets yet, so there is nothing to break down.
          </p>
        ) : (
        <ul className="grid gap-2.5 rounded-lg border border-line-strong bg-card p-5">
          {breakdown.map(([label, count]) => (
            <li key={label} className="flex items-center gap-3">
              {/* The API sends the status value; the wording is this side's
                  business, and `statusLabel` is the one place it is decided. */}
              <span className="w-[132px] shrink-0 text-13 text-muted">
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
              <span className="w-6 shrink-0 text-right text-13 font-semibold">{count}</span>
            </li>
          ))}
        </ul>
        )}
      </section>
    </>
  );
}
