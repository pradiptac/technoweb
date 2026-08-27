import Link from "next/link";
import { PageHeader, FilterBar } from "@/components/admin/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { IconTeam } from "@/components/icons";
import { getJobOpenings } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminJobOpening, Paginated } from "@/types/api";

export const metadata = buildMetadata({ title: "Vacancies", path: "/admin/jobs", seo: noIndex });

type SearchParams = { status?: string; q?: string; page?: string; per_page?: string; done?: string };

export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  let result: Paginated<AdminJobOpening>;
  try {
    result = await getJobOpenings({
      status: params.status,
      q: params.q,
      page: Number(params.page) || 1,
      per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return (
      <ErrorState title="We could not load the vacancies">
        This screen needs a content manager role or better. If that is your
        account, the admin API is not responding — try again shortly.
      </ErrorState>
    );
  }

  const jobs = result.data;
  const filtered = Boolean(params.q || params.status);

  return (
    <>
      <PageHeader
        title="Vacancies"
        lede={<>
          What the careers page is advertising. A role stops accepting
          applications on its closing date whether or not anybody archives it.
        </>}
      >
        {/*
          `flex-wrap`, because the two labels together are 343px and the
          narrowest phone the audit checks is 320. Buttons carry
          `whitespace-nowrap`, so the row has to be what gives.
        */}
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          <ButtonLink href="/admin/jobs/reference" variant="secondary" size="sm">
            Qualifications
          </ButtonLink>
          <ButtonLink href="/admin/jobs/new" size="sm">New vacancy</ButtonLink>
        </div>
      </PageHeader>

      <FilterBar action="/admin/jobs">
        <div className="min-w-0">
          <label htmlFor="q" className="mb-0.5 block text-[11px] font-semibold text-faint">Search</label>
          <Input id="q" name="q" defaultValue={params.q} placeholder="Title, team or location…" className="min-w-[210px] py-1.5 text-[13px]" />
        </div>
        <div>
          <label htmlFor="status" className="mb-0.5 block text-[11px] font-semibold text-faint">Status</label>
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">Any status</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {filtered && <ButtonLink href="/admin/jobs" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </FilterBar>

      {jobs.length === 0 ? (
        <EmptyState icon={<IconTeam />} title={filtered ? "No vacancies match those filters" : "No vacancies yet"}>
          {filtered
            ? "Try a different term, or clear the filters."
            : "Post one and it appears on /careers as soon as it is published."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[820px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line-strong text-[10.5px] font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Role</th>
                <th scope="col" className="px-3 py-1.5">Team</th>
                <th scope="col" className="px-3 py-1.5">Status</th>
                <th scope="col" className="px-3 py-1.5">Applications</th>
                <th scope="col" className="px-3 py-1.5">Closes</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b border-line last:border-b-0 align-top">
                  <td data-label="Role" className="px-3 py-2">
                    <Link href={`/admin/jobs/${job.id}`} className="block hover:underline">
                      <span className="text-[13.5px] font-medium text-ink">{job.title}</span>
                    </Link>
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      {job.location ?? "No location"} · {job.employment_type_label}
                    </p>
                  </td>
                  <td data-label="Team" className="px-3 py-2 text-muted">{job.department ?? "—"}</td>
                  <td data-label="Status" className="px-3 py-2">
                    <span className="flex flex-wrap gap-1.5">
                      <Badge tone={job.status === "published" ? "resolved" : "closed"}>
                        {job.status}
                      </Badge>
                      {/*
                        Published and not showing is the state worth flagging:
                        it means the closing date has passed, and nothing else
                        on this row would say so.
                      */}
                      {job.status === "published" && !job.is_open && (
                        <Badge tone="urgent">Closed to applicants</Badge>
                      )}
                    </span>
                  </td>
                  <td data-label="Applications" className="px-3 py-2">
                    {job.application_count ? (
                      <Link
                        href={`/admin/applications?job=${job.id}`}
                        className="font-semibold text-brand-ink hover:underline"
                      >
                        {job.application_count}
                      </Link>
                    ) : (
                      <span className="text-faint">0</span>
                    )}
                  </td>
                  <td data-label="Closes" className="px-3 py-2 text-[12.5px] text-muted">
                    {job.closes_at
                      ? new Date(job.closes_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                      : "Open-ended"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        meta={result.meta}
        basePath="/admin/jobs"
        params={{ q: params.q, status: params.status, per_page: params.per_page }}
      />
    </>
  );
}
