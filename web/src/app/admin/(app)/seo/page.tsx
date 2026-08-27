import Link from "next/link";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader, FilterBar } from "@/components/admin/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { IconSearchChart, IconPen, IconExternal } from "@/components/icons";
import { getSeoOverview } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { SitemapToggle } from "./sitemap-toggle";
import { SiteScoreCard } from "./score";
import { RecordScore, RowRecheck, RowScoreProvider } from "./row-score";
import type { SeoMeta, SeoRow } from "@/types/api";

export const metadata = buildMetadata({ title: "SEO", path: "/admin/seo", seo: noIndex });

type SearchParams = {
  type?: string; q?: string; issues?: string; check?: string; page?: string; per_page?: string;
};

export default async function AdminSeoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  let rows: SeoRow[];
  let meta: SeoMeta;
  try {
    const res = await getSeoOverview({
      type: params.type, q: params.q, issues: params.issues, check: params.check,
      page: params.page, per_page: params.per_page,
    });
    rows = res.data;
    meta = res.meta;
  } catch {
    return (
      <ErrorState title="We could not load the SEO overview">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  // The API does this filtering now. It used to happen here, which was fine
  // while every record was on one page — but this screen is paginated, and
  // filtering a page in the browser hides only the rows that happen to be on
  // it, which is worse than not filtering at all.
  const onlyIssues = params.issues === "1";
  const filtered = Boolean(params.type || params.q || onlyIssues || params.check);

  // A `check` filter is set by clicking a figure on the score card, so the
  // screen has to say what it is showing — otherwise the list simply gets
  // shorter and nothing on it explains why.
  const checkLabel = params.check
    ? meta.site_score.top_issues.find((i) => i.key === params.check)?.label
      ?? rows[0]?.score.failed.find((f) => f.key === params.check)?.label
    : undefined;

  return (
    <>
      <PageHeader
        title="SEO"
        lede={<>
          Every indexable record, the metadata it will actually publish, and how
          much of what a search engine looks for it is doing. Anything not
          overridden is derived from the content, which is usually right — this
          is where you find the places it is not.
        </>}
      />

      <SiteScoreCard
        site={meta.site_score}
        withIssues={meta.with_issues}
        params={{ type: params.type, q: params.q, per_page: params.per_page }}
      />

      <FilterBar action="/admin/seo">
        <div className="min-w-0">
          <label htmlFor="q" className="mb-0.5 block text-[11px] font-semibold text-faint">Search</label>
          <Input id="q" name="q" defaultValue={params.q} placeholder="Record name…" className="min-w-[200px] py-1.5 text-[13px]" />
        </div>
        <div>
          <label htmlFor="type" className="mb-0.5 block text-[11px] font-semibold text-faint">Type</label>
          <Select id="type" name="type" defaultValue={params.type ?? ""}>
            <option value="">All types</option>
            {meta.types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor="issues" className="mb-0.5 block text-[11px] font-semibold text-faint">Show</label>
          <Select id="issues" name="issues" defaultValue={onlyIssues ? "1" : ""}>
            <option value="">Everything</option>
            <option value="1">Only records with issues</option>
          </Select>
        </div>
        {/* Carried through the filter form, or applying a search would quietly
            drop the check the score card sent you here to look at. */}
        {params.check && <input type="hidden" name="check" value={params.check} />}
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {filtered && <ButtonLink href="/admin/seo" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </FilterBar>

      {checkLabel && (
        <p className="mb-3 text-[13px] text-muted">
          Showing the {meta.total} {meta.total === 1 ? "record" : "records"} where{" "}
          <strong className="font-semibold text-ink">{checkLabel.toLowerCase()}</strong> is the
          problem.{" "}
          <Link href="/admin/seo" className="text-brand-ink underline">Show everything</Link>
        </p>
      )}

      {rows.length === 0 ? (
        // "Nothing matched" and "nothing is wrong" are opposite pieces of news
        // and want opposite words. A search that finds nothing is a miss; a
        // check that finds nothing is the point of running it.
        <EmptyState
          icon={<IconSearchChart />}
          title={onlyIssues || params.check ? "Nothing needs attention" : "No records match"}
        >
          {params.check
            ? "No record is failing that check."
            : onlyIssues
              ? "Every title and description is within the lengths search engines show."
              : "Try a different term, or clear the filters."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[1040px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line-strong text-[10.5px] font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Record</th>
                <th scope="col" className="px-3 py-1.5">Title &amp; description</th>
                <th scope="col" className="px-3 py-1.5">Score</th>
                <th scope="col" className="px-3 py-1.5">Source</th>
                <th scope="col" className="px-3 py-1.5">Sitemap</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                /*
                  The provider wraps the row rather than sitting inside a cell:
                  Recheck lives in the first column and the score it changes in
                  the fourth, and they have to be one piece of state. It renders
                  no DOM, so the <tr> is still a direct child of <tbody> —
                  anything else there is invalid markup that browsers quietly
                  move out of the table.
                */
                <RowScoreProvider key={`${r.type}-${r.id}`} record={r}>
                <tr className="border-b border-line last:border-b-0 align-top">
                  <td data-label="Record" className="px-3 py-2">
                    <div className="flex items-start gap-1.5">
                      {/*
                        The record name opens the page a visitor would see. It
                        used to open the edit form, which meant the one link on
                        the row could not answer "what does this actually look
                        like" — the question a metadata screen raises most.
                        It follows the record's own path, not its canonical:
                        pointing a canonical at another page is a legitimate
                        thing to do, and this link must not follow it there.
                        A path rather than a URL, so it opens on the host the
                        console is being used on — the API's `frontend_url` is
                        pinned to production because canonicals and the sitemap
                        are built from it, which made it the wrong base for a
                        link somebody clicks.
                        Editing is the button beside it, and it is a button
                        rather than a second link so the two are told apart at
                        a glance and by a screen reader.
                      */}
                      <a
                        href={r.public_path}
                        target="_blank"
                        rel="noreferrer"
                        className="group inline-flex min-w-0 items-start gap-1 text-[13.5px] font-medium text-ink hover:underline"
                      >
                        <span className="min-w-0">{r.name}</span>
                        <IconExternal
                          width={12} height={12}
                          className="mt-[3px] shrink-0 text-faint group-hover:text-brand-ink"
                        />
                      </a>

                      {/*
                        Also a new tab: this screen is worked down a list with
                        filters applied, and editing in place spends that
                        position to get back to it.
                      */}
                      {/*
                        Edit, then recheck. The pair is in that order because
                        it is the order they are used in: the edit opens in a
                        new tab, the fix happens there, and the recheck is what
                        you press on coming back — without which this list goes
                        on showing the score from before.

                        `ml-auto` moves to the group so the two stay together
                        against the right edge rather than the first one
                        floating and the second following it.
                      */}
                      <span className="ml-auto flex shrink-0 items-center gap-1">
                        <Link
                          href={`${r.admin_path}?tab=seo`}
                          target="_blank"
                          aria-label={`Edit the SEO of ${r.name} (opens in a new tab)`}
                          title="Edit title and description — opens in a new tab"
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-line-strong bg-surface-2 text-muted transition-colors hover:border-brand-600 hover:bg-brand-50 hover:text-brand-ink"
                        >
                          <IconPen width={13} height={13} />
                        </Link>

                        <RowRecheck />
                      </span>
                    </div>
                    <p className="mt-0.5 text-[12px] text-faint">{r.type_label}</p>
                  </td>

                  <td data-label="Title &amp; description" className="px-3 py-2">
                    <p className="max-w-[46ch] text-ink">{r.title ?? <em className="text-err">No title</em>}</p>
                    <p className="mt-0.5 max-w-[60ch] text-[12.5px] text-muted">
                      {r.description ?? <em className="text-err">No description</em>}
                    </p>
                    {r.issues.length > 0 && (
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        {r.issues.map((i) => <Badge key={i} tone="urgent">{i}</Badge>)}
                      </span>
                    )}
                  </td>

                  <td data-label="Score" className="px-3 py-2">
                    <RecordScore />
                  </td>

                  <td data-label="Source" className="px-3 py-2">
                    {r.has_override
                      ? (
                        <>
                          <Badge tone="resolved">Overridden</Badge>
                          <p className="mt-1 text-[12px] text-faint">{r.overridden.join(", ")}</p>
                        </>
                      )
                      : <Badge tone="closed">Derived</Badge>}
                  </td>

                  <td data-label="Sitemap" className="px-3 py-2">
                    <SitemapToggle type={r.type} id={r.id} included={r.sitemap_include} name={r.name} />
                  </td>
                </tr>
                </RowScoreProvider>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        meta={meta}
        basePath="/admin/seo"
        params={{
          type: params.type, q: params.q, issues: params.issues,
          check: params.check, per_page: params.per_page,
        }}
      />
    </>
  );
}
