import Link from "next/link";
import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { EmptyListAction } from "@/components/admin/empty-list-action";
import { Pagination } from "@/components/ui/pagination";
import { StatTile } from "@/components/admin/stat-tile";
import { BulkBar, RowTick, TickAll } from "@/components/admin/row-selection";
import { IconHeart } from "@/components/icons-ui";
import { getHealthList, type HealthList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { formatDate } from "@/lib/dates";
import { requireScreen } from "@/lib/admin-screen";
import { RowButtons } from "./row-buttons";
import { bulkHealthAction } from "./actions";
import { ROW_ACTION } from "../not-found/row-action";

export const metadata = buildMetadata({ title: "Site health", path: "/admin/health", seo: noIndex });

type SearchParams = { group?: string; severity?: string; type?: string; show?: string; page?: string; per_page?: string };

// Badge's tones are state names: urgent is the red, progress the amber, open the blue.
const TONE = { error: "urgent", warning: "progress", notice: "open" } as const;

/**
 * Site health (0.181.0, docs/health.md): what is wrong in what editors wrote,
 * each row opening the field that fixes it. Every role sees its own records;
 * the score and its trend are an administrator's.
 */
export default async function SiteHealthPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireScreen();
  const params = await searchParams;
  const ignored = params.show === "ignored";

  let result: HealthList;
  try {
    result = await getHealthList({
      group: params.group, severity: params.severity, type: params.type, ignored,
      page: Number(params.page) || 1, per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return <ErrorState title="We could not load site health">The admin API is not responding.</ErrorState>;
  }

  const { meta } = result;
  const filters = { group: params.group, severity: params.severity, type: params.type, show: params.show, per_page: params.per_page };
  const filtered = Boolean(params.group || params.severity || params.type || ignored);
  const ids = result.data.map((r) => r.id);
  const change = meta.score?.change ?? null;

  return (
    <>
      <PageHeader
        title="Site health"
        lede="Broken links, pages that have not been touched in a long time, and pictures or links a screen reader cannot use — on the records you look after. Fix opens the record on the right tab; the problem leaves this list within a minute of saving."
      />

      {meta.score && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Site health"
            value={meta.score.value === null ? "—" : `${meta.score.value}%`}
            note={change === null ? "Published records with nothing to fix" : `${change > 0 ? "+" : ""}${change} points in 30 days`}
            tone={meta.score.value === null ? "neutral" : "ok"}
            icon={IconHeart}
            spark={meta.score.series.length > 1 ? meta.score.series.map((s) => s.score ?? 0) : undefined}
          />
          {meta.groups.map((g) => {
            const c = meta.summary[g.value as keyof typeof meta.summary];
            return (
              <StatTile key={g.value} label={g.label} value={String(c.error + c.warning)}
                note={`${c.error} errors · ${c.warning} warnings`} tone={c.error > 0 ? "err" : c.warning > 0 ? "warn" : "ok"}
                icon={IconHeart} href={`/admin/health?group=${g.value}`} />
            );
          })}
        </div>
      )}

      <FilterBar action="/admin/health">
        <FilterField label="Kind of problem" htmlFor="group">
          <Select id="group" name="group" defaultValue={params.group ?? ""}>
            <option value="">All</option>
            {meta.groups.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Severity" htmlFor="severity">
          <Select id="severity" name="severity" defaultValue={params.severity ?? ""}>
            <option value="">All</option>
            {meta.severities.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Record" htmlFor="type">
          <Select id="type" name="type" defaultValue={params.type ?? ""}>
            <option value="">All</option>
            {meta.kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Show" htmlFor="show">
          <Select id="show" name="show" defaultValue={ignored ? "ignored" : ""}>
            <option value="">To fix</option>
            <option value="ignored">Ignored</option>
          </Select>
        </FilterField>
        <Button type="submit">Filter</Button>
      </FilterBar>

      {result.data.length === 0 ? (
        <EmptyState title={filtered ? "Nothing matches" : "Nothing to fix"}
          action={<EmptyListAction filtered={filtered} clearHref="/admin/health" noun="problem" />}>
          {ignored ? "Problems you ignore are listed here, in case you change your mind." : "Every record you look after passed every check."}
        </EmptyState>
      ) : (
        <>
          <BulkBar scope="health" ids={ids} noun={{ one: "problem", many: "problems" }}
            actions={[ignored ? "restore" : "ignore"]} action={bulkHealthAction} />
          <div className="mt-3 overflow-x-auto">
            <table className="admin-table w-full min-w-[860px] text-left text-13">
              <thead>
                <tr className="border-b border-line text-12 text-muted">
                  <th scope="col" className="w-8 px-3 py-1.5"><TickAll scope="health" ids={ids} noun="problem" /></th>
                  <th scope="col" className="px-3 py-1.5 font-semibold">Problem</th>
                  <th scope="col" className="px-3 py-1.5 font-semibold">Record</th>
                  <th scope="col" className="px-3 py-1.5 font-semibold">Where</th>
                  <th scope="col" className="px-3 py-1.5 font-semibold whitespace-nowrap">First seen</th>
                  <th scope="col" className="px-3 py-1.5 font-semibold">&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((row) => (
                  <tr key={row.id} className="border-b border-line align-top">
                    <td data-label="Select" className="px-3 py-2.5"><RowTick scope="health" id={row.id} label={row.sentence} /></td>
                    <td data-label="Problem" className="min-w-0 px-3 py-2.5">
                      <div className="min-w-0">
                        <Badge tone={TONE[row.severity]}>{meta.severities.find((s) => s.value === row.severity)?.label}</Badge>
                        <span className="mt-1 block max-w-[64ch] [overflow-wrap:anywhere]">{row.sentence}</span>
                      </div>
                    </td>
                    <td data-label="Record" className="min-w-0 px-3 py-2.5">
                      <div className="min-w-0">
                        <span className="block font-semibold [overflow-wrap:anywhere]">{row.subject.title ?? "A record that has gone"}</span>
                        <span className="text-12 text-muted">{row.subject.type_label}</span>
                      </div>
                    </td>
                    <td data-label="Where" className="px-3 py-2.5 text-muted">{row.field_label}</td>
                    <td data-label="First seen" className="px-3 py-2.5 whitespace-nowrap text-muted">{formatDate(row.first_seen_at, "short")}</td>
                    <td data-label="" className="px-3 py-2.5">
                      <div className="flex flex-wrap items-start gap-2 xl:flex-nowrap">
                        {row.admin_path && <Link href={row.admin_path} className={ROW_ACTION}>Fix</Link>}
                        <RowButtons id={row.id} type={row.subject.type} subjectId={row.subject.id} ignored={row.ignored_at !== null} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Pagination meta={result.meta} basePath="/admin/health" params={filters} />

      <p className="mt-6 text-12 text-muted">
        {meta.last_sweep_at
          ? <>Everything was last checked {formatDate(meta.last_sweep_at, "dateTimeShort")}. </>
          : <>Nothing has been checked overnight yet — see <Link className="text-brand-ink underline" href="/admin/system/status#scheduler">System → Status</Link>. </>}
        {meta.links_due !== undefined && meta.links_due > 0 && <>{meta.links_due.toLocaleString("en-IN")} links are waiting to be checked.</>}
      </p>
    </>
  );
}
