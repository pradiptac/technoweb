import Link from "next/link";
import { PageHeader, FilterBar } from "@/components/admin/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { IconBook } from "@/components/icons";
import { getJobApplications } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminJobApplication, Paginated } from "@/types/api";
import { ApplicationStatusBadge } from "./status-badge";

export const metadata = buildMetadata({ title: "Applications", path: "/admin/applications", seo: noIndex });

type SearchParams = {
  status?: string; job?: string; q?: string; page?: string; per_page?: string; done?: string;
};

const STATUSES = [
  ["new", "New"], ["shortlisted", "Shortlisted"], ["interviewing", "Interviewing"],
  ["offered", "Offered"], ["hired", "Hired"], ["rejected", "Not proceeding"],
];

const stamp = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  let result: Paginated<AdminJobApplication> & { meta: { new_count: number; retention_days: number } };
  try {
    result = await getJobApplications({
      status: params.status,
      job: Number(params.job) || undefined,
      q: params.q,
      page: Number(params.page) || 1,
      per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return (
      <ErrorState title="We could not load the applications">
        This screen needs a support engineer role or better. If that is your
        account, the admin API is not responding — try again shortly.
      </ErrorState>
    );
  }

  const rows = result.data;
  const filtered = Boolean(params.q || params.status || params.job);

  return (
    <>
      <PageHeader
        title="Applications"
        lede={<>
          Everyone who has applied. CVs are stored privately and can only be read
          from here.{" "}
          {/*
            Stated on the screen, so an empty stretch reads as policy rather
            than as a gap in the record.
          */}
          Applications and their CVs are deleted after{" "}
          <strong>{result.meta.retention_days} days</strong>.
        </>}
      >
        {result.meta.new_count > 0 && (
          <div className="ml-auto">
            <ButtonLink href="/admin/applications?status=new" size="sm">
              {result.meta.new_count} unread
            </ButtonLink>
          </div>
        )}
      </PageHeader>

      <FilterBar action="/admin/applications">
        <div className="min-w-0">
          <label htmlFor="q" className="mb-0.5 block text-[11px] font-semibold text-faint">Search</label>
          <Input id="q" name="q" defaultValue={params.q} placeholder="Name, email, employer or role…" className="min-w-[210px] py-1.5 text-[13px]" />
        </div>
        <div>
          <label htmlFor="status" className="mb-0.5 block text-[11px] font-semibold text-faint">Status</label>
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">Any status</option>
            {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </div>
        {/* Preserved so "12 applications" on a vacancy stays filtered when the
            status filter is used on top of it. */}
        {params.job && <input type="hidden" name="job" value={params.job} />}
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {filtered && <ButtonLink href="/admin/applications" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState icon={<IconBook />} title={filtered ? "Nothing matches those filters" : "No applications yet"}>
          {filtered
            ? "Try a different term, or clear the filters."
            : "They appear here as soon as somebody applies through the careers page."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[840px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line-strong text-[10.5px] font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Candidate</th>
                <th scope="col" className="px-3 py-1.5">Role</th>
                <th scope="col" className="px-3 py-1.5">Experience</th>
                <th scope="col" className="px-3 py-1.5">Status</th>
                <th scope="col" className="px-3 py-1.5">Applied</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-line last:border-b-0 align-top">
                  <td data-label="Candidate" className="px-3 py-2">
                    <Link href={`/admin/applications/${a.id}`} className="block hover:underline">
                      <span className="text-[13.5px] font-medium text-ink">{a.name}</span>
                    </Link>
                    <p className="mt-0.5 text-[12.5px] text-muted">{a.email}</p>
                  </td>
                  <td data-label="Role" className="px-3 py-2">
                    <span className="text-ink">{a.job.title}</span>
                    {/* The vacancy may be gone; the title was copied at the
                        time, which is why the row still reads. */}
                    {!a.job.exists && <p className="mt-0.5 text-[12px] text-faint">vacancy removed</p>}
                  </td>
                  <td data-label="Experience" className="px-3 py-2 text-muted">
                    {a.experience_years !== null ? `${a.experience_years} yrs` : "—"}
                    {a.current_company && (
                      <p className="mt-0.5 text-[12px] text-faint">{a.current_company}</p>
                    )}
                  </td>
                  <td data-label="Status" className="px-3 py-2">
                    <ApplicationStatusBadge status={a.status} label={a.status_label} />
                  </td>
                  <td data-label="Applied" className="px-3 py-2 text-[12.5px] text-muted">
                    {stamp(a.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        meta={result.meta}
        basePath="/admin/applications"
        params={{ q: params.q, status: params.status, job: params.job, per_page: params.per_page }}
      />
    </>
  );
}
