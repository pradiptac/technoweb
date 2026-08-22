import Link from "next/link";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Alert } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { IconUsers } from "@/components/icons";
import { getStaffList, getStaffRoles } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminStaff, Paginated, RoleOption } from "@/types/api";

export const metadata = buildMetadata({ title: "Staff", path: "/admin/users", seo: noIndex });

type SearchParams = { q?: string; role?: string; page?: string; deleted?: string };

export default async function AdminStaffPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  let result: Paginated<AdminStaff>;
  let roles: RoleOption[] = [];
  try {
    [result, roles] = await Promise.all([
      getStaffList({ q: params.q, role: params.role, page: Number(params.page) || 1 }),
      getStaffRoles(),
    ]);
  } catch {
    return (
      <ErrorState title="We could not load the staff list">
        This screen is administrator-only. If that is your account, the admin
        API is not responding — try again shortly.
      </ErrorState>
    );
  }

  const staff = result.data;
  const filtered = Boolean(params.q || params.role);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="admin-title">Staff</h1>
        <div className="ml-auto"><ButtonLink href="/admin/users/new" size="sm">New account</ButtonLink></div>
      </div>

      <p className="mb-6 max-w-[70ch] text-[14px] text-muted">
        Who can sign in to this console, and what each of them can reach. An
        administrator passes every role check implicitly.
      </p>

      {params.deleted && <Alert tone="ok" title="Account deleted">Their tickets stayed, and are now unassigned.</Alert>}

      <form className="mb-3 flex flex-wrap items-end gap-x-2 gap-y-2 border-b border-line pb-3" action="/admin/users">
        <div className="min-w-0">
          <label htmlFor="q" className="mb-0.5 block text-[11px] font-semibold text-faint">Search</label>
          <Input id="q" name="q" defaultValue={params.q} placeholder="Name or email…" className="min-w-[210px] py-1.5 text-[13px]" />
        </div>
        <div>
          <label htmlFor="role" className="mb-0.5 block text-[11px] font-semibold text-faint">Role</label>
          <select
            id="role" name="role" defaultValue={params.role ?? ""}
            className="rounded border border-line-strong bg-white px-2.5 py-1.5 text-[13px]"
          >
            <option value="">Any role</option>
            {roles.map((r) => <option key={r.slug} value={r.slug}>{r.label}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {filtered && <ButtonLink href="/admin/users" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </form>

      {staff.length === 0 ? (
        <EmptyState icon={<IconUsers />} title={filtered ? "No accounts match those filters" : "No staff accounts"}>
          {filtered ? "Try a different term, or clear the filters." : "Add the first one to let somebody else in."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-white">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line-strong text-[10.5px] font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Name</th>
                <th scope="col" className="px-3 py-1.5">Roles</th>
                <th scope="col" className="px-3 py-1.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-b-0 align-top">
                  <td className="px-3 py-2">
                    <Link href={`/admin/users/${u.id}`} className="block hover:underline">
                      <span className="text-[13.5px] font-medium text-ink">{u.name}</span>
                    </Link>
                    <p className="mt-0.5 text-[12.5px] text-muted">{u.email}</p>
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap gap-1.5">
                      {(u.roles ?? []).map((r) => (
                        <Badge key={r.slug} tone={r.slug === "admin" ? "urgent" : "closed"}>{r.label}</Badge>
                      ))}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={u.is_active ? "resolved" : "closed"}>{u.is_active ? "Active" : "Inactive"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/users" params={{ q: params.q, role: params.role }} />
    </>
  );
}
