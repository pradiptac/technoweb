import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge, PriorityBadge, statusTone, statusLabel } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { getActivity, getAnalyticsSummary, getDashboard, getHealthList, getOnboarding, getTickets } from "@/lib/admin";
import { OnboardingCard } from "@/components/admin/onboarding-card";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { IconEye, IconHeart } from "@/components/icons-ui";
import { IconTicket, IconClock, IconUsers, IconBox, IconPen, IconMail, IconTools, IconMeeting } from "@/components/icons";
import { istDate } from "@/lib/visit-dates";
import { resolveRange } from "@/lib/analytics-range";
import { StatTile, type Tone } from "@/components/admin/stat-tile";
import { Card } from "@/components/ui/card";
import { Panel } from "@/components/app-shell/panel";
import { HERO_ACTION, HERO_ACTION_PRIMARY, HERO_ACTION_SECONDARY, HeroBand } from "@/components/app-shell/hero-band";
import { Entrance } from "@/components/app-shell/entrance";
import { ActivityFeed, type ActivityItem } from "@/components/app-shell/activity-feed";
import { greeting } from "@/lib/greeting";
import { TicketArrivals, TicketFigures, TicketVolume } from "./metrics";
import { DashboardCustomise } from "./dashboard-customise";
import { arrange, dashboardCookie, parseView, type DashboardView, type GroupKey, type WidgetKey } from "@/lib/dashboard-view";
import { getCurrentStaff } from "@/lib/admin-auth";
import { cookies } from "next/headers";
import { cn } from "@/lib/utils";
import { Donut } from "@/components/charts/donut";
import { Funnel } from "@/components/charts/funnel";
import type { ChartTone } from "@/components/charts/tones";
import type { AdminDashboard, Ticket, TicketStatus } from "@/types/api";
import type { CSSProperties, ReactNode, SVGProps } from "react";
import { requireScreen } from "@/lib/admin-screen";
import { Fragment, Suspense, cache } from "react";
import { DashboardSkeleton } from "@/components/admin/skeletons";

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

/**
 * One API call, asked for twice: the body draws it and the header's
 * "Customise" button needs to know which panels this role's answer holds.
 * `cache()` makes that one request per render, and a failure is `null` to
 * both — the body says so, the button is simply not drawn.
 */
const loadDashboard = cache(async (volume?: string): Promise<AdminDashboard | null> => {
  try {
    return await getDashboard(volume);
  } catch {
    return null;
  }
});

/** The roles that open Site → Analytics (`nav-items.tsx`), and so the Traffic panel. */
const TRAFFIC_ROLES = ["admin", "seo_manager", "content_manager"];

/** This account's arrangement, from its cookie (`lib/dashboard-view.ts`). */
const readView = cache(async (): Promise<DashboardView> => {
  const staff = await getCurrentStaff();
  if (!staff) return parseView(undefined);
  return parseView((await cookies()).get(dashboardCookie(staff.id))?.value);
});

/**
 * What this role's dashboard can draw at all. The dialog lists exactly this,
 * and `arrange()` ignores a stored key that is not in it.
 */
function availableFor(dashboard: AdminDashboard, isAdmin: boolean, canTraffic: boolean): { widgets: WidgetKey[]; groups: GroupKey[] } {
  const widgets: WidgetKey[] = ["glance", "kpis", "volume"];
  if (dashboard.metrics.arrivals) widgets.push("arrivals");
  widgets.push("status");
  if (dashboard.leads?.funnel) widgets.push("pipeline");
  widgets.push("urgent", "activity");
  if (isAdmin) widgets.push("health");
  if (canTraffic) widgets.push("traffic");

  const groups: GroupKey[] = ["support", "sales"];
  if (dashboard.visits || dashboard.meetings) groups.push("diary");
  groups.push("content");

  return { widgets, groups };
}

async function CustomiseButton({ volume }: { volume?: string }) {
  const dashboard = await loadDashboard(volume);
  if (!dashboard) return null;
  const isAdmin = await getCurrentStaff().then((me) => Boolean(me?.roles.some((r) => r.slug === "admin"))).catch(() => false);
  const canTraffic = await getCurrentStaff().then((me) => Boolean(me?.roles.some((r) => TRAFFIC_ROLES.includes(r.slug)))).catch(() => false);
  const { widgets, groups } = availableFor(dashboard, isAdmin, canTraffic);

  return <DashboardCustomise view={await readView()} available={widgets} groups={groups} />;
}

export default async function AdminDashboardPage({ searchParams }: {
  searchParams: Promise<{ volume?: string }>;
}) {
  await requireScreen();
  // The volume chart's period. The API allowlists it and falls back to a month.
  const { volume } = await searchParams;

  /*
   * The heading at once and the figures as they arrive (2026-10-05). The
   * dashboard is one API call that aggregates thirty days of tickets, and the
   * generic table skeleton `loading.tsx` draws is the wrong shape for tiles
   * and charts, so the page streams its own: tile groups, the chart, the
   * bars. Not keyed on the period, so switching 1M to 3M keeps the chart on
   * screen while the next one loads rather than flashing the skeleton.
   */
  const period = typeof volume === "string" ? volume : undefined;

  return (
    <>
      <PageHeader title="Dashboard">
        {/* The button needs the dashboard's answer, so it streams in beside
            the title; the placeholder is its height, so the row does not grow
            when it arrives. */}
        <Suspense fallback={<span aria-hidden className="ml-auto h-8" />}>
          <CustomiseButton volume={period} />
        </Suspense>
      </PageHeader>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardBody volume={period} />
      </Suspense>
    </>
  );
}

async function DashboardBody({ volume }: { volume?: string }) {
  // The checklist alongside, never in the way: null for a non-administrator
  // or an unreachable API, and the dashboard is drawn either way.
  const onboarding = getOnboarding();
  /*
   * The Activity panel's rows (Console 2.0), started beside the dashboard
   * call. An administrator reads the activity log; the desk, which may not,
   * reads the newest tickets. Either failing is null and the panel is simply
   * not drawn.
   */
  const activity: Promise<ActivityItem[] | null> = getCurrentStaff().then((me) =>
    me?.roles.some((r) => r.slug === "admin")
      ? getActivity({ per_page: 8 }).then((r) => r.data.map((e): ActivityItem => ({
          id: `a${e.id}`, at: e.created_at, tone: "brand",
          text: <>{e.actor.name} · {e.action.replaceAll("_", " ")}{e.subject?.label ? <> · {e.subject.label}</> : null}</>,
        })))
      : getTickets({ sort: "created", dir: "desc", per_page: 8 }).then((r) => r.data.map((t): ActivityItem => ({
          id: `t${t.id}`, at: t.created_at, tone: "info", href: `/admin/tickets/${t.reference}`,
          text: <>{t.reference} · {t.subject}</>,
        }))),
  ).catch(() => null);
  // Site health panel: administrators only, and not asked for while it is put away. Its own catch, so a failure blanks only this panel.
  const healthList = Promise.all([getCurrentStaff(), readView()])
    .then(([me, v]) => (me?.roles.some((r) => r.slug === "admin") && !v.hidden.includes("health") ? getHealthList({ per_page: 3 }) : null))
    .catch(() => null);
  // Traffic panel: the roles that open Analytics, and not asked for while it is put away. Its own catch.
  const traffic = Promise.all([getCurrentStaff(), readView()])
    .then(([me, v]) => (me?.roles.some((r) => TRAFFIC_ROLES.includes(r.slug)) && !v.hidden.includes("traffic")
      ? getAnalyticsSummary({ ...resolveRange({ period: "7" }).range, compare: "previous" })
      : null))
    .catch(() => null);
  const dashboard = await loadDashboard(volume);
  if (!dashboard) {
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
    spark?: number[];
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
        // New leads a day over thirty days: is the pipeline filling or drying up.
        spark: dashboard.leads.series,
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
  const breakdownTotal = breakdown.reduce((sum, [, n]) => sum + n, 0);
  /* A badge tone as a chart tone: the ring and the queue's badges agree about
     what "In progress" looks like, by construction. */
  const statusChart: Record<string, ChartTone> = {
    open: "info", progress: "warn", resolved: "ok", closed: "muted", urgent: "err", brand: "brand", accent: "accent",
  };
  const funnel = dashboard.leads?.funnel;

  const checklist = await onboarding;
  const view = await readView();
  const recent = await activity;
  const health = await healthList;
  const trafficSummary = await traffic;

  /*
   * The hero's one line and its buttons (Console 2.0), from figures this
   * role's answer already holds — a section the API left null is never
   * mentioned, the rule every tile here follows.
   */
  const staff = await getCurrentStaff();
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const due = dashboard.counts.overdue_tickets;
  const summary = [
    due > 0 ? plural(due, "overdue ticket", "overdue tickets") : null,
    dashboard.counts.open_tickets > 0 ? `${dashboard.counts.open_tickets} open` : null,
    dashboard.leads && dashboard.leads.new > 0 ? plural(dashboard.leads.new, "new lead", "new leads") : null,
    dashboard.visits && dashboard.visits.awaiting > 0 ? plural(dashboard.visits.awaiting, "visit to confirm", "visits to confirm") : null,
    dashboard.meetings && dashboard.meetings.today > 0 ? plural(dashboard.meetings.today, "meeting today", "meetings today") : null,
  ].filter(Boolean);
  const heroActions = [
    { label: "Open the queue", href: "/admin/tickets?open=1" },
    due > 0 ? { label: "Overdue tickets", href: "/admin/tickets?overdue=1" } : null,
    dashboard.leads ? { label: "New leads", href: "/admin/leads?status=new" } : null,
  ].filter((a): a is { label: string; href: string } => a !== null).slice(0, 3);
  const shown = (key: string) => !view.hidden.includes(key);

  /*
   * Every panel this dashboard can draw, by key (0.120.0). The order they are
   * written in is the default; `arrange()` puts them in the order this
   * account chose and leaves out what it put away. A panel with nothing to
   * draw for this role is simply absent from the map.
   */
  const tileGroups = ([
    ["support", "Support", support],
    ["sales", "Sales", sales],
    ["diary", "Visits and meetings", diary],
    ["content", "Content", content],
  ] as const).filter(([key, , list]) => list.length > 0 && shown(`glance.${key}`));

  const panels: Partial<Record<WidgetKey, ReactNode>> = {
    /*
      Each group keeps its tiles on one row from `sm`, and asks for as much
      width as that row needs — 9.5rem a tile, enough for "Overdue
      follow-ups" on one line — growing in proportion to its tile count. The
      panels then wrap by themselves: two or three abreast on a desktop, one
      a row where the screen cannot hold that, never a group split over two
      rows of its own (the client, 2026-09-29: one line per title).
    */
    glance: tileGroups.length > 0 && (() => { let idx = 0; return (
      <div className="flex flex-wrap gap-3">
        {tileGroups.map(([key, title, list]) => (
          <Card
            key={key} as="section" interactive={false} padding="none" className="flex min-w-0 flex-col rounded-xl p-3 shadow-1"
            style={{ flex: `${list.length} 1 calc(${list.length} * 9.5rem + ${list.length - 1} * 0.5rem + 1.5rem + 2px)` }}
          >
            <h2 className="mb-2 text-12-5 font-semibold text-muted">{title}</h2>
            <ul
              // `flex-1`: the panels in a row are one height, and only one
              // tile on the dashboard carries a trend line. Without it that
              // group's tiles were 150px and its neighbour's 96px, with the
              // difference left as a blank strip under them (the client,
              // 2026-10-07). The row stretches, and every tile is `h-full`.
              className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-[repeat(var(--tiles),minmax(0,1fr))]"
              style={{ "--tiles": list.length } as CSSProperties}
            >
              {list.map((t) => (
                <li key={t.label} data-entrance-item style={{ "--i": idx++ } as CSSProperties}><StatTile {...t} compact /></li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    ); })(),

    kpis: <TicketFigures metrics={dashboard.metrics} />,
    volume: <TicketVolume metrics={dashboard.metrics} />,
    arrivals: dashboard.metrics.arrivals && <TicketArrivals metrics={dashboard.metrics} />,

    status: (
      <Panel title="Every ticket, by status" icon={<IconTicket />}>
        {breakdownTotal === 0 ? (
          <p className="text-13 text-muted">No tickets yet, so there is nothing to break down.</p>
        ) : (
          /* The API sends the status value; the wording is this side's
             business, and `statusLabel` is the one place it is decided. */
          <Donut
            caption="tickets"
            segments={breakdown.map(([status, total]) => ({
              key: status,
              label: statusLabel[status as TicketStatus] ?? status,
              value: total,
              tone: statusChart[statusTone[status as TicketStatus] ?? "closed"],
              href: `/admin/tickets?status=${encodeURIComponent(status)}`,
            }))}
          />
        )}
      </Panel>
    ),

    pipeline: funnel && (
      <Panel title="Sales pipeline" icon={<IconMail />}>
        <p className="-mt-1 mb-3 text-12 text-muted">
          What happened to the leads that arrived in the last {funnel.days} days. Spam is left out.
        </p>
        <Funnel
          stages={[
            { label: "Received", value: funnel.received, href: "/admin/leads" },
            { label: "Replied to", value: funnel.contacted, href: "/admin/leads?status=contacted" },
            { label: "Won", value: funnel.won, href: "/admin/leads?status=won" },
          ]}
        />
      </Panel>
    ),

    /* Recent tickets used to sit beside this. It was the queue with a
       different heading — /admin/tickets already lists newest-first and is
       one click away — so the dashboard was spending half its width
       repeating a screen rather than telling you what needs attention. */
    urgent: (
      <section>
        <h2 className="mb-3.5 text-15 font-semibold">High priority</h2>
        {dashboard.high_priority.length === 0 ? (
          <EmptyState illustration="done" title="Nothing urgent">Nothing critical or high priority is open right now.</EmptyState>
        ) : (
          <ul className="grid gap-2 lg:grid-cols-2">
            {dashboard.high_priority.map((t) => <TicketRow key={t.id} ticket={t} />)}
          </ul>
        )}
      </section>
    ),
  };

  panels.activity = recent && (
    <Panel title="Activity" icon={<IconClock />}>
      <ActivityFeed items={recent} />
    </Panel>
  );

  panels.health = health && (
    <Panel title="Site health" icon={<IconHeart />} actions={<Link href="/admin/health" className="text-13 text-brand-ink underline">See all</Link>}>
      <StatTile
        label="Site health"
        value={health.meta.score?.value == null ? "—" : `${health.meta.score.value}%`}
        note={health.meta.score?.change == null ? "Published records with nothing to fix" : `${health.meta.score.change > 0 ? "+" : ""}${health.meta.score.change} points in 30 days`}
        tone={health.meta.score?.value == null ? "neutral" : "ok"}
        icon={IconHeart}
      />
      {health.data.length === 0 ? (
        <p className="mt-3 text-13 text-muted">Nothing to fix.</p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {health.data.map((row) => (
            <li key={row.id} className="min-w-0 text-13">
              {row.admin_path
                ? <Link href={row.admin_path} className="font-semibold text-brand-ink hover:underline [overflow-wrap:anywhere]">{row.subject.title ?? "A record that has gone"}</Link>
                : <span className="font-semibold [overflow-wrap:anywhere]">{row.subject.title ?? "A record that has gone"}</span>}
              <span className="block text-muted [overflow-wrap:anywhere]">{row.sentence}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );

  panels.traffic = trafficSummary && trafficSummary.meta.enabled && (
    <Panel title="Traffic" icon={<IconEye />} actions={<Link href="/admin/analytics" className="text-13 text-brand-ink underline">See all</Link>}>
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Visits"
          value={trafficSummary.data.visits.value === null ? "—" : trafficSummary.data.visits.value.toLocaleString("en-IN")}
          icon={IconUsers}
          tone="brand"
          spark={trafficSummary.data.series.map((p) => p.visitors)}
          delta={{ change: trafficSummary.data.visits.change, caption: "vs the 7 days before" }}
        />
        <StatTile
          label="Page views"
          value={trafficSummary.data.views.value === null ? "—" : trafficSummary.data.views.value.toLocaleString("en-IN")}
          icon={IconEye}
          tone="info"
          spark={trafficSummary.data.series.map((p) => p.views)}
          delta={{ change: trafficSummary.data.views.change, caption: "vs the 7 days before" }}
        />
      </div>
    </Panel>
  );

  const drawable = (Object.keys(panels) as WidgetKey[]).filter((key) => Boolean(panels[key]));
  const rows = arrange(view, drawable);

  /*
   * The space above a row belongs to the pair of rows, not to either panel:
   * a panel that opens on a bare heading ("Last 30 days", "High priority")
   * wants air above it, and so does whatever follows the unboxed ticket
   * list; two cards sit a card-gap apart. In the default order this is the
   * dashboard's old spacing exactly — 8, 3, 3, 3, 9.
   */
  const gapAbove = (row: WidgetKey[], previous: WidgetKey[] | undefined) => {
    if (!previous) return "";
    if (row[0] === "kpis" || previous[previous.length - 1] === "urgent") return "mt-8";
    if (row[0] === "urgent") return "mt-9";
    return "mt-3";
  };

  return (
    <>
      <HeroBand
        className="mb-5"
        title={greeting(staff?.name ?? "")}
        summary={summary.length ? `${summary.join(" · ")}.` : "All quiet. Nothing is waiting on you."}
        actions={heroActions.map((a, i) => (
          <Link key={a.href} href={a.href} data-press className={cn(HERO_ACTION, i === 0 ? HERO_ACTION_PRIMARY : HERO_ACTION_SECONDARY)}>
            {a.label}
          </Link>
        ))}
      />
      <Entrance scope="console" />

      {checklist && checklist.done < checklist.total && <OnboardingCard data={checklist} />}

      {rows.length === 0 && (
        <EmptyState title="Every panel is put away">
          Press Customise, at the top of this screen, to bring one back.
        </EmptyState>
      )}

      {rows.map((row, i) => {
        const half = row.some((key) => key === "status" || key === "pipeline");

        return (
          <div
            key={row.join("+")}
            data-dashboard-row={row.join(" ")}
            // Half-width panels keep their half even alone: a ring and its
            // legend stretched across the whole screen is a wide empty card.
            className={cn(gapAbove(row, rows[i - 1]), half && "grid gap-3 lg:grid-cols-2")}
          >
            {row.map((key) => <Fragment key={key}>{panels[key]}</Fragment>)}
          </div>
        );
      })}
    </>
  );
}
