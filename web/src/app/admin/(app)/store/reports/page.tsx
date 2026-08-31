import Link from "next/link";
import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/empty";
import { getStoreReport } from "@/lib/admin";
import { formatPaise } from "@/lib/money";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { cn } from "@/lib/utils";
import { Badge, orderStatusTone } from "@/components/ui/badge";
import type { OrderStatus, StoreReport } from "@/types/api";

export const metadata = buildMetadata({ title: "Sales reports", path: "/admin/store/reports", seo: noIndex });

type SearchParams = { from?: string; to?: string; group?: string };

/** A figure and what it is, in a row that reads across. */
function Total({ label, value, note, strong }: {
  label: string; value: string; note?: string; strong?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line-strong bg-card p-4">
      <p className="text-[12px] text-muted">{label}</p>
      <p className={cn(
        "mt-1 font-display leading-none font-semibold tracking-[-.02em] tabular-nums",
        strong ? "text-[24px] text-brand-ink" : "text-[20px]",
      )}>
        {value}
      </p>
      {note && <p className="mt-1.5 text-[11.5px] text-faint">{note}</p>}
    </div>
  );
}

export default async function StoreReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  let report: StoreReport;
  let refusal: string | null = null;

  try {
    report = await getStoreReport(params);
  } catch (error) {
    /*
     * A range too wide is a 422 naming the limit, and it is the one failure
     * here somebody can act on — so it is rendered as an answer rather than as
     * "we could not load the reports", which would send them to look for a
     * broken server.
     */
    const message = error instanceof Error ? error.message : "";

    if (!message) {
      return (
        <ErrorState title="We could not load the reports">
          The admin API is not responding. Try again shortly.
        </ErrorState>
      );
    }

    refusal = message;
    report = null as unknown as StoreReport;
  }

  if (refusal) {
    return (
      <>
        <PageHeader title="Sales reports" />
        <ErrorState title="That range is too wide">{refusal}</ErrorState>
      </>
    );
  }

  const { totals, series, products, statuses } = report;
  const query = `from=${report.from}&to=${report.to}`;

  /* The busiest period, so the table's bars have a ruler. Same rule as the
     dashboard's chart: a bar sized against the peak is a shape, not a
     quantity — here the peak is stated in the column heading instead. */
  const peak = Math.max(...series.map((s) => s.revenue_paise), 1);

  return (
    <>
      <PageHeader
        title="Sales reports"
        lede="Everything here counts orders that were paid for, over the range you choose. GST is read from each order rather than worked out again, so the figures reconcile against what was actually charged."
      />

      <FilterBar action="/admin/store/reports">
        <FilterField label="From" htmlFor="from">
          <Input id="from" name="from" type="date" defaultValue={report.from} className="w-[150px]" />
        </FilterField>
        <FilterField label="To" htmlFor="to">
          <Input id="to" name="to" type="date" defaultValue={report.to} className="w-[150px]" />
        </FilterField>
        <FilterField label="Group by" htmlFor="group">
          <Select id="group" name="group" defaultValue={report.group} className="w-[120px]">
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </Select>
        </FilterField>

        <Button type="submit" className="mb-[1px]">Show</Button>

        {/*
          Plain anchors, never `next/link`.

          A `next/link` pointing at a route handler *prefetches* it, so merely
          loading this screen would build the whole CSV on the server, fetch it
          and throw it away — measured on the newsletter's subscriber export,
          which shipped exactly that.
        */}
        <span className="mb-[1px] ml-auto flex flex-wrap items-center gap-2">
          <a
            href={`/api/admin/store/reports/export?${query}&type=orders`}
            download
            className="rounded-md border border-line-strong px-3 py-1.5 text-[12.5px] transition-colors hover:border-brand-300 hover:bg-brand-50"
          >
            Orders CSV
          </a>
          <a
            href={`/api/admin/store/reports/export?${query}&type=products`}
            download
            className="rounded-md border border-line-strong px-3 py-1.5 text-[12.5px] transition-colors hover:border-brand-300 hover:bg-brand-50"
          >
            Products CSV
          </a>
        </span>
      </FilterBar>

      <p className="mb-4 text-[12.5px] text-muted">
        {report.days} day{report.days === 1 ? "" : "s"}, {report.from} to {report.to}.
      </p>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Total
          label="Revenue"
          strong
          value={formatPaise(totals.total_paise)}
          note={`${totals.orders} paid order${totals.orders === 1 ? "" : "s"}, ${totals.units} item${totals.units === 1 ? "" : "s"}`}
        />
        <Total
          label="Of which GST"
          value={formatPaise(totals.gst_paise)}
          note={`${formatPaise(totals.taxable_paise)} taxable`}
        />
        <Total
          label="Average order"
          /* Null, never ₹0 — an average of nothing is not a measurement. */
          value={totals.average_paise === null ? "—" : formatPaise(totals.average_paise)}
          note={totals.orders === 0 ? "Nothing sold in this range" : `Across ${totals.orders} order${totals.orders === 1 ? "" : "s"}`}
        />
        <Total
          label="Discounts given"
          value={formatPaise(totals.discount_paise)}
          /* Refunds are reported here rather than subtracted from revenue: the
             gateway reports gross and refunds separately, and a figure matching
             neither is one somebody has to reverse engineer. */
          note={totals.refunded_paise > 0 ? `${formatPaise(totals.refunded_paise)} refunded separately` : "No refunds in this range"}
        />
      </section>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_360px]">
        <section className="min-w-0 rounded-lg border border-line-strong bg-card p-4">
          <h2 className="mb-3 text-[13px] font-semibold">
            By {report.group === "day" ? "day" : report.group === "week" ? "week" : "month"}
          </h2>

          {totals.orders === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted">Nothing sold in this range.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="admin-table w-full min-w-[520px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line text-[11.5px] text-faint">
                    <th className="py-2 pr-3 font-semibold">Period</th>
                    <th className="py-2 pr-3 text-right font-semibold">Orders</th>
                    <th className="py-2 pr-3 text-right font-semibold">GST</th>
                    <th className="py-2 text-right font-semibold">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((row) => (
                    <tr key={row.period} className="border-b border-line last:border-0">
                      <td data-label="Period" className="py-1.5 pr-3 whitespace-nowrap">{row.label}</td>
                      <td data-label="Orders" className="py-1.5 pr-3 text-right tabular-nums">{row.orders}</td>
                      <td data-label="GST" className="py-1.5 pr-3 text-right tabular-nums text-muted">
                        {row.gst_paise > 0 ? formatPaise(row.gst_paise) : "—"}
                      </td>
                      <td data-label="Revenue" className="py-1.5 text-right tabular-nums">
                        <span className="inline-flex items-center justify-end gap-2">
                          {/* The bar is a reading aid beside the figure, not the
                              figure itself — a table already gives the exact
                              number, which is what a chart cannot do. */}
                          <span aria-hidden className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted/25 sm:block">
                            <span
                              className="block h-full rounded-full bg-brand-500"
                              style={{ width: `${(row.revenue_paise / peak) * 100}%` }}
                            />
                          </span>
                          {row.revenue_paise > 0 ? formatPaise(row.revenue_paise) : "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="min-w-0 rounded-lg border border-line-strong bg-card p-4">
          <h2 className="mb-3 text-[13px] font-semibold">Every order in the range</h2>

          {statuses.length === 0 ? (
            <p className="py-4 text-[13px] text-muted">No orders were placed in this range.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {statuses.map((s) => (
                  <li key={s.status} className="flex items-center gap-3">
                    <Badge tone={orderStatusTone[s.status as OrderStatus]}>{s.label}</Badge>
                    <span className="ml-auto shrink-0 text-[13px] tabular-nums">{s.orders}</span>
                    <span className="w-24 shrink-0 text-right text-[12.5px] tabular-nums text-muted">
                      {formatPaise(s.total_paise)}
                    </span>
                  </li>
                ))}
              </ul>
              {/* Said out loud, because this is the one panel on the screen that
                  is not revenue — an abandoned basket belongs in "what happened
                  to the orders" and not in a figure anybody banks. */}
              <p className="mt-3 text-[11.5px] text-faint">
                Counts every order placed, paid or not, so it does not add up to the revenue above.
              </p>
            </>
          )}
        </section>
      </div>

      <section className="mt-3 min-w-0 rounded-lg border border-line-strong bg-card p-4">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-[13px] font-semibold">What sold</h2>
          <Link href="/admin/store/products" className="shrink-0 text-[12px] text-brand-ink hover:underline">
            All products
          </Link>
        </div>

        {products.length === 0 ? (
          <p className="py-4 text-[13px] text-muted">Nothing sold in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table w-full min-w-[560px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-[11.5px] text-faint">
                  <th className="py-2 pr-3 font-semibold">Product</th>
                  <th className="py-2 pr-3 font-semibold">SKU</th>
                  <th className="py-2 pr-3 text-right font-semibold">Units</th>
                  <th className="py-2 pr-3 text-right font-semibold">Orders</th>
                  <th className="py-2 text-right font-semibold">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p, i) => (
                  <tr key={`${p.id ?? "gone"}-${i}`} className="border-b border-line last:border-0">
                    <td data-label="Product" className="max-w-[38ch] py-1.5 pr-3">
                      {/* A product deleted since still sold what it sold — the
                          name is the order item's own snapshot, so the table
                          adds up to the revenue above it. */}
                      {p.id ? (
                        <Link href={`/admin/store/products/${p.id}`} className="hover:underline">{p.name}</Link>
                      ) : (
                        <span>{p.name}</span>
                      )}
                    </td>
                    <td data-label="SKU" className="py-1.5 pr-3 font-mono text-[11.5px] text-faint">{p.sku ?? "—"}</td>
                    <td data-label="Units" className="py-1.5 pr-3 text-right tabular-nums">{p.units}</td>
                    <td data-label="Orders" className="py-1.5 pr-3 text-right tabular-nums text-muted">{p.orders}</td>
                    <td data-label="Revenue" className="py-1.5 text-right tabular-nums">{formatPaise(p.revenue_paise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
