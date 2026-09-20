import Link from "next/link";
import Image from "next/image";

import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { IconUsers } from "@/components/icons";
import { getTeamMemberList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";

export const metadata = buildMetadata({ title: "Team", path: "/admin/team-members", seo: noIndex });

export default async function AdminTeamMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; department?: string; page?: string; per_page?: string }>;
}) {
  const params = await searchParams;

  let result;
  try {
    result = await getTeamMemberList({
      q: params.q,
      status: params.status,
      department: params.department,
      page: Number(params.page) || 1,
      per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return (
      <ErrorState title="We could not load the team">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        title="Team"
        lede={<>
          The people the site introduces, with their certifications. Published members appear on
          <code> /team</code> grouped by department, and the first eight on the About page. This
          is not the staff list — who may sign in to the console is under System.
        </>}
      >
        <div className="ml-auto"><ButtonLink href="/admin/team-members/new" size="sm">Add team member</ButtonLink></div>
      </PageHeader>

      <FilterBar action="/admin/team-members">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Name or designation…" />
        </FilterField>
        <FilterField label="Department" htmlFor="department">
          <Select id="department" name="department" defaultValue={params.department ?? ""}>
            <option value="">Any</option>
            {result.meta.departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">Any</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </Select>
        </FilterField>
        <ButtonLink href="/admin/team-members" variant="ghost" size="sm">Clear</ButtonLink>
      </FilterBar>

      {result.data.length === 0 ? (
        <EmptyState icon={<IconUsers />} title="Nobody listed yet">
          Add a team member with a photo, a designation and the certifications they hold.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[720px] text-13-5">
            <thead>
              <tr className="border-b border-line-strong text-left text-11-5 uppercase tracking-[.06em] text-faint">
                <th className="py-2.5 font-semibold">Name</th>
                <th className="py-2.5 font-semibold">Department</th>
                <th className="py-2.5 font-semibold">Certifications</th>
                <th className="py-2.5 font-semibold">Order</th>
                <th className="py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((m) => (
                <tr key={m.id} className="border-b border-line last:border-b-0">
                  <td data-label="Name" className="py-2.5">
                    <span className="flex items-center gap-3">
                      <span className="relative block size-10 shrink-0 overflow-hidden rounded-full border border-line bg-surface-2">
                        {m.photo && <Image src={m.photo} alt="" fill unoptimized className="object-cover" />}
                      </span>
                      <span>
                        <Link href={`/admin/team-members/${m.id}`} className="font-semibold text-brand-ink hover:underline">
                          {m.name}
                        </Link>
                        {m.designation && <span className="block text-12-5 text-muted">{m.designation}</span>}
                      </span>
                    </span>
                  </td>
                  <td data-label="Department" className="py-2.5 text-muted">{m.department ?? "—"}</td>
                  <td data-label="Certifications" className="py-2.5 text-muted">{m.certification_count ?? 0}</td>
                  <td data-label="Order" className="py-2.5">{m.sort_order}</td>
                  <td data-label="Status" className="py-2.5">
                    <Badge tone={m.status === "published" ? "resolved" : "progress"}>{m.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        meta={result.meta}
        basePath="/admin/team-members"
        params={{ q: params.q, status: params.status, department: params.department, per_page: params.per_page }}
      />
    </>
  );
}
