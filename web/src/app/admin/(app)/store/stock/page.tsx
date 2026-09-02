import Link from "next/link";
import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { getStockReport, getStockMovements } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { cn } from "@/lib/utils";
import type { StockReport } from "@/types/api";

export const metadata = buildMetadata({ title: "Stock in and out", path: "/admin/store/stock", seo: noIndex });

type SearchParams = {
  from?: string; to?: string; product?: string;
  reason?: string; direction?: string; page?: string; per_page?: string;
};

/**
 * The URL's own strings, as the getters want them.
 *
 * Everything in a query string is a string; `page` and `per_page` are numbers
 * on the wire. Converted once here rather than at both call sites, so the
 * report and the ledger below it cannot end up on different pages.
 */
function toQuery(params: SearchParams) {
  return {
    ...params,
    page: params.page ? Number(params.page) : undefined,
    per_page: params.per_page ? Number(params.per_page) : undefined,
  };
}

/** A figure and what it is. Shared shape with the sales report, deliberately. */
function Total({ label, value, note, tone }: {
  label: string; value: string; note?: string; tone?: "in" | "out" | "net";
}) {
  return (
    <div className="rounded-lg border border-line-strong bg-card p-4">
      <p className="text-[12px] text-muted">{label}</p>
      <p className={cn(
        "mt-1 font-display text-[24px] leading-none font-semibold tracking-[-.02em] tabular-nums",
        tone === "in" && "text-ok",
        tone === "out" && "text-err",
        tone === "net" && "text-brand-ink",
      )}>
        {value}
      </p>
      {note && <p className="mt-1.5 text-[11.5px] text-faint">{note}</p>}
    </div>
  );
}

/** Units, with the sign said rather than left to a character the eye skips. */
function units(n: number): string {
  return `${n} unit${n === 1 ? "" : "s"}`;
}

export default async function StockPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  let report: StockReport;
  let meta: { reasons: { value: string; label: string }[]; max_days: number };

  try {
    const response = await getStockReport(toQuery(params));
    report = response.data;
    meta = response.meta;
  } catch (error) {
    /*
     * A range too wide is a 422 naming the limit, and it is the one failure
     * here somebody can act on — so it is rendered as an answer rather than as
     * "we could not load", which would send them looking for a broken server.
     * Same handling as the sales report, because it is the same refusal.
     */
    const message = error instanceof Error ? error.message : "";

    if (!message) {
      return (
        <ErrorState title="We could not load the stock report">
          The admin API is not responding. Try again shortly.
        </ErrorState>
      );
    }

    return (
      <>
        <PageHeader title="Stock in and out" />
        <ErrorState title="That range is too wide">{message}</ErrorState>
      </>
    );
  }

  const movements = await getStockMovements(toQuery(params)).catch(() => null);
  const { totals, products, by_reason: byReason } = report;

  const query = new URLSearchParams();
  query.set("from", report.from);
  query.set("to", report.to);
  for (const key of ["product", "reason", "direction"] as const) {
    if (params[key]) query.set(key, params[key]!);
  }

  return (
    <>
      <PageHeader
        title="Stock in and out"
        lede="Every change to a stock level, and why. Sales are recorded when an order is paid for; everything else is somebody editing a product. Levels changed before this ledger existed are not here, and the sales among them were recovered from the orders."
      />

      <FilterBar action="/admin/store/stock">
        <FilterField label="From" htmlFor="from">
          <Input id="from" name="from" type="date" defaultValue={report.from} className="w-[150px]" />
        </FilterField>
        <FilterField label="To" htmlFor="to">
          <Input id="to" name="to" type="date" defaultValue={report.to} className="w-[150px]" />
        </FilterField>
        <FilterField label="Direction" htmlFor="direction">
          <Select id="direction" name="direction" defaultValue={params.direction ?? ""} className="w-[120px]">
            <option value="">In and out</option>
            <option value="in">In only</option>
            <option value="out">Out only</option>
          </Select>
        </FilterField>
        <FilterField label="Reason" htmlFor="reason">
          {/* Built from `meta.reasons`, never listed here: one list of strings
              with nothing type-checking a second copy across the wire. */}
          <Select id="reason" name="reason" defaultValue={params.reason ?? ""} className="w-[150px]">
            <option value="">Any reason</option>
            {meta.reasons.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </Select>
        </FilterField>

        <Button type="submit" className="mb-[1px]">Show</Button>

        {/*
          A plain anchor, never `next/link`. A link pointing at a route handler
          *prefetches* it, so merely loading this screen would build the whole
          CSV on the server, fetch it and throw it away — measured on the
          newsletter's subscriber export, which shipped exactly that.
        */}
        <span className="mb-[1px] ml-auto">
          <a
            href={`/api/admin/store/stock/export?${query.toString()}`}
            download
            className="rounded-md border border-line-strong px-3 py-1.5 text-[12.5px] transition-colors hover:border-brand-300 hover:bg-brand-50"
          >
            Download CSV
          </a>
        </span>
      </FilterBar>

      <p className="mb-4 text-[12.5px] text-muted">
        {report.days} day{report.days === 1 ? "" : "s"}, {report.from} to {report.to}.
      </p>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Total label="Stock in" tone="in" value={units(totals.stock_in)}
          note="Arrivals and upward corrections" />
        <Total label="Stock out" tone="out" value={units(totals.stock_out)}
          note="Sales and downward corrections" />
        <Total label="Net" tone="net"
          value={`${totals.net > 0 ? "+" : ""}${units(totals.net)}`}
          note={totals.net === 0 ? "In and out balanced" : totals.net > 0 ? "More arrived than left" : "More left than arrived"} />
        <Total label="Movements" value={String(totals.movements)}
          note={`Across ${totals.products} product${totals.products === 1 ? "" : "s"}`} />
      </section>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_320px]">
        <section className="min-w-0 rounded-lg border border-line-strong bg-card p-4">
          <h2 className="mb-3 text-[13px] font-semibold">By product</h2>

          {products.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted">Nothing moved in this range.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="admin-table w-full min-w-[560px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line text-[11.5px] text-faint">
                    <th className="py-2 pr-3 font-semibold">Product</th>
                    <th className="py-2 pr-3 text-right font-semibold">In</th>
                    <th className="py-2 pr-3 text-right font-semibold">Out</th>
                    <th className="py-2 pr-3 text-right font-semibold">Net</th>
                    <th className="py-2 text-right font-semibold">In stock now</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((row) => (
                    <tr key={`${row.id ?? "gone"}-${row.name}`} className="border-b border-line last:border-0">
                      <td data-label="Product" className="max-w-[38ch] truncate py-1.5 pr-3">
                        {/* Linked only when the product still exists — the name
                            is the ledger's own snapshot, so a deleted one still
                            appears as itself rather than vanishing from a total
                            somebody has already read. */}
                        {row.id === null ? (
                          <span className="text-muted">{row.name} <span className="text-faint">(deleted)</span></span>
                        ) : (
                          <Link href={`/admin/store/products/${row.id}`} className="hover:text-brand-ink">{row.name}</Link>
                        )}
                        {row.sku && <span className="ml-2 font-mono text-[11.5px] text-faint">{row.sku}</span>}
                      </td>
                      <td data-label="In" className="py-1.5 pr-3 text-right tabular-nums">
                        {row.stock_in > 0 ? <span className="text-ok">+{row.stock_in}</span> : "—"}
                      </td>
                      <td data-label="Out" className="py-1.5 pr-3 text-right tabular-nums">
                        {row.stock_out > 0 ? <span className="text-err">−{row.stock_out}</span> : "—"}
                      </td>
                      <td data-label="Net" className="py-1.5 pr-3 text-right font-medium tabular-nums">
                        {row.net > 0 ? `+${row.net}` : row.net}
                      </td>
                      <td data-label="In stock now" className="py-1.5 text-right tabular-nums">
                        {/* Null, never 0, for a product that has gone: zero is
                            a claim about a shelf, and there is no shelf. */}
                        {row.stock_now === null ? "—" : row.stock_now}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="min-w-0 rounded-lg border border-line-strong bg-card p-4">
          <h2 className="mb-1 text-[13px] font-semibold">Why it moved</h2>
          <p className="mb-3 text-[11.5px] text-faint">
            &ldquo;40 down&rdquo; means one thing if it is all sales and another if half of it is a
            miscount being corrected.
          </p>

          <ul className="grid gap-2">
            {byReason.map((row) => (
              <li key={row.reason} className="flex items-baseline justify-between gap-3 border-b border-line pb-2 text-[13px] last:border-0 last:pb-0">
                <span>{row.label}</span>
                <span className="tabular-nums">
                  {row.stock_in > 0 && <span className="text-ok">+{row.stock_in}</span>}
                  {row.stock_in > 0 && row.stock_out > 0 && <span className="text-faint"> / </span>}
                  {row.stock_out > 0 && <span className="text-err">−{row.stock_out}</span>}
                  {row.stock_in === 0 && row.stock_out === 0 && <span className="text-faint">—</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-3 rounded-lg border border-line-strong bg-card p-4">
        <h2 className="mb-3 text-[13px] font-semibold">Every movement</h2>

        {!movements || movements.data.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted">Nothing moved in this range.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="admin-table w-full min-w-[720px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line text-[11.5px] text-faint">
                    <th className="py-2 pr-3 font-semibold">When</th>
                    <th className="py-2 pr-3 font-semibold">Product</th>
                    <th className="py-2 pr-3 text-right font-semibold">Change</th>
                    <th className="py-2 pr-3 text-right font-semibold">Left</th>
                    <th className="py-2 pr-3 font-semibold">Reason</th>
                    <th className="py-2 font-semibold">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.data.map((row) => (
                    <tr key={row.id} className="border-b border-line last:border-0">
                      <td data-label="When" className="py-1.5 pr-3 whitespace-nowrap">
                        {row.at ? new Date(row.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—"}
                      </td>
                      <td data-label="Product" className="max-w-[32ch] truncate py-1.5 pr-3">
                        {row.product_name}
                        {row.variation_name && <span className="ml-1.5 text-[11.5px] text-muted">{row.variation_name}</span>}
                      </td>
                      <td data-label="Change" className={cn(
                        "py-1.5 pr-3 text-right font-medium tabular-nums",
                        row.direction === "in" ? "text-ok" : "text-err",
                      )}>
                        {row.direction === "in" ? `+${row.quantity}` : `−${row.quantity}`}
                      </td>
                      <td data-label="Left" className="py-1.5 pr-3 text-right tabular-nums text-muted">
                        {/* Blank, never zero, where it was never known. */}
                        {row.balance_after === null ? "—" : row.balance_after}
                      </td>
                      <td data-label="Reason" className="py-1.5 pr-3 whitespace-nowrap">{row.reason_label}</td>
                      <td data-label="Source" className="py-1.5 text-[12.5px] text-muted">
                        {row.order_number ? (
                          <Link href={`/admin/store/orders/${row.order_number}`} className="font-mono hover:text-brand-ink">
                            {row.order_number}
                          </Link>
                        ) : (
                          row.actor_name ?? "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination meta={movements.meta} basePath="/admin/store/stock" params={{ ...params }} />
          </>
        )}
      </section>
    </>
  );
}
