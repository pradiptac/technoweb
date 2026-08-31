import Link from "next/link";
import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge, orderStatusTone } from "@/components/ui/badge";
import { IconBox } from "@/components/icons";
import { getStoreOrders } from "@/lib/admin";
import { formatPaise } from "@/lib/money";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { OrderIndex } from "@/lib/admin";

export const metadata = buildMetadata({ title: "Orders", path: "/admin/store/orders", seo: noIndex });

/*
  One map from status to colour, so a badge here and a badge on the detail
  screen cannot drift — the argument `TONE_BAR` makes for the ticket charts.
*/

type SearchParams = {
  q?: string; status?: string; open?: string; unpaid?: string; page?: string; per_page?: string;
};

export default async function StoreOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  let result: OrderIndex;

  try {
    result = await getStoreOrders({
      q: params.q,
      status: params.status,
      open: params.open === "1",
      unpaid: params.unpaid === "1",
      page: Number(params.page) || 1,
      per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return (
      <ErrorState title="We could not load the orders">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const orders = result.data;
  const filtered = Boolean(params.q || params.status || params.open || params.unpaid);

  return (
    <>
      <PageHeader
        title="Orders"
        lede={<>
          Everything sold through the shop. An order becomes paid because a payment was verified,
          never because somebody chose it here — the statuses you can set are the ones that follow.
        </>}
      >
        <div className="ml-auto flex gap-2">
          <ButtonLink href="/admin/store/products" variant="secondary" size="sm">Products</ButtonLink>
        </div>
      </PageHeader>

      <FilterBar action="/admin/store/orders">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Order, name, email or tracking…" />
        </FilterField>

        <FilterField label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">Any status</option>
            {result.meta.statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </FilterField>

        {/*
          "What needs doing" is not a status: a paid order waiting on a licence
          key and one waiting to be boxed are different jobs in the same state.
        */}
        <FilterField label="Show" htmlFor="open">
          <Select id="open" name="open" defaultValue={params.open ?? ""}>
            <option value="">Everything</option>
            <option value="1">Still open</option>
          </Select>
        </FilterField>

        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {filtered && <ButtonLink href="/admin/store/orders" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </FilterBar>

      {result.meta.pending_payment > 0 && !params.unpaid && (
        <p className="mb-3 text-[13px] text-muted">
          <Link href="/admin/store/orders?unpaid=1" className="font-semibold text-brand-ink underline">
            {result.meta.pending_payment} awaiting payment
          </Link>{" "}
          — nothing has been charged for those.
        </p>
      )}

      {orders.length === 0 ? (
        <EmptyState icon={<IconBox />} title={filtered ? "Nothing matches those filters" : "No orders yet"}>
          {filtered ? "Try a different term, or clear the filters." : "Orders placed in the shop appear here."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[820px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line-strong text-[10.5px] font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Order</th>
                <th scope="col" className="px-3 py-1.5">Customer</th>
                <th scope="col" className="px-3 py-1.5">Total</th>
                <th scope="col" className="px-3 py-1.5">Placed</th>
                <th scope="col" className="px-3 py-1.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-line last:border-b-0 align-top">
                  <td data-label="Order" className="px-3 py-2">
                    <Link href={`/admin/store/orders/${o.order_number}`} className="font-mono text-[12.5px] font-medium hover:underline">
                      {o.order_number}
                    </Link>
                    {o.tracking_number && (
                      <p className="mt-0.5 font-mono text-[12px] text-faint">{o.tracking_number}</p>
                    )}
                  </td>

                  <td data-label="Customer" className="max-w-[28ch] truncate px-3 py-2">
                    {o.customer_name}
                    <span className="block truncate text-[12px] text-faint">{o.customer_email}</span>
                  </td>

                  <td data-label="Total" className="px-3 py-2 tabular-nums">{formatPaise(o.total_paise)}</td>

                  <td data-label="Placed" className="px-3 py-2 text-muted">
                    {o.placed_at ? new Date(o.placed_at).toLocaleDateString() : "—"}
                  </td>

                  <td data-label="Status" className="px-3 py-2">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={orderStatusTone[o.status]}>{o.status_label}</Badge>
                      {/*
                        The one thing on this screen a customer is actively
                        waiting for, and it is invisible from the status column.
                      */}
                      {o.awaiting_codes && <Badge tone="urgent">Code needed</Badge>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        meta={result.meta}
        basePath="/admin/store/orders"
        params={{ q: params.q, status: params.status, open: params.open, per_page: params.per_page }}
      />
    </>
  );
}
