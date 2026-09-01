import Link from "next/link";
import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge, leadBandTone, leadStatusTone } from "@/components/ui/badge";
import { IconUsers } from "@/components/icons";
import { getLeads, leadQuery, type LeadIndex } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";

export const metadata = buildMetadata({ title: "Leads", path: "/admin/leads", seo: noIndex });

type SearchParams = {
  q?: string; status?: string; band?: string; channel?: string;
  assigned_to?: string; unassigned?: string; open?: string; overdue?: string;
  source_path?: string; sort?: string; page?: string; per_page?: string;
};

/** Relative where it is useful and absolute where it is not. */
function when(iso: string | null): string {
  if (!iso) return "—";

  const date = new Date(iso);
  const hours = (Date.now() - date.getTime()) / 36e5;

  if (hours < 1) return "Just now";
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  if (hours < 24 * 7) return `${Math.floor(hours / 24)}d ago`;

  return date.toLocaleDateString();
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  const query = {
    q: params.q,
    status: params.status,
    band: params.band,
    channel: params.channel,
    assigned_to: params.assigned_to,
    unassigned: params.unassigned === "1",
    open: params.open === "1",
    overdue: params.overdue === "1",
    source_path: params.source_path,
    sort: params.sort,
    page: Number(params.page) || 1,
    per_page: Number(params.per_page) || undefined,
  };

  let result: LeadIndex;

  try {
    result = await getLeads(query);
  } catch {
    return (
      <ErrorState title="We could not load the leads">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const leads = result.data;
  const filtered = Boolean(
    params.q || params.status || params.band || params.channel ||
    params.assigned_to || params.unassigned || params.open || params.overdue || params.source_path,
  );

  /*
    The export is a plain `<a download>`, never a `ButtonLink`.

    `next/link` prefetches, so merely loading this screen would build the whole
    CSV on the server, fetch it, cache it and throw it away — measured on the
    newsletter's subscriber export, which shipped as a link and did exactly
    that. A route handler is not a page.

    It carries the current filters so the file matches the rows on screen.
  */
  const exportHref = `/api/admin/leads/export?${leadQuery({ ...query, page: undefined, per_page: undefined })}`;

  return (
    <>
      <PageHeader
        title="Leads"
        lede={<>
          Every enquiry the site receives, from the contact form and from any form built in the
          console. The score is a rubric, not a judgement — open a lead to see exactly which checks
          produced it.
        </>}
      >
        <div className="ml-auto flex gap-2">
          <a
            href={exportHref}
            download
            className="inline-flex items-center rounded-md border border-line-strong bg-card px-3 py-1.5 text-[13px] font-semibold hover:bg-surface-2"
          >
            Export CSV
          </a>
        </div>
      </PageHeader>

      <FilterBar action="/admin/leads">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Name, email, company or message…" />
        </FilterField>

        <FilterField label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">Any status</option>
            {result.meta.statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </FilterField>

        <FilterField label="Score" htmlFor="band">
          <Select id="band" name="band" defaultValue={params.band ?? ""}>
            <option value="">Any score</option>
            {result.meta.bands.map((b) => <option key={b} value={b}>{b[0].toUpperCase() + b.slice(1)}</option>)}
          </Select>
        </FilterField>

        <FilterField label="Owner" htmlFor="assigned_to">
          <Select id="assigned_to" name="assigned_to" defaultValue={params.assigned_to ?? ""}>
            <option value="">Anyone</option>
            {result.meta.assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </FilterField>

        {/*
          Neither of these is a status. "Still to be answered" and "promised a
          reply that has passed" are the two jobs on a sales desk, and the
          status column shows neither.
        */}
        <FilterField label="Show" htmlFor="open">
          <Select id="open" name="open" defaultValue={params.open ?? ""}>
            <option value="">Everything</option>
            <option value="1">Still open</option>
          </Select>
        </FilterField>

        <FilterField label="Sort" htmlFor="sort">
          <Select id="sort" name="sort" defaultValue={params.sort ?? ""}>
            <option value="">Newest first</option>
            <option value="score">Highest score</option>
            <option value="follow_up">Follow-up date</option>
            <option value="oldest">Oldest first</option>
          </Select>
        </FilterField>

        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {filtered && <ButtonLink href="/admin/leads" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </FilterBar>

      {/*
        The two figures somebody acts on, counted over the whole table rather
        than the page. Each links to the same query that produced it, so the
        number and the rows behind it cannot disagree.
      */}
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted">
        {result.meta.new_count > 0 && !params.status && (
          <p>
            <Link href="/admin/leads?status=new" className="font-semibold text-brand-ink underline">
              {result.meta.new_count} not yet answered
            </Link>
          </p>
        )}
        {result.meta.overdue_count > 0 && !params.overdue && (
          <p>
            <Link href="/admin/leads?overdue=1" className="font-semibold text-err underline">
              {result.meta.overdue_count} past its follow-up date
            </Link>
          </p>
        )}
      </div>

      {leads.length === 0 ? (
        <EmptyState icon={<IconUsers />} title={filtered ? "Nothing matches those filters" : "No leads yet"}>
          {filtered
            ? "Try a different term, or clear the filters."
            : "Every enquiry sent through the contact form or any form you build appears here."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[900px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line-strong text-[10.5px] font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Contact</th>
                <th scope="col" className="px-3 py-1.5">Came from</th>
                <th scope="col" className="px-3 py-1.5">Score</th>
                <th scope="col" className="px-3 py-1.5">Status</th>
                <th scope="col" className="px-3 py-1.5">Owner</th>
                <th scope="col" className="px-3 py-1.5">Received</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b border-line last:border-b-0 align-top">
                  <td data-label="Contact" className="max-w-[30ch] px-3 py-2">
                    <Link href={`/admin/leads/${lead.id}`} className="font-medium hover:underline">
                      {lead.name || lead.email || `Lead ${lead.id}`}
                    </Link>
                    {lead.company && <span className="block truncate text-[12px] text-muted">{lead.company}</span>}
                    {lead.email && <span className="block truncate text-[12px] text-faint">{lead.email}</span>}
                  </td>

                  <td data-label="Came from" className="max-w-[30ch] px-3 py-2">
                    <span className="block truncate">{lead.form_name || "—"}</span>
                    {/*
                      The path rather than the title: a title is written for a
                      reader and two pages can share one, and this column is
                      being scanned for which page produces enquiries.
                    */}
                    {lead.source_path && (
                      <span className="block truncate font-mono text-[12px] text-faint">{lead.source_path}</span>
                    )}
                    {lead.utm_campaign && (
                      <span className="block truncate text-[12px] text-muted">via {lead.utm_campaign}</span>
                    )}
                  </td>

                  <td data-label="Score" className="px-3 py-2">
                    {lead.score_band === "unscored" ? (
                      <span className="text-faint">—</span>
                    ) : (
                      <Badge tone={leadBandTone[lead.score_band]}>{lead.score}</Badge>
                    )}
                  </td>

                  <td data-label="Status" className="px-3 py-2">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={leadStatusTone[lead.status] ?? "closed"}>{lead.status_label}</Badge>
                      {lead.is_overdue && <Badge tone="urgent">Overdue</Badge>}
                    </span>
                  </td>

                  <td data-label="Owner" className="max-w-[18ch] truncate px-3 py-2 text-muted">
                    {lead.assignee_name || "Unassigned"}
                  </td>

                  <td data-label="Received" className="px-3 py-2 whitespace-nowrap text-muted">
                    {when(lead.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        meta={result.meta}
        basePath="/admin/leads"
        params={{
          q: params.q, status: params.status, band: params.band,
          assigned_to: params.assigned_to, open: params.open, overdue: params.overdue,
          sort: params.sort, per_page: params.per_page,
        }}
      />

      {/*
        Which pages produce enquiries — the question the source capture exists
        to answer, and the one nothing here could answer before. Under the
        table rather than above it: it is a thing to notice on the way past,
        not the reason anybody opened this screen.
      */}
      {result.meta.top_pages.length > 0 && (
        <section className="mt-6 rounded-lg border border-line-strong bg-card p-4">
          <h2 className="mb-2 text-[13px] font-semibold">Where leads come from</h2>
          <ul className="flex flex-col gap-1 text-[13px]">
            {result.meta.top_pages.map((page) => (
              <li key={page.path} className="flex min-w-0 items-baseline justify-between gap-3">
                <Link
                  href={`/admin/leads?source_path=${encodeURIComponent(page.path)}`}
                  className="min-w-0 truncate font-mono text-[12.5px] text-brand-ink hover:underline"
                >
                  {page.path}
                </Link>
                <span className="shrink-0 tabular-nums text-muted">{page.total}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
