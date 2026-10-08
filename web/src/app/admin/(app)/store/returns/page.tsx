import Link from "next/link";

import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { SortTh } from "@/components/admin/sort-th";
import { ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { RETURN_TONE } from "@/components/store/order-returns";
import { getReturnList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { formatDate } from "@/lib/dates";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "Returns", path: "/admin/store/returns", seo: noIndex });

type Params = {
  q?: string; status?: string; reason?: string; open?: string;
  sort?: string; dir?: string; page?: string; per_page?: string;
};

/** The returns desk (docs/store.md "Returns"): what customers have asked to send back, waiting ones first. */
export default async function AdminReturnsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireScreen();
  const params = await searchParams;

  let result;
  try {
    result = await getReturnList({
      q: params.q, status: params.status, reason: params.reason, open: params.open,
      sort: params.sort, dir: params.dir,
      page: Number(params.page) || 1,
      per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return (
      <ErrorState title="We could not load the returns">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const filters = { q: params.q, status: params.status, reason: params.reason, open: params.open, per_page: params.per_page };
  const sorting = { ...filters, sort: params.sort, dir: params.dir };
  const filtered = Boolean(params.q || params.status || params.reason || params.open);
  const waiting = result.meta.waiting_count;

  return (
    <>
      <PageHeader
        title="Returns"
        lede={<>
          What customers have asked to send back. A request waits here until you approve or decline it; an
          approved one is marked received when the goods arrive, and ends with the refund you record. The
          customer is emailed at each step. The window and the switch are in Store → Settings.
        </>}
      >
        {waiting > 0 && <Badge tone="urgent">{waiting} waiting</Badge>}
      </PageHeader>

      <FilterBar action="/admin/store/returns">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Reference, order or customer…" />
        </FilterField>
        <FilterField label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">Any</option>
            {result.meta.statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Reason" htmlFor="reason">
          <Select id="reason" name="reason" defaultValue={params.reason ?? ""}>
            <option value="">Any</option>
            {result.meta.reasons.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </Select>
        </FilterField>
        <ButtonLink href="/admin/store/returns" variant="ghost" size="sm">Clear</ButtonLink>
      </FilterBar>

      {result.data.length === 0 ? (
        <EmptyState illustration="inbox" title={filtered ? "No returns match" : "No returns yet"}>
          {filtered
            ? "Try fewer filters."
            : "When a customer asks to return something from a delivered order, it appears here and you are emailed."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[880px] text-13-5">
            <thead>
              <tr className="border-b border-line-strong text-left text-11-5 uppercase tracking-[.06em] text-faint">
                <SortTh sortKey="reference" label="Return" basePath="/admin/store/returns" params={sorting} sort={params.sort} dir={params.dir} />
                <th className="py-2.5 font-semibold">Customer</th>
                <th className="py-2.5 font-semibold">Reason</th>
                <th className="py-2.5 font-semibold">Items</th>
                <SortTh sortKey="requested" label="Asked for" basePath="/admin/store/returns" params={sorting} sort={params.sort} dir={params.dir} />
                <SortTh sortKey="status" label="Status" basePath="/admin/store/returns" params={sorting} sort={params.sort} dir={params.dir} />
              </tr>
            </thead>
            <tbody>
              {result.data.map((r) => (
                <tr key={r.reference} className="border-b border-line last:border-b-0">
                  <td data-label="Return" className="py-2.5">
                    <Link href={`/admin/store/returns/${r.reference}`} className="font-mono font-semibold text-brand-ink hover:underline">
                      {r.reference}
                    </Link>
                    {r.order_number && <span className="mt-0.5 block font-mono text-12 text-muted">{r.order_number}</span>}
                  </td>
                  <td data-label="Customer" className="py-2.5">
                    {r.customer_name ?? "—"}
                    {r.customer_email && <span className="mt-0.5 block text-12 text-muted [overflow-wrap:anywhere]">{r.customer_email}</span>}
                  </td>
                  <td data-label="Reason" className="py-2.5 text-muted">{r.reason_label}</td>
                  <td data-label="Items" className="py-2.5">
                    {r.items_count}
                    {r.photos_count > 0 && <span className="ml-2 text-12 text-muted">{r.photos_count} photo{r.photos_count === 1 ? "" : "s"}</span>}
                  </td>
                  <td data-label="Asked for" className="py-2.5 text-muted">{r.requested_at ? formatDate(r.requested_at) : "—"}</td>
                  <td data-label="Status" className="py-2.5">
                    <Badge tone={RETURN_TONE[r.status]}>{r.status_label}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/store/returns" params={sorting} />
    </>
  );
}
