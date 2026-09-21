import Link from "next/link";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader, FilterBar } from "@/components/admin/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/input";
import { IconSearchChart, IconPen, IconExternal } from "@/components/icons";
import { getSeoOverview } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { SitemapToggle } from "./sitemap-toggle";
import { SiteScoreCard } from "./score";
import { RecordScore, RowRecheck, RowScoreProvider } from "./row-score";
import { BulkAi } from "./bulk-ai";
import { SortTh } from "@/components/admin/sort-th";
import { BAND } from "./score";
import type { ReadinessScore, SeoBand, SeoMeta, SeoRow } from "@/types/api";

export const metadata = buildMetadata({ title: "SEO", path: "/admin/seo", seo: noIndex });

type SearchParams = {
  type?: string; q?: string; issues?: string; check?: string; ai?: string; search?: string; analytics?: string;
  aeo?: string; geo?: string; aeo_check?: string; geo_check?: string;
  sort?: string; dir?: string; page?: string; per_page?: string;
};

const READINESS_BADGE: Record<SeoBand, "resolved" | "progress" | "urgent"> = {
  good: "resolved", fair: "progress", poor: "urgent",
};

/**
 * An AEO or GEO cell: the figure and its band, or a dash where the API has
 * not scored the record. A dash rather than a zero, because "not measured"
 * and "measured at nothing" are different claims — the rule every figure on
 * the dashboards follows.
 */
function Readiness({ score, what }: { score: ReadinessScore | undefined; what: string }) {
  if (!score) return <span className="text-faint" title={`${what} not scored yet`}>—</span>;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("font-display text-15 font-semibold tabular-nums", BAND[score.band].text)}>{score.value}</span>
      <Badge tone={READINESS_BADGE[score.band]} dot={false}>{BAND[score.band].label}</Badge>
    </span>
  );
}

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
      type: params.type, q: params.q, issues: params.issues, check: params.check, ai: params.ai, search: params.search,
      analytics: params.analytics, aeo: params.aeo, geo: params.geo, aeo_check: params.aeo_check, geo_check: params.geo_check,
      sort: params.sort, dir: params.dir, page: params.page, per_page: params.per_page,
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
  const aiQueue = params.ai === "pending";
  const noClicks = params.search === "no_clicks";
  const noViews = params.analytics === "no_views";
  const aeoBand = params.aeo === "poor" || params.aeo === "fair" ? params.aeo : undefined;
  const geoBand = params.geo === "poor" || params.geo === "fair" ? params.geo : undefined;
  const searchOn = meta.search.configured;
  const analyticsOn = meta.analytics.configured;
  const readinessCheck = params.aeo_check || params.geo_check;
  const filtered = Boolean(params.type || params.q || onlyIssues || params.check || aiQueue || noClicks || noViews || aeoBand || geoBand || readinessCheck);
  // What every heading link and the pager carry, so a sort survives a filter and a filter survives a sort.
  const carried = {
    type: params.type, q: params.q, issues: params.issues, check: params.check, ai: params.ai,
    search: params.search, analytics: params.analytics, aeo: aeoBand, geo: geoBand,
    aeo_check: params.aeo_check, geo_check: params.geo_check, per_page: params.per_page,
  };

  // A `check` filter is set by clicking a figure on the score card, so the
  // screen has to say what it is showing — otherwise the list simply gets
  // shorter and nothing on it explains why.
  const checkLabel = params.check
    ? meta.site_score.top_issues.find((i) => i.key === params.check)?.label
      ?? rows[0]?.score.failed.find((f) => f.key === params.check)?.label
    : params.aeo_check
    ? meta.site_score.aeo?.top_issues.find((i) => i.key === params.aeo_check)?.label
    : params.geo_check
    ? meta.site_score.geo?.top_issues.find((i) => i.key === params.geo_check)?.label
    : undefined;
  const checkScore = params.check ? "SEO" : params.aeo_check ? "AEO" : params.geo_check ? "GEO" : undefined;

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
          <label htmlFor="q" className="mb-0.5 block text-11 font-semibold text-faint">Search</label>
          <Input id="q" name="q" defaultValue={params.q} placeholder="Record name…" className="min-w-[200px] py-1.5 text-13" />
        </div>
        <div>
          <label htmlFor="type" className="mb-0.5 block text-11 font-semibold text-faint">Type</label>
          <Select id="type" name="type" defaultValue={params.type ?? ""}>
            <option value="">All types</option>
            {meta.types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor="issues" className="mb-0.5 block text-11 font-semibold text-faint">Show</label>
          <Select id="issues" name="issues" defaultValue={onlyIssues ? "1" : ""}>
            <option value="">Everything</option>
            <option value="1">Only records with issues</option>
          </Select>
        </div>
        {searchOn && (
          <div>
            <label htmlFor="search" className="mb-0.5 block text-11 font-semibold text-faint">Search Console</label>
            <Select id="search" name="search" defaultValue={noClicks ? "no_clicks" : ""}>
              <option value="">Any</option>
              <option value="no_clicks">Shown, never opened</option>
            </Select>
          </div>
        )}
        {analyticsOn && (
          <div>
            <label htmlFor="analytics" className="mb-0.5 block text-11 font-semibold text-faint">Analytics</label>
            <Select id="analytics" name="analytics" defaultValue={noViews ? "no_views" : ""}>
              <option value="">Any</option>
              <option value="no_views">{searchOn ? "Shown in search, no views" : "No views"}</option>
            </Select>
          </div>
        )}
        {/*
          Readiness (docs/aeo-geo-contract.md §5). "All" is the absence of the
          parameter; the API filters by band, so a page of results cannot
          hide the rows that happened to land on it.
        */}
        <div>
          <label htmlFor="aeo" className="mb-0.5 block text-11 font-semibold text-faint">AEO</label>
          <Select id="aeo" name="aeo" defaultValue={aeoBand ?? ""}>
            <option value="">All</option>
            <option value="poor">Poor</option>
            <option value="fair">Fair</option>
          </Select>
        </div>
        <div>
          <label htmlFor="geo" className="mb-0.5 block text-11 font-semibold text-faint">GEO</label>
          <Select id="geo" name="geo" defaultValue={geoBand ?? ""}>
            <option value="">All</option>
            <option value="poor">Poor</option>
            <option value="fair">Fair</option>
          </Select>
        </div>
        {meta.ai.enabled && (
          <div>
            <label htmlFor="ai" className="mb-0.5 block text-11 font-semibold text-faint">Assistant</label>
            <Select id="ai" name="ai" defaultValue={aiQueue ? "pending" : ""}>
              <option value="">Any</option>
              <option value="pending">With a suggestion waiting</option>
            </Select>
          </div>
        )}
        {/* Carried through the filter form, or applying a search would quietly
            drop the check the score card sent you here to look at. */}
        {params.check && <input type="hidden" name="check" value={params.check} />}
        {params.sort && <input type="hidden" name="sort" value={params.sort} />}
        {params.dir && <input type="hidden" name="dir" value={params.dir} />}
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {filtered && <ButtonLink href="/admin/seo" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </FilterBar>

      {checkLabel && (
        <p className="mb-3 text-13 text-muted">
          Showing the {meta.total} {meta.total === 1 ? "record" : "records"} where{" "}
          <strong className="font-semibold text-ink">{checkLabel.toLowerCase()}</strong> is the
          {checkScore === "SEO" ? " problem" : ` ${checkScore} problem`}.{" "}
          <Link href="/admin/seo" className="text-brand-ink underline">Show everything</Link>
        </p>
      )}

      {meta.search.error && (
        <Alert tone="warn" title="Search Console refused the last read" dismissible={false}>
          {meta.search.error} The figures below are the last ones it gave; test the account under Settings → API keys.
        </Alert>
      )}

      {meta.analytics.error && (
        <Alert tone="warn" title="Google Analytics refused the last read" dismissible={false}>
          {meta.analytics.error} The Analytics column is empty until it answers; test the property under Settings → API keys.
        </Alert>
      )}

      <BulkAi rows={rows} ai={meta.ai} filtered={filtered} />

      {rows.length === 0 ? (
        // "Nothing matched" and "nothing is wrong" are opposite pieces of news
        // and want opposite words. A search that finds nothing is a miss; a
        // check that finds nothing is the point of running it.
        <EmptyState
          icon={<IconSearchChart />}
          title={onlyIssues || params.check || readinessCheck || aiQueue || noClicks || noViews || aeoBand || geoBand ? "Nothing needs attention" : "No records match"}
        >
          {noViews
            ? searchOn
              ? `Every page search showed in the last ${meta.analytics.days} days was opened at least once.`
              : `Every page was opened at least once in the last ${meta.analytics.days} days.`
            : noClicks
            ? `No page was shown twenty or more times in the last ${meta.search.days} days without being opened.`
            : aiQueue
            ? "No AI suggestion is waiting to be read."
            : aeoBand || geoBand
            ? `No record's ${aeoBand ? "AEO" : "GEO"} readiness is ${aeoBand ?? geoBand}.`
            : params.check || readinessCheck
            ? "No record is failing that check."
            : onlyIssues
              ? "Every title and description is within the lengths search engines show."
              : "Try a different term, or clear the filters."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table
            className={cn(
              "admin-table w-full text-left text-13",
              // Two more columns than before (AEO, GEO), so each floor is 200px wider.
              searchOn && analyticsOn ? "min-w-[1500px]" : searchOn || analyticsOn ? "min-w-[1380px]" : "min-w-[1240px]",
            )}
          >
            <thead>
              <tr className="border-b border-line-strong text-10-5 font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Record</th>
                <th scope="col" className="px-3 py-1.5">Title &amp; description</th>
                <th scope="col" className="px-3 py-1.5">Score</th>
                {/*
                  Sortable, where the other headings are not: an editor
                  works this screen from the worst readiness upwards, and
                  "which pages answer nothing" is a question the SEO score
                  never asks. `SortTh` carries every filter, so sorting
                  keeps the band and the band keeps the sort.
                */}
                <SortTh sortKey="aeo" label="AEO" basePath="/admin/seo" params={carried} sort={params.sort} dir={params.dir} />
                <SortTh sortKey="geo" label="GEO" basePath="/admin/seo" params={carried} sort={params.sort} dir={params.dir} />
                {searchOn && <th scope="col" className="px-3 py-1.5">Search, {meta.search.days}d</th>}
                {analyticsOn && <th scope="col" className="px-3 py-1.5">Analytics, {meta.analytics.days}d</th>}
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
                        className="group inline-flex min-w-0 items-start gap-1 text-13-5 font-medium text-ink hover:underline"
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
                    <p className="mt-0.5 text-12 text-faint">
                      {r.type_label}
                      {r.ai_pending > 0 && (
                        <>
                          {" · "}
                          <Link href={`${r.admin_path}?tab=seo`} target="_blank" className="font-semibold text-brand-ink hover:underline">
                            {r.ai_pending === 1 ? "1 AI suggestion waiting" : `${r.ai_pending} AI suggestions waiting`}
                          </Link>
                        </>
                      )}
                    </p>
                  </td>

                  <td data-label="Title &amp; description" className="px-3 py-2">
                    <p className="max-w-[46ch] text-ink">{r.title ?? <em className="text-err">No title</em>}</p>
                    <p className="mt-0.5 max-w-[60ch] text-12-5 text-muted">
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

                  {/*
                    Readiness, `{value, band}` on a row. The failed checks
                    behind each are on the record's own AEO tab, which the
                    edit link beside the name opens.
                  */}
                  <td data-label="AEO" className="px-3 py-2">
                    <Readiness score={r.aeo} what="AEO" />
                  </td>
                  <td data-label="GEO" className="px-3 py-2">
                    <Readiness score={r.geo} what="GEO" />
                  </td>

                  {searchOn && (
                    /*
                      What the world did with the page: clicks over impressions,
                      the average position. A dash where Search Console has no
                      row — the page was not shown at all, which is its own
                      kind of news and different from a zero.
                    */
                    <td data-label="Search" className="px-3 py-2 tabular-nums">
                      {r.search ? (
                        <>
                          <p className="text-ink">
                            <span className="font-semibold">{r.search.clicks.toLocaleString("en-IN")}</span>
                            <span className="text-muted"> / {r.search.impressions.toLocaleString("en-IN")}</span>
                          </p>
                          <p className="mt-0.5 text-12 text-faint">
                            {Math.round(r.search.ctr * 1000) / 10}% CTR · position {r.search.position}
                          </p>
                        </>
                      ) : (
                        <span className="text-faint" title="Not shown in search in the window">—</span>
                      )}
                    </td>
                  )}

                  {analyticsOn && (
                    /*
                      What visitors did with the page: views over users. A
                      dash where Analytics has no row — nobody opened it in
                      the window, which beside a search figure is the whole
                      point of the column, and is not a zero.
                    */
                    <td data-label="Analytics" className="px-3 py-2 tabular-nums">
                      {r.analytics ? (
                        <>
                          <p className="text-ink">
                            <span className="font-semibold">{r.analytics.views.toLocaleString("en-IN")}</span>
                            <span className="text-muted"> views</span>
                          </p>
                          <p className="mt-0.5 text-12 text-faint">
                            {r.analytics.users.toLocaleString("en-IN")} {r.analytics.users === 1 ? "user" : "users"}
                          </p>
                        </>
                      ) : (
                        <span className="text-faint" title="Not opened in the window">—</span>
                      )}
                    </td>
                  )}

                  <td data-label="Source" className="px-3 py-2">
                    {r.has_override
                      ? (
                        <>
                          <Badge tone="resolved">Overridden</Badge>
                          <p className="mt-1 text-12 text-faint">{r.overridden.join(", ")}</p>
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
        params={{ ...carried, sort: params.sort, dir: params.dir }}
      />
    </>
  );
}
