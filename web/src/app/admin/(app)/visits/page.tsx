import Link from "next/link";
import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { SortTh } from "@/components/admin/sort-th";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { IconWrench } from "@/components/icons";
import { getVisits } from "@/lib/admin";
import { getCurrentStaff } from "@/lib/admin-auth";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { relativeTime } from "@/lib/dates";
import { istDate } from "@/lib/visit-dates";
import { VisitRowActions } from "./visit-row";
import type { AdminVisitIndex } from "@/types/api";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "Visits", path: "/admin/visits", seo: noIndex });

type SearchParams = {
  q?: string; status?: string; assigned_to?: string; unassigned?: string; open?: string;
  from?: string; to?: string; sort?: string; dir?: string; page?: string; per_page?: string;
};

/**
 * Engineer visit requests (docs/visits.md). The default order is the one the
 * desk works in: what is waiting for a time, oldest first; then the diary,
 * soonest first; then everything closed.
 */
export default async function VisitsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireScreen();
  const params = await searchParams;

  const query = {
    q: params.q, status: params.status, assigned_to: params.assigned_to,
    unassigned: params.unassigned === "1", open: params.open === "1",
    from: params.from, to: params.to, sort: params.sort, dir: params.dir,
    page: Number(params.page) || 1, per_page: Number(params.per_page) || undefined,
  };

  let result: AdminVisitIndex;
  let me: number | null = null;

  try {
    [result, me] = await Promise.all([getVisits(query), getCurrentStaff().then((s) => s?.id ?? null)]);
  } catch {
    return (
      <ErrorState title="We could not load the visits">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const visits = result.data;
  const filtered = Boolean(params.q || params.status || params.assigned_to || params.unassigned || params.open || params.from || params.to);
  const today = istDate();
  const pageParams = {
    q: params.q, status: params.status, assigned_to: params.assigned_to, unassigned: params.unassigned,
    open: params.open, from: params.from, to: params.to, sort: params.sort, dir: params.dir, per_page: params.per_page,
  };

  return (
    <>
      <PageHeader
        title="Visits"
        lede={<>
          Engineer visits people have asked for. They offer up to three dates with a part of the day each;
          open one to choose the time, and the customer is emailed a confirmation with a calendar file.
        </>}
      />

      <FilterBar action="/admin/visits">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Reference, name, email, phone…" />
        </FilterField>

        <FilterField label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">Any status</option>
            {result.meta.statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </FilterField>

        <FilterField label="Engineer" htmlFor="assigned_to">
          <Select id="assigned_to" name="assigned_to" defaultValue={params.assigned_to ?? ""}>
            <option value="">Anyone</option>
            {result.meta.assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </FilterField>

        <FilterField label="Visit from" htmlFor="from">
          <Input id="from" name="from" type="date" defaultValue={params.from} />
        </FilterField>

        <FilterField label="Visit to" htmlFor="to">
          <Input id="to" name="to" type="date" defaultValue={params.to} />
        </FilterField>

        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {filtered && <ButtonLink href="/admin/visits" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </FilterBar>

      {/*
        The figures somebody acts on, counted over the whole table rather than
        the page, each linking to the query that produced it.
      */}
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-13 text-muted">
        {result.meta.awaiting_count > 0 && params.status !== "requested" && (
          <p>
            <Link href="/admin/visits?status=requested" className="font-semibold text-brand-ink underline">
              {result.meta.awaiting_count} waiting for a time
            </Link>
          </p>
        )}
        {result.meta.today_count > 0 && (
          <p>
            <Link href={`/admin/visits?status=confirmed&from=${today}&to=${today}`} className="font-semibold text-brand-ink underline">
              {result.meta.today_count} today
            </Link>
          </p>
        )}
        {result.meta.unassigned_count > 0 && (
          <p>
            <Link href="/admin/visits?status=confirmed&unassigned=1" className="font-semibold text-err underline">
              {result.meta.unassigned_count} booked with no engineer
            </Link>
          </p>
        )}
      </div>

      {visits.length === 0 ? (
        <EmptyState icon={<IconWrench />} title={filtered ? "Nothing matches those filters" : "No visit requests yet"}>
          {filtered
            ? "Try a different term, or clear the filters."
            : "Requests from the Book a site visit page appear here."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[900px] text-left text-13">
            <thead>
              <tr className="border-b border-line-strong text-10-5 font-semibold uppercase tracking-[.06em] text-faint">
                <SortTh sortKey="name" label="Contact" basePath="/admin/visits" params={pageParams} sort={params.sort} dir={params.dir} />
                <th scope="col" className="px-3 py-1.5">About</th>
                <SortTh sortKey="scheduled" label="When" basePath="/admin/visits" params={pageParams} sort={params.sort} dir={params.dir} />
                <SortTh sortKey="status" label="Status" basePath="/admin/visits" params={pageParams} sort={params.sort} dir={params.dir} />
                <th scope="col" className="px-3 py-1.5">Engineer</th>
                <SortTh sortKey="created" label="Received" basePath="/admin/visits" params={pageParams} sort={params.sort} dir={params.dir} />
              </tr>
            </thead>
            <tbody>
              {visits.map((visit) => (
                <tr key={visit.reference} className="border-b border-line last:border-b-0 align-top">
                  <td data-label="Contact" className="max-w-[30ch] px-3 py-2">
                    <Link href={`/admin/visits/${visit.reference}`} className="font-medium hover:underline">
                      {visit.name}
                    </Link>
                    <span className="block truncate font-mono text-12 text-faint">{visit.reference}</span>
                    {visit.company && <span className="block truncate text-12 text-muted">{visit.company}</span>}
                  </td>

                  <td data-label="About" className="max-w-[26ch] px-3 py-2">
                    <span className="block truncate">{visit.topic}</span>
                    {visit.site_address?.city && <span className="block truncate text-12 text-muted">{visit.site_address.city}</span>}
                  </td>

                  <td data-label="When" className="px-3 py-2">
                    {visit.status === "confirmed" && visit.visit_date ? (
                      <span className="whitespace-nowrap font-medium">{visit.visit_date}<span className="block text-12 font-normal text-muted">{visit.visit_time}</span></span>
                    ) : visit.status === "requested" ? (
                      <ul className="grid gap-0.5 text-12 text-muted">
                        {visit.preferred.map((p) => <li key={`${p.date}-${p.window}`}>{p.label}</li>)}
                      </ul>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>

                  <VisitRowActions key={`${visit.status}:${visit.assigned_to ?? 0}`} visit={visit} me={me} />

                  <td data-label="Received" className="px-3 py-2 whitespace-nowrap text-muted">
                    {relativeTime(visit.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/visits" params={pageParams} />
    </>
  );
}
