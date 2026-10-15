import Link from "next/link";
import type { CSSProperties } from "react";
import { EmptyState } from "@/components/ui/empty";
import { Card } from "@/components/ui/card";
import { HERO_ACTION, HERO_ACTION_PRIMARY, HERO_ACTION_SECONDARY, HeroBand } from "@/components/app-shell/hero-band";
import { Entrance } from "@/components/app-shell/entrance";
import { ActivityFeed, type ActivityItem } from "@/components/app-shell/activity-feed";
import { IconBox, IconHeart, IconMeeting, IconTicket } from "@/components/icons";
import { getMyOrders, getMyVisits, getTicketSummary, getTickets } from "@/lib/portal";
import { getMyMeetings } from "@/lib/meetings";
import { getWishlist } from "@/lib/wishlist";
import { getCurrentCustomer } from "@/lib/auth";
import { getSiteSettings } from "@/lib/settings";
import { settingEnabled } from "@/lib/site-settings";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { cn } from "@/lib/utils";

export const metadata = buildMetadata({ title: "Dashboard", path: "/portal", seo: noIndex });

/** The soonest of `items` still ahead of now, by the instant `at` gives — the server's clock, at render. */
function soonest<T>(items: T[], at: (item: T) => string | null): T | undefined {
  const now = Date.now();
  return items
    .filter((i) => { const t = at(i); return t !== null && Date.parse(t) > now; })
    .sort((a, b) => Date.parse(at(a)!) - Date.parse(at(b)!))[0];
}

type Tile = { key: string; value: string; label: string; href: string; icon: typeof IconTicket; tone: string };

/**
 * The portal's home (Portal 2.0, 0.167.0): a brand-lit hello with what to do
 * next, a tile for each thing that is actually happening, one timeline of
 * what changed, and a way into the knowledge base.
 *
 * Every read fails on its own — a `.catch()` inside the `Promise.all`, not
 * after it — so a figure that cannot be fetched drops one tile and never the
 * page; somebody in trouble came here for the support half. A tile with
 * nothing to show is left out rather than drawn as a zero, and a customer
 * with nothing at all gets one composed "here's what you can do" instead.
 */
export default async function PortalHome() {
  const [customer, settings, summary, tickets, orders, visits, meetings, wishlist] = await Promise.all([
    getCurrentCustomer().catch(() => null),
    getSiteSettings(),
    getTicketSummary().catch(() => null),
    getTickets().then((r) => r.data).catch(() => []),
    getMyOrders().then((r) => r.data).catch(() => []),
    getMyVisits().then((r) => r.data).catch(() => []),
    getMyMeetings().then((r) => r.data).catch(() => []),
    getWishlist().catch(() => null),
  ]);

  const visitsOn = settingEnabled(settings, "visits_enabled", false);
  const meetingsOn = settingEnabled(settings, "meetings_enabled", false);

  const open = summary ? summary.open + summary.in_progress + summary.pending : 0;
  const onTheWay = orders.filter((o) => o.status === "dispatched");
  const nextVisit = soonest(visits.filter((v) => v.status === "confirmed"), (v) => v.scheduled_start_at);
  const nextMeeting = soonest(meetings.filter((m) => m.status === "scheduled"), (m) => m.starts_at);
  const drops = wishlist?.items.filter((i) => (i.saving_paise ?? 0) > 0) ?? [];

  const meetingFirst = nextMeeting && (!nextVisit || Date.parse(nextMeeting.starts_at) < Date.parse(nextVisit.scheduled_start_at!));
  const next = meetingFirst
    ? { value: nextMeeting.date_label, label: nextMeeting.time_label, href: `/portal/meetings/${nextMeeting.reference}`, line: `Your next meeting is ${nextMeeting.date_label}, ${nextMeeting.time_label}.` }
    : nextVisit
      ? { value: nextVisit.visit_date, label: nextVisit.visit_time, href: `/portal/visits/${nextVisit.reference}`, line: `Your engineer visit is ${nextVisit.visit_date}, ${nextVisit.visit_time}.` }
      : null;

  const line = next?.line
    ?? (orders[0] ? `Order ${orders[0].order_number} is ${orders[0].status_label.toLowerCase()}.` : "How can we help today?");

  const tiles = ([
    open > 0 && {
      key: "tickets", value: String(open), href: "/portal/tickets", icon: IconTicket, tone: "text-info",
      label: summary && summary.pending > 0 ? `open · ${summary.pending} awaiting you` : open === 1 ? "open ticket" : "open tickets",
    },
    onTheWay.length > 0 && {
      key: "orders", value: String(onTheWay.length), href: "/portal/orders", icon: IconBox, tone: "text-brand-ink",
      label: onTheWay.length === 1 ? `on the way · ${onTheWay[0].order_number}` : "orders on the way",
    },
    next && { key: "next", value: next.value, label: next.label, href: next.href, icon: IconMeeting, tone: "text-ok" },
    drops.length > 0 && {
      key: "drops", value: String(drops.length), href: "/portal/wishlist", icon: IconHeart, tone: "text-err",
      label: drops.length === 1 ? "saved item is cheaper now" : "saved items are cheaper now",
    },
  ] as (Tile | false | null)[]).filter((t): t is Tile => Boolean(t));

  const activity: ActivityItem[] = [
    ...tickets.map((t): ActivityItem => ({ id: `t${t.id}`, at: t.updated_at, tone: "info", href: `/portal/tickets/${t.reference}`, text: <>{t.reference} · {t.status_label}</> })),
    ...orders.map((o): ActivityItem => ({ id: `o${o.order_number}`, at: o.dispatched_at ?? o.placed_at ?? "", tone: "brand", href: `/portal/orders/${o.order_number}`, text: <>{o.order_number} · {o.status_label}</> })),
    ...visits.map((v): ActivityItem => ({ id: `v${v.reference}`, at: v.created_at ?? "", tone: "ok", href: `/portal/visits/${v.reference}`, text: <>Visit {v.reference} · {v.status_label}</> })),
    ...meetings.map((m): ActivityItem => ({ id: `m${m.reference}`, at: m.created_at ?? m.starts_at, tone: "warn", href: `/portal/meetings/${m.reference}`, text: <>Meeting {m.reference} · {m.status_label}</> })),
  ].filter((a) => a.at).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 10);

  const actions = [
    <Link key="ticket" href="/portal/tickets/new" data-press className={cn(HERO_ACTION, HERO_ACTION_PRIMARY)}>Raise a ticket</Link>,
    visitsOn && <Link key="visit" href="/book-a-visit" data-press className={cn(HERO_ACTION, HERO_ACTION_SECONDARY)}>Book a visit</Link>,
    meetingsOn && <Link key="meeting" href="/book-a-meeting" data-press className={cn(HERO_ACTION, HERO_ACTION_SECONDARY)}>Book a meeting</Link>,
  ];

  const first = customer?.name.trim().split(/\s+/)[0];
  const hello = `Hello${first ? ` ${first}` : ""}${customer?.company ? ` · ${customer.company}` : ""}`;

  return (
    <>
      {/* The page's one h1; the visible greeting is the band's. */}
      <h1 className="sr-only">Dashboard</h1>
      <HeroBand className="mb-6" title={hello} summary={line} actions={actions} />
      <Entrance scope="portal" />

      {tiles.length === 0 && activity.length === 0 ? (
        <EmptyState
          illustration="inbox"
          title="Here's what you can do"
          action={<Link href="/portal/tickets/new" className="inline-flex min-h-10 items-center rounded-full bg-brand-600 px-5 text-13-5 font-semibold text-brand-on">Raise a ticket</Link>}
        >
          Raise a ticket when something needs fixing, follow every order you place
          here, and book an engineer when you need one on site.
        </EmptyState>
      ) : (
        <>
          {tiles.length > 0 && (
            /* As many columns as there are tiles, never a half-empty row (the
               proportion rule); one or two tiles lie on their side, the icon
               beside the figure, rather than stretching a tall card wide. */
            <ul
              data-tour="portal-tiles"
              className="mb-7 grid grid-cols-2 gap-3 max-lg:[&>li:last-child:nth-child(odd)]:col-span-2 lg:grid-cols-[repeat(var(--tiles),minmax(0,1fr))]"
              style={{ "--tiles": tiles.length } as CSSProperties}
            >
              {tiles.map((t, i) => (
                <li key={t.key} data-entrance-item style={{ "--i": i } as CSSProperties} className="min-w-0">
                  <Link
                    href={t.href}
                    data-portal-tile
                    className={cn(
                      "flex h-full flex-col rounded-xl border border-line-strong bg-card p-4 shadow-2 transition-[translate,box-shadow] duration-(--duration-base) hover:shadow-3 motion-safe:hover:-translate-y-px",
                      tiles.length <= 2 && "lg:flex-row lg:items-center lg:gap-4",
                    )}
                  >
                    <span aria-hidden className={cn("mb-3 grid size-10 shrink-0 place-items-center rounded-lg bg-surface-2 [&_svg]:size-5", tiles.length <= 2 && "lg:mb-0", t.tone)}>
                      <t.icon />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-display text-[26px] leading-none font-bold tracking-[-.03em]">{t.value}</span>
                      <span className="mt-1.5 block text-13 text-muted">{t.label}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Card as="section" interactive={false} padding="sm" className="rounded-xl shadow-2">
              <h2 className="mb-3 text-15 font-semibold">Recent activity</h2>
              <div data-activity>
                <ActivityFeed items={activity} empty="Nothing yet. Updates on your tickets, orders and bookings appear here." />
              </div>
            </Card>
            <Card as="section" id="portal-help" interactive={false} padding="sm" className="rounded-xl shadow-2">
              <h2 className="text-15 font-semibold">Need help?</h2>
              <form action="/knowledge-base" method="get" className="mt-3">
                <label htmlFor="kb-q" className="sr-only">Search the knowledge base</label>
                <input
                  id="kb-q" name="q" type="search" placeholder="Search the knowledge base"
                  className="w-full rounded-lg border border-line-strong bg-card px-3 py-2.5 text-14 focus:border-brand-400 focus:ring-3 focus:ring-brand-100 focus:outline-none"
                />
              </form>
              <Link href="/knowledge-base" className="mt-3 inline-block py-1 text-13 font-semibold text-brand-ink hover:underline">
                Browse all articles
              </Link>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
