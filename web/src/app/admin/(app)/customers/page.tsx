import Link from "next/link";
import { PageHeader, FilterBar } from "@/components/admin/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { IconUsers } from "@/components/icons";
import { getCustomers } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminCustomer, Paginated } from "@/types/api";
import { CustomerStatusBadge, VerifiedBadge } from "./status-badge";

export const metadata = buildMetadata({ title: "Customers", path: "/admin/customers", seo: noIndex });

type SearchParams = {
  status?: string; q?: string; verified?: string; page?: string; per_page?: string;
};

const STATUSES = [
  { value: "pending", label: "Pending approval" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "rejected", label: "Rejected" },
];

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  let result: Paginated<AdminCustomer> & { meta: { pending_count?: number } };
  try {
    result = await getCustomers({
      status: params.status,
      q: params.q,
      verified: params.verified,
      page: Number(params.page) || 1,
      per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return (
      <ErrorState title="We could not load the customer list">
        This screen needs a support engineer role or better. If that is your
        account, the admin API is not responding — try again shortly.
      </ErrorState>
    );
  }

  const customers = result.data;
  const filtered = Boolean(params.q || params.status || params.verified);
  const pending = result.meta.pending_count ?? 0;

  return (
    <>
      <PageHeader
        title="Customers"
        lede={<>
          Every portal account, and the queue of people waiting to be let in.
          An account is only usable once its address is confirmed <em>and</em> a
          member of staff has activated it.
        </>}
      >
        {/*
          The count sits in the title row rather than in a filter, because it
          is the reason somebody opened this screen. It links to the filter it
          describes so the number is also the way in.
        */}
        {pending > 0 && (
          <div className="ml-auto">
            <ButtonLink href="/admin/customers?status=pending" size="sm">
              {pending} waiting for approval
            </ButtonLink>
          </div>
        )}
      </PageHeader>

      <FilterBar action="/admin/customers">
        <div className="min-w-0">
          <label htmlFor="q" className="mb-0.5 block text-[11px] font-semibold text-faint">Search</label>
          <Input id="q" name="q" defaultValue={params.q} placeholder="Name, email or company…" className="min-w-[210px] py-1.5 text-[13px]" />
        </div>
        <div>
          <label htmlFor="status" className="mb-0.5 block text-[11px] font-semibold text-faint">Status</label>
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">Any status</option>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor="verified" className="mb-0.5 block text-[11px] font-semibold text-faint">Email</label>
          <Select id="verified" name="verified" defaultValue={params.verified ?? ""}>
            <option value="">Either</option>
            <option value="1">Confirmed</option>
            <option value="0">Unconfirmed</option>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {filtered && <ButtonLink href="/admin/customers" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </FilterBar>

      {customers.length === 0 ? (
        <EmptyState icon={<IconUsers />} title={filtered ? "No accounts match those filters" : "No portal accounts yet"}>
          {filtered
            ? "Try a different term, or clear the filters."
            : "Accounts appear here when somebody registers, or when one is created with the artisan command."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[840px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line-strong text-[10.5px] font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Name</th>
                <th scope="col" className="px-3 py-1.5">Company</th>
                <th scope="col" className="px-3 py-1.5">Status</th>
                <th scope="col" className="px-3 py-1.5">Tickets</th>
                <th scope="col" className="px-3 py-1.5">Registered</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-b-0 align-top">
                  <td data-label="Name" className="px-3 py-2">
                    <Link href={`/admin/customers/${c.id}`} className="block hover:underline">
                      <span className="text-[13.5px] font-medium text-ink">{c.name}</span>
                    </Link>
                    <p className="mt-0.5 text-[12.5px] text-muted">{c.email}</p>
                  </td>
                  <td data-label="Company" className="px-3 py-2 text-muted">{c.company || "—"}</td>
                  <td data-label="Status" className="px-3 py-2">
                    <span className="flex flex-wrap gap-1.5">
                      <CustomerStatusBadge status={c.status} label={c.status_label} />
                      {/*
                        Only flagged when it is missing. A confirmed address is
                        the ordinary case and a badge on every row for the
                        normal state is noise the eye learns to skip — which is
                        exactly when it stops working for the abnormal one.
                      */}
                      {!c.email_verified && <VerifiedBadge verified={false} />}
                    </span>
                  </td>
                  <td data-label="Tickets" className="px-3 py-2 font-mono text-[12.5px] text-muted">
                    {c.ticket_count ?? 0}
                  </td>
                  <td data-label="Registered" className="px-3 py-2 text-[12.5px] text-muted">
                    {shortDate(c.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        meta={result.meta}
        basePath="/admin/customers"
        params={{ q: params.q, status: params.status, verified: params.verified, per_page: params.per_page }}
      />
    </>
  );
}
