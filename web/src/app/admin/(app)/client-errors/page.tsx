import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { getClientErrors, type ClientErrorList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { ResolveButton } from "./resolve-button";

export const metadata = buildMetadata({
  title: "JavaScript errors",
  path: "/admin/client-errors",
  seo: noIndex,
});

type SearchParams = { q?: string; area?: string; all?: string; page?: string };

const stamp = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : "—";

/**
 * Which part of the product failed.
 *
 * `site` is a visitor with no account and no support line; `admin` is a
 * colleague unable to work. They are different sizes of problem, so they are
 * different colours rather than one label.
 */
const AREA_TONE = { site: "urgent", admin: "progress", portal: "open" } as const;

export default async function ClientErrorsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  let result: ClientErrorList;

  try {
    result = await getClientErrors({
      q: params.q,
      area: params.area,
      all: params.all === "1",
      page: Number(params.page) || 1,
    });
  } catch {
    return <ErrorState title="We could not load this list">The admin API is not responding.</ErrorState>;
  }

  return (
    <>
      <PageHeader
        title="JavaScript errors"
        lede={<>
          What the site&rsquo;s own code has failed at, in readers&rsquo; browsers. Grouped by
          failure rather than listed by occurrence — forty people hitting one bug is one row
          with a count, not forty rows. Reports older than {result.meta.retention_days} days are
          deleted.
        </>}
      />

      <FilterBar action="/admin/client-errors">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Message…" />
        </FilterField>

        <FilterField label="Area" htmlFor="area">
          <Select id="area" name="area" defaultValue={params.area ?? ""}>
            <option value="">Everywhere</option>
            <option value="site">Public site</option>
            <option value="admin">Console</option>
            <option value="portal">Portal</option>
          </Select>
        </FilterField>

        <FilterField label="Show" htmlFor="all">
          <Select id="all" name="all" defaultValue={params.all ?? ""}>
            <option value="">Outstanding</option>
            <option value="1">Including dealt with</option>
          </Select>
        </FilterField>

        <Button type="submit">Filter</Button>
      </FilterBar>

      {result.data.length === 0 ? (
        <EmptyState title="Nothing has failed">
          {params.q || params.area || params.all
            ? "No report matches that filter."
            : "No JavaScript error has been reported. That is the result you want here — this list fills itself only when something breaks in somebody's browser."}
        </EmptyState>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="admin-table w-full min-w-[820px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-[12px] text-muted">
                <th className="py-2 pr-3 pl-4 font-semibold">Failure</th>
                <th className="py-2 pr-3 font-semibold">Area</th>
                <th className="py-2 pr-3 text-right font-semibold">Times</th>
                <th className="py-2 pr-3 font-semibold">First seen</th>
                <th className="py-2 pr-3 font-semibold">Last seen</th>
                <th className="py-2 pr-4 font-semibold">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((row) => (
                <tr key={row.id} className="border-b border-line align-top">
                  {/*
                    Every cell carries a `data-label`, because below `md` this
                    table becomes cards and an unlabelled cell reads as a loose
                    string of text.
                  */}
                  <td data-label="Failure" className="py-2.5 pr-3 pl-4">
                    {/*
                      `[overflow-wrap:anywhere]`, not `break-words`: a stack
                      message is frequently one unbroken run with no spaces in
                      it, and `break-words` breaks between words a run like that
                      does not have — the trap the chat bubble already
                      documents. `min-w-0` because a table cell's automatic
                      minimum is its min-content.
                    */}
                    <span className="block max-w-[62ch] min-w-0 font-medium [overflow-wrap:anywhere]">
                      {row.message}
                    </span>
                    {row.path && (
                      <span className="mt-1 block font-mono text-[11.5px] text-muted [overflow-wrap:anywhere]">
                        {row.path}
                      </span>
                    )}
                    {row.digest && (
                      <span className="mt-0.5 block font-mono text-[11px] text-faint">
                        digest {row.digest}
                      </span>
                    )}
                  </td>
                  <td data-label="Area" className="py-2.5 pr-3">
                    <Badge tone={AREA_TONE[row.area] ?? "open"}>{row.area}</Badge>
                  </td>
                  <td data-label="Times" className="py-2.5 pr-3 text-right tabular-nums">
                    {row.occurrences}
                  </td>
                  <td data-label="First seen" className="py-2.5 pr-3 whitespace-nowrap text-muted">
                    {stamp(row.first_seen_at)}
                  </td>
                  <td data-label="Last seen" className="py-2.5 pr-3 whitespace-nowrap text-muted">
                    {stamp(row.last_seen_at)}
                  </td>
                  <td data-label="" className="py-2.5 pr-4">
                    {row.resolved_at ? (
                      <span className="text-[12px] text-faint">Dealt with</span>
                    ) : (
                      <ResolveButton id={row.id} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/client-errors" params={{ q: params.q, area: params.area, all: params.all }} />
    </>
  );
}
