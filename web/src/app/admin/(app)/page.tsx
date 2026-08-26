import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge, PriorityBadge, TONE_BAR, statusTone, statusLabel } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/empty";
import { getDashboard } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { cn } from "@/lib/utils";
import { DashboardMetricsPanel } from "./metrics";
import type { AdminDashboard, Ticket, TicketStatus } from "@/types/api";

export const metadata = buildMetadata({ title: "Dashboard", path: "/admin", seo: noIndex });

/**
 * The dashboard tiles, tinted by what they mean.
 *
 * Every pairing here is a `*-soft` background with its own matching text
 * token, which is the one combination this project has already proved reads in
 * both schemes -- `Badge` and `Alert` use exactly it. Borders are the same
 * token at low alpha rather than a fixed colour: `brand-200` and `brand-300`
 * do *not* invert, so a literal border on an inverting tint is a bright sage
 * hairline on a near-black card in dark.
 *
 * `brand` twice is deliberate. Products and posts are both "published
 * content", and giving them separate hues would be colour that means nothing.
 */
type Tone = "brand" | "info" | "ok" | "warn" | "err";

const TONES: Record<Tone, { skin: string; value: string; hover: string }> = {
  brand: { skin: "border-brand-ink/25 bg-brand-50", value: "text-brand-ink", hover: "hover:border-brand-ink/50" },
  info: { skin: "border-info/25 bg-info-soft", value: "text-info", hover: "hover:border-info/50" },
  ok: { skin: "border-ok/25 bg-ok-soft", value: "text-ok", hover: "hover:border-ok/50" },
  warn: { skin: "border-warn/25 bg-warn-soft", value: "text-warn", hover: "hover:border-warn/50" },
  err: { skin: "border-err/25 bg-err-soft", value: "text-err", hover: "hover:border-err/50" },
};

function StatTile({ label, value, href, tone }: {
  label: string; value: number; href?: string; tone: Tone;
}) {
  const t = TONES[tone];

  const box = (
    <>
      <p className={cn("text-[28px] font-semibold tracking-[-.02em]", t.value)}>{value}</p>
      {/*
        The label stays `text-ink-2` rather than taking the tone. Six numbers in
        six colours is a dashboard; six numbers *and* six labels in six colours
        is a paint chart, and the label is the part you read to know what the
        number is.
      */}
      <p className="mt-1 text-[13px] text-ink-2">{label}</p>
    </>
  );

  const base = cn("rounded-lg border p-5", t.skin);

  return href ? (
    <Link href={href} className={cn(base, t.hover, "block transition-all duration-200 ease-brand hover:shadow-2 hover:-translate-y-0.5")}>
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
   * Two of these change colour with their own value, because a red panel
   * reading "0 overdue" invents an alarm that is not there -- and a dashboard
   * that cries wolf is one nobody reads. Nothing overdue is good news and gets
   * the green; nothing waiting is simply quiet.
   */
  const tiles: { label: string; value: number; href?: string; tone: Tone }[] = [
    { label: "Open tickets", value: dashboard.counts.open_tickets, tone: "info" },
    {
      label: "Overdue tickets", value: dashboard.counts.overdue_tickets,
      href: "/admin/tickets?overdue=1",
      tone: dashboard.counts.overdue_tickets > 0 ? "err" : "ok",
    },
    { label: "Active customers", value: dashboard.counts.customers, tone: "ok" },
    { label: "Published products", value: dashboard.counts.products, tone: "brand" },
    { label: "Published blog posts", value: dashboard.counts.blog_posts, tone: "brand" },
    {
      label: "New enquiries", value: dashboard.counts.new_enquiries,
      tone: dashboard.counts.new_enquiries > 0 ? "warn" : "info",
    },
  ];

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
