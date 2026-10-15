import Link from "next/link";

import { BulkBar, RowTick, TickAll } from "@/components/admin/row-selection";
import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { SortTh } from "@/components/admin/sort-th";
import { EmptyListAction } from "@/components/admin/empty-list-action";
import { ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { getTenders } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import { bulkTendersAction } from "./actions";
import { stateTone } from "./tender-tones";

export const metadata = buildMetadata({ title: "Tenders", path: "/admin/tenders", seo: noIndex });

type Params = {
  q?: string; status?: string; when?: string; category?: string;
  sort?: string; dir?: string; page?: string; per_page?: string;
};

/** Notices inviting bids (0.174.0, docs/tenders.md). */
export default async function AdminTendersPage({ searchParams }: { searchParams: Promise<Params> }) {
  // Before `searchParams`: the gate is what decides whether this account may
  // see the screen at all, and it should not wait on the query string.
  await requireScreen();
  const params = await searchParams;

  let result;
  try {
    result = await getTenders({
      q: params.q, status: params.status, when: params.when, category: params.category,
      sort: params.sort, dir: params.dir,
      page: Number(params.page) || 1,
      per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return (
      <ErrorState title="We could not load the tenders">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const filters = { q: params.q, status: params.status, when: params.when, category: params.category, per_page: params.per_page };
  const sorting = { ...filters, sort: params.sort, dir: params.dir };
  const filtered = Boolean(params.q || params.status || params.when || params.category);

  return (
    <>
      <PageHeader
        title="Tenders"
        lede={<>
          Notices inviting bids. A published tender is listed on <code>/tenders</code> with its closing date and
          its documents; bidders submit the way the notice says, and nothing is submitted through the site.
          A closed tender stays on the site as a record.
        </>}
      >
        <div className="ml-auto flex flex-wrap gap-2">
          <ButtonLink href="/admin/tenders/categories" variant="secondary" size="sm">Categories</ButtonLink>
          <ButtonLink href="/admin/tenders/new" size="sm">New tender</ButtonLink>
        </div>
      </PageHeader>

      <FilterBar action="/admin/tenders">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q ?? ""} placeholder="Number, title or scope…" />
        </FilterField>
        <FilterField label="Window" htmlFor="when">
          <Select id="when" name="when" defaultValue={params.when ?? ""}>
            <option value="">Any</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="upcoming">Not open yet</option>
          </Select>
        </FilterField>
        <FilterField label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">Any</option>
            {result.options.statuses.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Category" htmlFor="category">
          <Select id="category" name="category" defaultValue={params.category ?? ""}>
            <option value="">Any</option>
            <option value="none">Filed nowhere</option>
            {result.options.categories.map((c) => (
              <option key={c.id} value={String(c.id)}>{c.name}{c.is_active ? "" : " (off)"}</option>
            ))}
          </Select>
        </FilterField>
      </FilterBar>

      {result.data.length === 0 ? (
        <EmptyState
          illustration="document"
          title={filtered ? "No tenders match that" : "No tenders yet"}
          action={<EmptyListAction filtered={filtered} clearHref="/admin/tenders" newHref="/admin/tenders/new" noun="tender" />}
        >
          {filtered
            ? "Try a different window, or clear the filters."
            : "A tender is a reference, a scope of work and a closing date, with its documents attached. Nothing is published until you say so."}
        </EmptyState>
      ) : (
        <>
          <BulkBar
            scope="tenders"
            ids={result.data.map((t) => t.id)}
            noun={{ one: "tender", many: "tenders" }}
            action={bulkTendersAction}
          />

          <div className="overflow-x-auto">
            <table className="admin-table w-full min-w-[920px] text-13-5">
              <thead>
                <tr className="border-b border-line-strong text-left text-11-5 uppercase tracking-[.06em] text-faint">
                  <th className="w-8 py-2.5"><TickAll scope="tenders" ids={result.data.map((t) => t.id)} noun="tender" /></th>
                  <SortTh sortKey="title" label="Tender" basePath="/admin/tenders" params={sorting} sort={params.sort} dir={params.dir} />
                  <SortTh sortKey="reference" label="Number" basePath="/admin/tenders" params={sorting} sort={params.sort} dir={params.dir} />
                  <th className="py-2.5 font-semibold">Category</th>
                  <SortTh sortKey="closes" label="Closes" basePath="/admin/tenders" params={sorting} sort={params.sort} dir={params.dir} />
                  <th className="py-2.5 font-semibold">Window</th>
                  <SortTh sortKey="status" label="Status" basePath="/admin/tenders" params={sorting} sort={params.sort} dir={params.dir} />
                  <th className="py-2.5 font-semibold">Docs</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((tender) => (
                  <tr key={tender.id} className="border-b border-line last:border-b-0">
                    <td className="py-2.5"><RowTick scope="tenders" id={tender.id} label={tender.title} /></td>
                    <td data-label="Tender" className="max-w-[40ch] py-2.5">
                      <Link href={`/admin/tenders/${tender.id}`} className="font-semibold text-brand-ink hover:underline">
                        {tender.title}
                      </Link>
                      {tender.summary && (
                        <span className="mt-0.5 block truncate text-12 text-muted">{tender.summary}</span>
                      )}
                    </td>
                    <td data-label="Number" className="py-2.5 font-mono text-12-5">{tender.reference}</td>
                    <td data-label="Category" className="py-2.5">
                      {tender.category
                        ? <span className={tender.category.is_active ? undefined : "text-muted"}>{tender.category.name}</span>
                        : <span className="text-faint">—</span>}
                    </td>
                    {/* The API's own words: nothing here formats a deadline. */}
                    <td data-label="Closes" className="py-2.5">{tender.closes_label}</td>
                    <td data-label="Window" className="py-2.5">
                      <Badge tone={stateTone(tender.state)}>{tender.state_label}</Badge>
                      {tender.closes_in_label && (
                        <span className="mt-0.5 block text-12 text-muted">{tender.closes_in_label}</span>
                      )}
                    </td>
                    <td data-label="Status" className="py-2.5">
                      <Badge tone={tender.status === "published" ? "resolved" : "progress"}>{tender.status_label}</Badge>
                    </td>
                    <td data-label="Docs" className="py-2.5 tabular-nums">{tender.documents_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination meta={result.meta} basePath="/admin/tenders" params={filters} />
        </>
      )}
    </>
  );
}
