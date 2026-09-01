import Link from "next/link";
import { PageHeader, FilterBar } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select, Alert } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { iconMap, IconNetwork, type IconName } from "@/components/icons";
import { getSolutions, type SolutionQueryParams } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminSolution, Paginated, PublishStatus } from "@/types/api";
import type { ReactNode } from "react";
import { IconTile } from "@/components/ui/icon-tile";

export const metadata = buildMetadata({ title: "Solutions", path: "/admin/solutions", seo: noIndex });

const STATUS_OPTIONS: { value: PublishStatus; label: string }[] = [
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
];

const statusTone = { published: "resolved", draft: "progress", archived: "closed" } as const;

function FilterField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="mb-0.5 block text-[11px] font-semibold text-faint">{label}</label>
      {children}
    </div>
  );
}

/** The stored icon is a name; only names in iconMap render on the site. */
function RowIcon({ name }: { name: string | null }) {
  const Icon = name && name in iconMap ? iconMap[name as IconName] : IconNetwork;
  return (
    <IconTile size="sm"><Icon /></IconTile>
  );
}

type SearchParams = { status?: string; q?: string; page?: string; deleted?: string; per_page?: string;
};

export default async function AdminSolutionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const queryParams: SolutionQueryParams = {
    status: params.status as PublishStatus | undefined,
    q: params.q,
    page: Number(params.page) || 1,
      per_page: Number(params.per_page) || undefined,
  };

  let result: Paginated<AdminSolution> | null = null;
  try {
    result = await getSolutions(queryParams);
  } catch {
    return (
      <ErrorState title="We could not load the solutions">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const solutions = result.data;
  const hasFilters = Boolean(params.status || params.q);
  const paginationParams: Record<string, string | undefined> = {
    status: params.status, q: params.q, per_page: params.per_page,
  };

  return (
    <>
      <PageHeader title="Solutions">
        <div className="ml-auto">
          <ButtonLink href="/admin/solutions/new" size="sm">New solution</ButtonLink>
        </div>
      </PageHeader>

      {params.deleted && <Alert tone="ok" title="Solution deleted">It is no longer on the site.</Alert>}

      <FilterBar action="/admin/solutions">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Title or summary…" className="min-w-[200px] py-1.5 text-[13px]" />
        </FilterField>
        <FilterField label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">All</option>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </FilterField>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {hasFilters && <ButtonLink href="/admin/solutions" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </FilterBar>

      {solutions.length === 0 ? (
        <EmptyState
          icon={<IconNetwork />}
          title={hasFilters ? "No solutions match those filters" : "No solutions yet"}
          action={hasFilters ? undefined : <ButtonLink href="/admin/solutions/new" size="sm">Add the first one</ButtonLink>}
        >
          {hasFilters
            ? "Try a different combination, or clear the filters."
            : "Solutions are the practice areas the site leads with."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[720px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line-strong text-[10.5px] font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Solution</th>
                <th scope="col" className="px-3 py-1.5">Status</th>
                <th scope="col" className="px-3 py-1.5">Benefits</th>
                <th scope="col" className="px-3 py-1.5">Order</th>
              </tr>
            </thead>
            <tbody>
              {solutions.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-b-0 align-top">
                  <td data-label="Solution" className="px-3 py-2">
                    <div className="flex items-start gap-2.5">
                      <RowIcon name={s.icon} />
                      <div className="min-w-0">
                        <Link href={`/admin/solutions/${s.id}`} className="block hover:underline">
                          <p className="max-w-[42ch] text-[13.5px] font-medium text-ink">{s.title}</p>
                        </Link>
                        <p className="mt-0.5 font-mono text-[12px] text-muted">/solutions/{s.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td data-label="Status" className="px-3 py-2"><Badge tone={statusTone[s.status]}>{s.status_label}</Badge></td>
                  <td data-label="Benefits" className="px-3 py-2 text-muted">
                    {s.benefits.length || "—"}
                    {s.technologies.length > 0 && (
                      <span className="ml-2 text-[12px] text-faint">{s.technologies.length} tech</span>
                    )}
                  </td>
                  <td data-label="Order" className="px-3 py-2 font-mono text-[12.5px] text-muted">{s.sort_order}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/solutions" params={paginationParams} />
    </>
  );
}
