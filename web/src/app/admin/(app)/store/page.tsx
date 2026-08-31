import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getStoreDashboard } from "@/lib/admin";
import { formatPaise } from "@/lib/money";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { cn } from "@/lib/utils";
import { orderStatusTone, TONE_BAR } from "@/components/ui/badge";
import {
  IconChart, IconBox, IconTruck, IconKey, IconTag, IconClock,
  IconWarehouse, IconGauge, IconArrowRight,
} from "@/components/icons";
import type { StoreDashboard } from "@/types/api";
import type { SVGProps } from "react";

export const metadata = buildMetadata({ title: "Store", path: "/admin/store", seo: noIndex });

const WINDOWS = [7, 30, 90] as const;

/** "28 Jul" — short enough to sit under a narrow column without wrapping. */
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * A round number at or above the peak, in paise.
 *
 * A bar sized against the peak is a shape rather than a quantity — the lesson
 * the ticket chart had to be taught, where the tallest bar was full height
 * whether it stood for two tickets or two hundred. Money makes it worse than
 * tickets did: an axis reading "₹47,318" is a number nobody can use as a ruler,
 * so the top is snapped to 1, 2 or 5 × a power of ten and the midpoint is then
 * always a round figure too.
 */
function niceCeiling(peak: number): number {
  if (peak <= 0) return 100_000; // ₹1,000, so an empty chart still has a scale.

  const magnitude = 10 ** Math.floor(Math.log10(peak));
  const steps = [1, 2, 5, 10];

  return magnitude * (steps.find((s) => peak <= magnitude * s) ?? 10);
}

/** ₹1.2L / ₹47.3k / ₹800 — an axis label has no room for digit grouping. */
function compactPaise(paise: number): string {
  const rupees = paise / 100;

  if (rupees === 0) return "0";
  if (rupees >= 10_000_000) return `₹${(rupees / 10_000_000).toFixed(1).replace(/\.0$/, "")}Cr`;
  if (rupees >= 100_000) return `₹${(rupees / 100_000).toFixed(1).replace(/\.0$/, "")}L`;
  if (rupees >= 1_000) return `₹${(rupees / 1_000).toFixed(1).replace(/\.0$/, "")}k`;

  return `₹${Math.round(rupees)}`;
}

/**
 * A headline figure.
 *
 * `font-display` and a tabular figure set, because these sit in a row and a
 * proportional "1" makes four numbers of the same length look like four
 * different lengths.
 */
function Figure({
  label, value, footnote, icon: Icon, tone,
}: {
  label: string;
  value: string;
  footnote?: string;
  icon: (p: SVGProps<SVGSVGElement>) => React.ReactElement;
  tone?: "brand" | "ok" | "warn";
}) {
  return (
    <div className="relative rounded-lg border border-line-strong bg-card p-4">
      {/*
        Pinned to the corner rather than sitting as a flex sibling: the
        footnotes here run from "Median" to "Across 2 paid orders", and in a row
        the mark would sit at a different height in every tile. `text-faint`
        rather than the figure's own tone — the number is the thing being read.
      */}
      <Icon aria-hidden className="absolute top-4 right-4 size-8 text-faint opacity-40" />
      <p className="pr-10 text-[12px] text-muted">{label}</p>
      <p
        className={cn(
          "mt-1 font-display text-[24px] leading-none font-semibold tracking-[-.02em] tabular-nums",
          tone === "brand" && "text-brand-ink",
          tone === "ok" && "text-ok",
          tone === "warn" && "text-warn",
        )}
      >
        {value}
      </p>
      {footnote && <p className="mt-1.5 text-[11.5px] text-faint">{footnote}</p>}
    </div>
  );
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
          "flex items-center gap-3 rounded-lg border p-3.5 transition-all duration-200 ease-brand hover:shadow-2 hover:-translate-y-0.5",
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
              "font-display text-[19px] leading-none font-semibold tabular-nums",
              tone === "warn" && "text-warn",
              tone === "err" && "text-err",
              tone === "info" && "text-info",
            )}
          >
            {count}
          </span>
          <span className="mt-1 block text-[12.5px] text-ink-2">{label}</span>
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
    <section id={id} className="flex min-w-0 scroll-mt-24 flex-col rounded-lg border border-line-strong bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {href && (
          <Link href={href} className="shrink-0 text-[12px] text-brand-ink hover:underline">
            {linkLabel ?? "See all"}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function RevenueChart({ series, days }: { series: StoreDashboard["series"]; days: number }) {
  const peak = Math.max(...series.map((d) => d.revenue_paise), 0);
  const axisTop = niceCeiling(peak);
  const sold = series.some((d) => d.orders > 0);

  /*
   * Roughly five dated columns, and the last one always. Labelling all thirty
   * is unreadable at any width the console has; labelling only the two ends is
   * what the ticket chart did before it was fixed, and it leaves the bars
   * floating over a range nobody can locate a Tuesday in.
   */
  const step = Math.max(1, Math.round(days / 5));

  /*
   * The last column is always dated, so a regular step can land a label right
   * beside it — "26 Aug" and "31 Aug" overlapped at 360px, where the plot is
   * about 250px wide and a date is 40 of them. Anything inside one step of the
   * end is dropped in favour of the end, which is the label that anchors the
   * whole axis.
   */
  const labelled = (i: number) =>
    i === series.length - 1 || (i % step === 0 && series.length - 1 - i >= step);

  if (!sold) {
    return (
      <p className="grid min-h-40 flex-1 place-items-center text-center text-[13px] text-muted">
        Nothing has sold in this window.
      </p>
    );
  }

  return (
    <div className="flex min-h-48 flex-1 flex-col">
      <div className="flex flex-1 gap-2">
        <ul className="flex w-9 shrink-0 flex-col justify-between text-right text-[11px] tabular-nums text-faint">
          {[axisTop, axisTop / 2, 0].map((tick) => (
            <li key={tick} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
              {compactPaise(tick)}
            </li>
          ))}
        </ul>

        <div className="relative flex-1">
          {/* The line at zero is the baseline every bar is measured from, so it
              is solid where the two guesses above it are faint. */}
          <div aria-hidden className="absolute inset-0 flex flex-col justify-between">
            <span className="block border-t border-line" />
            <span className="block border-t border-line" />
            <span className="block border-t border-line-strong" />
          </div>

          {/*
            `absolute inset-0` and `h-full` on every row, which is the only
            arrangement in which the bars' percentage heights resolve against
            anything. In flow the list has an automatic height, a percentage
            against an auto height is not a length, and every bar collapses to
            nothing — a chart with a correct axis, correct gridlines, correct
            dates and no bars at all, which is exactly how this rendered first.
          */}
          <ol className="absolute inset-0 flex items-end gap-px">
            {series.map((d) => (
              <li key={d.day} className="flex h-full flex-1 items-end">
                <span className="sr-only">
                  {dayLabel(d.day)}: {formatPaise(d.revenue_paise)} from {d.orders} order
                  {d.orders === 1 ? "" : "s"}
                </span>
                <span
                  aria-hidden
                  title={`${dayLabel(d.day)} — ${formatPaise(d.revenue_paise)}`}
                  className="block w-full rounded-t-[2px] bg-brand-500 transition-colors hover:bg-brand-600"
                  /* A day with revenue too small to see still gets a pixel and a
                     half: a bar of zero height and a day that sold nothing must
                     not look the same. */
                  style={{ height: d.revenue_paise > 0 ? `max(2px, ${(d.revenue_paise / axisTop) * 100}%)` : "0" }}
                />
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/*
        Anchored to the row, not laid out as flex columns.

        Thirty `flex-1` cells each holding a `whitespace-nowrap` date have a
        min-content width of the whole date, so the row could not be narrower
        than about 30 × 40px and pushed the page 65px sideways at 360 — a page
        that scrolls with no element visibly over the edge, which is the exact
        signature the "Today" label on the ticket dashboard produced. Positioned
        against the plot instead, a label costs the layout nothing; the two ends
        are anchored to the edges rather than centred so neither hangs off.
      */}
      <div aria-hidden className="relative mt-2 ml-11 h-4 text-[11px] text-faint">
        {series.map((d, i) =>
          labelled(i) ? (
            <span
              key={d.day}
              className={cn(
                "absolute top-0 whitespace-nowrap",
                i === 0 && "left-0",
                i === series.length - 1 && "right-0",
                i !== 0 && i !== series.length - 1 && "-translate-x-1/2",
              )}
              style={
                i === 0 || i === series.length - 1
                  ? undefined
                  : { left: `${((i + 0.5) / series.length) * 100}%` }
              }
            >
              {dayLabel(d.day)}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

export default async function StoreDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
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

  const { revenue, orders, catalogue, attention, series, recent, low_stock, codes_low } = data;

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
    { key: "refund", count: attention.refund_requested, label: "refund requested", href: "/admin/store/orders?status=refund_requested", icon: IconTag, tone: "warn" as const },
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
                "rounded-md px-2.5 py-1 text-[12.5px] transition-colors",
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

      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_340px]">
        <Panel title="Daily revenue">
          <RevenueChart series={series} days={days} />
        </Panel>

        <Panel title="Recent orders" href="/admin/store/orders" linkLabel="The queue">
          {recent.length === 0 ? (
            <p className="grid flex-1 place-items-center py-6 text-center text-[13px] text-muted">
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
                      <span className="block truncate text-[13px]">{o.customer_name}</span>
                      <span className="block truncate font-mono text-[11px] text-faint">
                        {o.order_number} · {o.status_label}
                      </span>
                    </span>
                    <span className="shrink-0 text-[13px] tabular-nums">{formatPaise(o.total_paise)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Panel title="Running out of stock" href="/admin/store/products" linkLabel="All products">
          {low_stock.length === 0 ? (
            <p className="py-4 text-[13px] text-muted">Everything tracked is above {data.low_stock_threshold} in stock.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {low_stock.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/admin/store/products/${p.id}`}
                    className="flex items-center gap-3 rounded-md px-1 py-1.5 transition-colors hover:bg-surface-2"
                  >
                    <IconWarehouse aria-hidden className="size-4 shrink-0 text-faint" />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{p.name}</span>
                    <span
                      className={cn(
                        "shrink-0 text-[13px] font-semibold tabular-nums",
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
            <p className="py-4 text-[13px] text-muted">
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
                    <span className="min-w-0 flex-1 truncate text-[13px]">{p.name}</span>
                    <span
                      className={cn(
                        "shrink-0 text-[13px] font-semibold tabular-nums",
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
      </div>

      {/*
        The footnote, not a tile row. These are counts of everything ever, which
        is context rather than news — putting them in the same coloured boxes as
        the revenue would give them the same weight as the figure somebody
        opened the screen for.
      */}
      <p className="mt-4 text-[12px] text-muted">
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
