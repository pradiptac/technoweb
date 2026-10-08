import { formatTableDate } from "@/lib/dates";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/empty";
import { getStoreDashboard } from "@/lib/admin";
import { formatPaise } from "@/lib/money";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { cn } from "@/lib/utils";
import { orderStatusTone, TONE_BAR } from "@/components/ui/badge";
import {
  IconChart, IconBox, IconTruck, IconKey, IconTag, IconClock,
  IconWarehouse, IconGauge, IconArrowRight, IconSearchChart, IconCart, IconMail, IconHeart,
} from "@/components/icons";
import type { StoreDashboard } from "@/types/api";
import type { SVGProps } from "react";
import { requireScreen } from "@/lib/admin-screen";
import { AreaChart } from "@/components/charts/area-chart";
import { StatTile } from "@/components/admin/stat-tile";

export const metadata = buildMetadata({ title: "Store", path: "/admin/store", seo: noIndex });

const WINDOWS = [7, 30, 90] as const;

/** "28 Jul" — short enough to sit under a narrow column without wrapping. */

/**
 * A headline figure — the console's shared `StatTile` since 2026-10-05,
 * rather than a fifth hand-rolled card. A figure with no tone is neutral:
 * revenue is not good or bad news until it is compared with something.
 */
function Figure({
  label, value, footnote, icon, tone,
}: {
  label: string;
  value: string;
  footnote?: string;
  icon: (p: SVGProps<SVGSVGElement>) => React.ReactElement;
  tone?: "brand" | "ok" | "warn";
}) {
  return <StatTile label={label} value={value} note={footnote} icon={icon} tone={tone ?? "neutral"} />;
}

/**
 * Something waiting on a person, as a link to the list it is counted from.
 *
 * A figure somebody has to act on and cannot open is a figure that sends them
 * hunting through a filter — the argument `?check=` on the SEO overview already
 * makes. Every one of these is the same query that produced the number.
 */
function Waiting({
  label, count, href, icon: Icon, tone,
}: {
  label: string;
  count: number;
  href: string;
  icon: (p: SVGProps<SVGSVGElement>) => React.ReactElement;
  tone: "warn" | "err" | "info";
}) {
  return (
    <li>
      <Link
        href={href}
        className={cn(
          "flex items-center gap-3 rounded-lg border p-3.5 transition-all duration-(--duration-base) ease-brand hover:shadow-2 hover:-translate-y-0.5",
          tone === "warn" && "border-warn/25 bg-warn-soft hover:border-warn/50",
          tone === "err" && "border-err/25 bg-err-soft hover:border-err/50",
          tone === "info" && "border-info/25 bg-info-soft hover:border-info/50",
        )}
      >
        <Icon
          aria-hidden
          className={cn(
            "size-5 shrink-0",
            tone === "warn" && "text-warn",
            tone === "err" && "text-err",
            tone === "info" && "text-info",
          )}
        />
        <span className="min-w-0">
          <span
            className={cn(
              "font-display text-19 leading-none font-semibold tabular-nums",
              tone === "warn" && "text-warn",
              tone === "err" && "text-err",
              tone === "info" && "text-info",
            )}
          >
            {count}
          </span>
          <span className="mt-1 block text-12-5 text-ink-2">{label}</span>
        </span>
        <IconArrowRight aria-hidden className="ml-auto size-4 shrink-0 text-faint" />
      </Link>
    </li>
  );
}

/** A card with a heading and a link out of it. */
function Panel({
  title, href, linkLabel, id, children,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  /** For a tile above that points here rather than at a filter. */
  id?: string;
  children: React.ReactNode;
}) {
  return (
    /*
      `min-w-0` because a grid item's automatic minimum size is its min-content,
      not zero — so a panel holding a long order number sizes its own track and
      pushes the page sideways. Six pixels at 360px, from a card that looks
      perfectly contained. The same trap the campaign editor's block list hit.
    */
    <Card as="section" interactive={false} padding="sm" id={id} className="flex min-w-0 scroll-mt-24 flex-col">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-13 font-semibold">{title}</h2>
        {href && (
          <Link href={href} className="shrink-0 text-12 text-brand-ink hover:underline">
            {linkLabel ?? "See all"}
          </Link>
        )}
      </div>
      {children}
    </Card>
  );
}

/**
 * Daily revenue on the chart kit (2026-10-05): a read-out under the pointer
 * and the keyboard, the same figures as a table or a CSV. It was bars of
 * divs with a `title` per day, which said nothing until hovered and nothing
 * at all to a keyboard.
 */
function RevenueChart({ series, days }: { series: StoreDashboard["series"]; days: number }) {
  if (!series.some((d) => d.orders > 0)) {
    return (
      <p className="grid min-h-40 flex-1 place-items-center text-center text-13 text-muted">
        Nothing has sold in this window.
      </p>
    );
  }
  // Roughly five dated ticks, none within a step of the end, where "Today" is pinned.
  const step = Math.max(1, Math.round(days / 5));
  return (
    <AreaChart
      className="flex-1"
      height={180}
      format="paise"
      labels={series.map((d) => `${formatTableDate(d.day)} · ${d.orders} order${d.orders === 1 ? "" : "s"}`)}
      ticks={series.map((d, i) => (i % step === 0 && series.length - 1 - i >= step ? formatTableDate(d.day) : null))}
      lastTick="Today"
      csvName={`store-revenue-${days}-days`}
      summary={`Paid revenue per day over the last ${days} days.`}
      series={[{ key: "revenue", label: "Revenue", tone: "brand", values: series.map((d) => d.revenue_paise) }]}
    />
  );
}

export default async function StoreDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireScreen();
  const { days: rawDays } = await searchParams;
  const requested = Number(rawDays);
  const days = (WINDOWS as readonly number[]).includes(requested) ? requested : 30;

  let data: StoreDashboard;
  try {
    data = await getStoreDashboard(days);
  } catch {
    return (
      <ErrorState title="We could not load the store">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const { revenue, orders, catalogue, attention, funnel, series, recent, low_stock, codes_low } = data;
  // Absent from an API older than the reminders; null when none went out.
  const recovered = data.recovered ?? null;
  const mostWished = data.most_wished ?? [];

  /*
   * The attention band renders only what is actually waiting.
   *
   * Five zeroes in five coloured boxes is a wall somebody stops reading, and
   * the one row that matters next week is then indistinguishable from the four
   * that never do. Everything here is also reachable from the sidebar, so
   * nothing becomes unreachable by being absent — it is a band that says "these
   * need you", and on a good morning the honest version of that is empty.
   */
  const waiting = [
    { key: "codes", count: attention.awaiting_codes, label: "paid, waiting for a code", href: "/admin/store/orders?open=1", icon: IconKey, tone: "err" as const },
    /*
     * Out of stock in the way that costs money rather than the way that is a
     * shortage: a digital product with no codes left goes on selling, takes the
     * payment and lands in the queue above. It links to the panel below rather
     * than to a filter, because that panel already names the products and no
     * such filter exists on the products list — a tile pointing at a list that
     * cannot narrow to what it counted is a tile that sends somebody hunting.
     */
    { key: "exhausted", count: attention.codes_exhausted, label: "selling with no codes left", href: "#codes-low", icon: IconKey, tone: "err" as const },
    { key: "dispatch", count: attention.awaiting_dispatch, label: "to pack and dispatch", href: "/admin/store/orders?open=1", icon: IconTruck, tone: "warn" as const },
    /* The same scope the list behind this link uses, so the count and the list
       cannot disagree — see `StoreProduct::scopeOutOfStock()`. */
    { key: "stock", count: attention.out_of_stock, label: "published but out of stock", href: "/admin/store/products?out_of_stock=1", icon: IconWarehouse, tone: "warn" as const },
    /* Somebody asked to be told when it is back and nobody has: the shelf
       worth reordering first. The same `waiting` scope the list filters on. */
    { key: "waiting", count: attention.awaiting_stock, label: "out of stock with people waiting", href: "/admin/store/products?notices=1", icon: IconWarehouse, tone: "warn" as const },
    /* Reviews nobody has read: the queue opens on exactly these. */
    { key: "reviews", count: attention.reviews_pending ?? 0, label: "reviews waiting to be read", href: "/admin/store/reviews", icon: IconTag, tone: "info" as const },
    { key: "refund", count: attention.refund_requested, label: "refund requested", href: "/admin/store/orders?status=refund_requested", icon: IconTag, tone: "warn" as const },
    /* Returns nobody has answered: the desk's own `waiting` scope, the list this opens. */
    { key: "returns", count: attention.returns_requested ?? 0, label: "returns waiting for a decision", href: "/admin/store/returns?status=requested", icon: IconTag, tone: "warn" as const },
    /* Invoices Zoho Books refused: each order says why, in Zoho's words, and offers the retry. */
    { key: "zoho", count: attention.zoho_failed ?? 0, label: "Zoho invoices refused", href: "/admin/store/orders?zoho=failed", icon: IconTag, tone: "err" as const },
    { key: "unpaid", count: attention.awaiting_payment, label: "never paid for", href: "/admin/store/orders?unpaid=1", icon: IconClock, tone: "info" as const },
  ].filter((w) => w.count > 0);

  return (
    <>
      <PageHeader
        title="Store"
        lede="Revenue counts orders that were paid for — a basket abandoned at the payment screen is not a sale, and is counted separately below."
      >
        {/*
          Links, not a client-side control. The window belongs in the URL so a
          90-day view can be sent to somebody, and a set of three links needs no
          JavaScript at all — the same reasoning the knowledge-base search is a
          plain GET.
        */}
        <nav aria-label="Window" className="ml-auto flex shrink-0 items-center gap-1 rounded-lg border border-line-strong bg-surface-2 p-1">
          {WINDOWS.map((w) => (
            <Link
              key={w}
              href={w === 30 ? "/admin/store" : `/admin/store?days=${w}`}
              aria-current={w === days ? "page" : undefined}
              className={cn(
                "rounded-md px-2.5 py-1 text-12-5 transition-colors",
                w === days ? "bg-card font-semibold text-ink shadow-1" : "text-muted hover:text-ink",
              )}
            >
              {w} days
            </Link>
          ))}
        </nav>
      </PageHeader>

      {waiting.length > 0 && (
        <section className="mb-6">
          <h2 className="sr-only">Waiting on somebody</h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {waiting.map((w) => (
              <Waiting key={w.key} label={w.label} count={w.count} href={w.href} icon={w.icon} tone={w.tone} />
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Figure
          label={`Revenue, last ${days} days`}
          icon={IconChart}
          tone="brand"
          value={formatPaise(revenue.period_paise)}
          footnote={`${orders.period} order${orders.period === 1 ? "" : "s"} placed in the window`}
        />
        <Figure
          label="Average order"
          icon={IconGauge}
          /* Null, never ₹0: an average of nothing is not a measurement. */
          value={revenue.average_paise === null ? "—" : formatPaise(revenue.average_paise)}
          footnote={
            revenue.sample === 0
              ? "Nothing has sold yet"
              : `Across ${revenue.sample} paid order${revenue.sample === 1 ? "" : "s"}`
          }
        />
        <Figure
          label="Revenue, all time"
          icon={IconChart}
          value={formatPaise(revenue.total_paise)}
          footnote={
            /* Reported beside revenue rather than netted off it — the gateway
               reports gross and refunds separately, and a figure matching
               neither is one somebody has to reverse engineer. */
            revenue.refunded_paise > 0
              ? `${formatPaise(revenue.refunded_paise)} refunded`
              : `${formatPaise(revenue.gst_paise)} of it GST`
          }
        />
        <Figure
          label="Products on sale"
          icon={IconBox}
          tone={catalogue.out_of_stock > 0 ? "warn" : undefined}
          value={String(catalogue.published)}
          footnote={
            catalogue.out_of_stock > 0
              ? `${catalogue.out_of_stock} out of stock`
              : `${catalogue.products} in the catalogue`
          }
        />
      </section>

      {/*
        How many looked against how many bought. The views come from Google
        Analytics, read only, and a dash is "not measured" rather than nought:
        a shop that has not connected analytics has not had zero visitors, and
        the rate is a rate only with something under the line.
      */}
      <section className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Figure
          label={`Product views, last ${days} days`}
          icon={IconSearchChart}
          value={funnel.product_views === null ? "—" : funnel.product_views.toLocaleString("en-IN")}
          footnote={
            funnel.product_views === null
              ? "Connect Google Analytics in Settings → API keys"
              : `${funnel.paid_orders} paid order${funnel.paid_orders === 1 ? "" : "s"} in the window`
          }
        />
        <Figure
          label="Views → orders"
          icon={IconGauge}
          value={funnel.views_to_orders === null ? "—" : `${(funnel.views_to_orders * 100).toFixed(2)}%`}
          footnote={
            funnel.product_views === null
              ? "Connect Google Analytics in Settings → API keys"
              : funnel.product_views === 0
                ? "No product page was opened in the window"
                : "Paid orders over product views"
          }
        />
        {/*
          What the basket reminders brought back. A dash while nothing was
          reminded — switched off, or nobody left a basket with an address —
          because "0 of 0" reads as a feature that failed rather than one
          that has not run.
        */}
        <Figure
          label="Baskets recovered"
          icon={IconCart}
          value={recovered === null ? "—" : `${recovered.recovered} of ${recovered.reminded}`}
          footnote={
            recovered === null
              ? "No basket reminder went out in the window"
              : `${(recovered.rate * 100).toFixed(1)}% of reminded baskets became an order`
          }
        />
        <Figure
          label="Recovered revenue"
          icon={IconMail}
          value={recovered === null ? "—" : formatPaise(recovered.revenue_paise)}
          footnote={
            recovered === null
              ? "Switch reminders on in Store → Settings"
              : "Paid orders placed from a reminded basket"
          }
        />
      </section>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_340px]">
        <Panel title="Daily revenue">
          <RevenueChart series={series} days={days} />
        </Panel>

        <Panel title="Recent orders" href="/admin/store/orders" linkLabel="The queue">
          {recent.length === 0 ? (
            <p className="grid flex-1 place-items-center py-6 text-center text-13 text-muted">
              No orders yet.
            </p>
          ) : (
            <ul className="-mx-1 flex flex-col">
              {recent.map((o) => (
                <li key={o.order_number}>
                  <Link
                    href={`/admin/store/orders/${o.order_number}`}
                    className="flex items-center gap-3 rounded-md px-1 py-2 transition-colors hover:bg-surface-2"
                  >
                    {/* A dot rather than a badge: six badges down a narrow
                        column is a stack of coloured pills where the customer's
                        name should be. The label is on the tooltip and in the
                        text below it. */}
                    <span
                      aria-hidden
                      title={o.status_label}
                      className={cn("size-2 shrink-0 rounded-full", TONE_BAR[orderStatusTone[o.status]])}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-13">{o.customer_name}</span>
                      <span className="block truncate font-mono text-11 text-faint">
                        {o.order_number} · {o.status_label}
                      </span>
                    </span>
                    <span className="shrink-0 text-13 tabular-nums">{formatPaise(o.total_paise)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        <Panel title="Running out of stock" href="/admin/store/products" linkLabel="All products">
          {low_stock.length === 0 ? (
            <p className="py-4 text-13 text-muted">Everything tracked is above {data.low_stock_threshold} in stock.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {low_stock.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/admin/store/products/${p.id}`}
                    className="flex items-center gap-3 rounded-md px-1 py-1.5 transition-colors hover:bg-surface-2"
                  >
                    <IconWarehouse aria-hidden className="size-4 shrink-0 text-faint" />
                    <span className="min-w-0 flex-1 truncate text-13">{p.name}</span>
                    <span
                      className={cn(
                        "shrink-0 text-13 font-semibold tabular-nums",
                        p.stock <= 0 ? "text-err" : "text-warn",
                      )}
                    >
                      {p.stock <= 0 ? "None left" : `${p.stock} left`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Running out of activation codes" id="codes-low">
          {codes_low.length === 0 ? (
            <p className="py-4 text-13 text-muted">
              Every digital product has codes in hand.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {codes_low.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/admin/store/products/${p.id}/codes`}
                    className="flex items-center gap-3 rounded-md px-1 py-1.5 transition-colors hover:bg-surface-2"
                  >
                    <IconKey aria-hidden className="size-4 shrink-0 text-faint" />
                    <span className="min-w-0 flex-1 truncate text-13">{p.name}</span>
                    <span
                      className={cn(
                        "shrink-0 text-13 font-semibold tabular-nums",
                        p.available === 0 ? "text-err" : "text-warn",
                      )}
                    >
                      {p.available === 0 ? "None left" : `${p.available} left`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/*
          What people would like to buy (2026-09-25): the five products on the
          most wishlists, counted by list rather than by line. Standing demand
          rather than an event in the window, so it ignores the period picker —
          and it is the audience a broadcast to "everybody who saved this"
          would reach.
        */}
        <Panel title="Most wished for">
          {mostWished.length === 0 ? (
            <p className="py-4 text-13 text-muted">Nobody has saved anything to a wishlist yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {mostWished.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/admin/store/products/${p.id}`}
                    className="flex items-center gap-3 rounded-md px-1 py-1.5 transition-colors hover:bg-surface-2"
                  >
                    <IconHeart aria-hidden className="size-4 shrink-0 text-faint" />
                    <span className="min-w-0 flex-1 truncate text-13">{p.name}</span>
                    <span className="shrink-0 text-13 font-semibold tabular-nums">
                      {p.wishes} {p.wishes === 1 ? "list" : "lists"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/*
        The footnote, not a tile row. These are counts of everything ever, which
        is context rather than news — putting them in the same coloured boxes as
        the revenue would give them the same weight as the figure somebody
        opened the screen for.
      */}
      <p className="mt-4 text-12 text-muted">
        {orders.total} order{orders.total === 1 ? "" : "s"} all told — {orders.paid} paid,{" "}
        {orders.pending_payment} never paid for, {orders.cancelled} cancelled.{" "}
        {orders.with_physical} involved something to ship and {orders.with_digital} something to
        issue; an order can be both.
        {attention.failed_payments > 0 &&
          ` ${attention.failed_payments} payment${attention.failed_payments === 1 ? "" : "s"} failed at the gateway in the last ${days} days.`}
      </p>
    </>
  );
}
