import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { SortTh } from "@/components/admin/sort-th";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { getNotFoundList, type NotFoundList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { formatDate } from "@/lib/dates";
import { requireScreen } from "@/lib/admin-screen";
import { IgnoreButton } from "./ignore-button";
import { ROW_ACTION } from "./row-action";

export const metadata = buildMetadata({
  title: "Missing pages",
  path: "/admin/not-found",
  seo: noIndex,
});

type SearchParams = {
  q?: string; show?: string; sort?: string; dir?: string; page?: string; per_page?: string;
};

/**
 * The addresses visitors asked for that do not exist (0.137.0, docs/seo.md).
 *
 * The worklist the redirect table is the answer to: ranked by how often an
 * address was asked for, each with one press to make the redirect. An address
 * leaves by itself once a redirect starts there, so there is no "done" to tick.
 */
export default async function MissingPagesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireScreen();
  const params = await searchParams;

  const showIgnored = params.show === "ignored";

  let result: NotFoundList;

  try {
    result = await getNotFoundList({
      q: params.q,
      ignored: showIgnored,
      sort: params.sort,
      dir: params.dir,
      page: Number(params.page) || 1,
      // Read, passed and repeated on the pager's links, or the choice is
      // forgotten on page two.
      per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return <ErrorState title="We could not load this list">The admin API is not responding.</ErrorState>;
  }

  // What every link on the page carries forward: the filters, then the sort.
  const filters = { q: params.q, show: params.show, per_page: params.per_page };
  const sorting = { ...filters, sort: params.sort, dir: params.dir };

  return (
    <>
      <PageHeader
        title="Missing pages"
        lede={<>
          Addresses visitors asked for that do not exist, with how often. Make a redirect for the
          ones worth keeping; a redirect takes up to a minute to start working, and the address
          leaves this list once it does. Ignore the rest. Addresses nobody has asked for in{" "}
          {result.meta.retention_days} days are deleted.
        </>}
      />

      <FilterBar action="/admin/not-found">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Address…" />
        </FilterField>

        <FilterField label="Show" htmlFor="show">
          <Select id="show" name="show" defaultValue={showIgnored ? "ignored" : ""}>
            <option value="">Waiting ({result.meta.live})</option>
            <option value="ignored">Ignored ({result.meta.ignored})</option>
          </Select>
        </FilterField>

        <Button type="submit">Filter</Button>
      </FilterBar>

      {result.data.length === 0 ? (
        <EmptyState title={showIgnored ? "Nothing is ignored" : "No missing pages"}>
          {params.q
            ? "No address matches that search."
            : showIgnored
              ? "Addresses you choose to ignore are listed here, in case you change your mind."
              : "Every address visitors have asked for exists, or already has a redirect. This list fills itself when somebody follows a dead link."}
        </EmptyState>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="admin-table w-full min-w-[820px] text-left text-13">
            <thead>
              <tr className="border-b border-line text-12 text-muted">
                <th scope="col" className="px-3 py-1.5 font-semibold">Address</th>
                <SortTh sortKey="hits" label="Times asked for" basePath="/admin/not-found" params={sorting} sort={params.sort} dir={params.dir} className="text-right whitespace-nowrap" />
                <SortTh sortKey="last_seen" label="Last asked for" basePath="/admin/not-found" params={sorting} sort={params.sort} dir={params.dir} className="whitespace-nowrap" />
                <th scope="col" className="px-3 py-1.5 font-semibold">Came from</th>
                <th scope="col" className="px-3 py-1.5 font-semibold">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((row) => (
                <tr key={row.id} className="border-b border-line align-top">
                  {/*
                    Every cell carries a `data-label`, because below `md` this
                    table becomes cards and an unlabelled cell reads as a loose
                    string of text. The labels are shorter than the headings:
                    a card's label column is 6rem, and "Last asked for" ran
                    into its own value there.
                  */}
                  <td data-label="Address" className="min-w-0 px-3 py-2.5">
                    {/*
                      `[overflow-wrap:anywhere]`, not `break-words`: an address
                      is one unbroken run with no spaces in it, and `break-words`
                      breaks between words a run like that does not have. The
                      cell is `min-w-0` because a table cell's automatic
                      minimum is its min-content, and a long slug would
                      otherwise widen a phone.
                    */}
                    <span className="block max-w-[56ch] min-w-0 font-mono text-13 [overflow-wrap:anywhere]">
                      {row.path}
                    </span>
                  </td>
                  <td data-label="Asked" className="px-3 py-2.5 text-right tabular-nums">
                    {row.hits.toLocaleString("en-IN")}
                  </td>
                  <td data-label="Last asked" className="px-3 py-2.5 whitespace-nowrap text-muted">
                    {formatDate(row.last_seen_at, "dateTimeShort")}
                  </td>
                  <td data-label="Came from" className="min-w-0 px-3 py-2.5">
                    {row.referrer ? (
                      <span className="block max-w-[40ch] min-w-0 font-mono text-12 text-muted [overflow-wrap:anywhere]">
                        {row.referrer}
                      </span>
                    ) : (
                      <span className="text-faint">Not known</span>
                    )}
                  </td>
                  <td data-label="" className="px-3 py-2.5">
                    <div className="flex flex-wrap items-start gap-2 xl:flex-nowrap">
                      <Link href={row.redirect_path} className={ROW_ACTION}>
                        Make a redirect
                      </Link>
                      <IgnoreButton id={row.id} ignored={row.ignored_at !== null} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/not-found" params={sorting} />
    </>
  );
}
