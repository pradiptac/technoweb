import Link from "next/link";
import { PageHeader, FilterBar } from "@/components/admin/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Alert, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { getLocations } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminLocation, Paginated } from "@/types/api";

export const metadata = buildMetadata({ title: "Places", path: "/admin/locations", seo: noIndex });

type SearchParams = { q?: string; active?: string; page?: string; deleted?: string };

export default async function LocationsAdminPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  let result: Paginated<AdminLocation>;
  try {
    result = await getLocations({ q: params.q, active: params.active, page: Number(params.page) || 1 });
  } catch {
    return <ErrorState title="We could not load the places">The admin API is not responding.</ErrorState>;
  }

  const rows = result.data;

  return (
    <>
      <PageHeader
        title="Places"
        lede={<>
          Where engineers actually attend sites. Each one can carry a page of its
          own, but only once something concrete is recorded about working there —
          a page that names a city and says nothing specific about it is the
          pattern search engines penalise, and it is a claim about the business
          besides.
        </>}
      >
        <div className="ml-auto"><ButtonLink href="/admin/locations/new" size="sm">Add a place</ButtonLink></div>
      </PageHeader>

      {params.deleted && <Alert tone="ok" title="Place deleted">It is no longer offered for new pages.</Alert>}

      <FilterBar action="/admin/locations">
        <div className="min-w-0">
          <label htmlFor="q" className="mb-0.5 block text-[11px] font-semibold text-faint">Search</label>
          <Input id="q" name="q" defaultValue={params.q} placeholder="Name" />
        </div>
        <div>
          <label htmlFor="active" className="mb-0.5 block text-[11px] font-semibold text-faint">Coverage</label>
          <Select id="active" name="active" defaultValue={params.active ?? ""}>
            <option value="">Any</option>
            <option value="1">We work here</option>
            <option value="0">Switched off</option>
          </Select>
        </div>
        <Button type="submit" size="sm">Filter</Button>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState title="No places yet">
          Nothing is seeded here on purpose — a place is a statement that your
          engineers go there, so it is one somebody has to make deliberately.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[680px] border-collapse text-[13.5px]">
            <thead>
              <tr className="border-b border-line-strong text-left text-[11.5px] uppercase tracking-wide text-faint">
                <th className="py-2.5 pr-3 font-semibold">Place</th>
                <th className="py-2.5 pr-3 font-semibold">Coverage</th>
                <th className="py-2.5 pr-3 font-semibold">Ready for pages?</th>
                <th className="py-2.5 pr-3 font-semibold">Pages</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-line align-top">
                  <td className="py-3 pr-3" data-label="Place">
                    <Link href={`/admin/locations/${row.id}`} className="font-medium text-ink hover:text-brand-ink hover:underline">
                      {row.name}
                    </Link>
                    {/* full_name is assembled by the API from the tree, so the
                        console does not walk ancestors per row to say the same
                        thing in slightly different words. */}
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      {row.level_label}{row.full_name !== row.name ? ` · ${row.full_name}` : ""}
                    </p>
                  </td>
                  <td className="py-3 pr-3" data-label="Coverage">
                    <Badge tone={row.is_active ? "resolved" : "closed"}>
                      {row.is_active ? "We work here" : "Switched off"}
                    </Badge>
                  </td>
                  <td className="py-3 pr-3" data-label="Ready for pages?">
                    {row.has_local_substance ? (
                      <span className="text-[13px] font-semibold text-ok">Yes</span>
                    ) : (
                      <span className="measure block text-[12.5px] text-muted">
                        Nothing recorded yet — add an address, an attendance line
                        or a summary.
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-3 text-muted" data-label="Pages">{row.landing_page_count ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/locations" params={{ q: params.q, active: params.active }} />
    </>
  );
}
