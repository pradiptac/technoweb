import Link from "next/link";
import { FilterBar } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select, Alert } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { iconMap, IconGlobe, type IconName } from "@/components/icons";
import { getServices } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminService, Paginated, PublishStatus } from "@/types/api";

export const metadata = buildMetadata({ title: "Web services", path: "/admin/services", seo: noIndex });

const statusTone = { published: "resolved", draft: "progress", archived: "closed" } as const;

function RowIcon({ name }: { name: string | null }) {
  const Icon = name && name in iconMap ? iconMap[name as IconName] : IconGlobe;
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded border border-brand-200 bg-brand-50 text-brand-600 [&_svg]:size-[15px]">
      <Icon />
    </span>
  );
}

type SearchParams = { status?: string; q?: string; page?: string; deleted?: string; per_page?: string;
};

export default async function AdminServicesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  let result: Paginated<AdminService> | null = null;
  try {
    result = await getServices({
      status: params.status as PublishStatus | undefined,
      q: params.q,
      page: Number(params.page) || 1,
      per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return (
      <ErrorState title="We could not load the services">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const services = result.data;
  const hasFilters = Boolean(params.status || params.q);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="admin-title">Web services</h1>
        <div className="ml-auto"><ButtonLink href="/admin/services/new" size="sm">New service</ButtonLink></div>
      </div>

      {params.deleted && <Alert tone="ok" title="Service deleted">It is no longer on the site.</Alert>}

      <FilterBar action="/admin/services">
        <div className="min-w-0">
          <label htmlFor="q" className="mb-0.5 block text-[11px] font-semibold text-faint">Search</label>
          <Input id="q" name="q" defaultValue={params.q} placeholder="Title or summary…" className="min-w-[200px] py-1.5 text-[13px]" />
        </div>
        <div className="min-w-0">
          <label htmlFor="status" className="mb-0.5 block text-[11px] font-semibold text-faint">Status</label>
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">All</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {hasFilters && <ButtonLink href="/admin/services" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </FilterBar>

      {services.length === 0 ? (
        <EmptyState icon={<IconGlobe />} title={hasFilters ? "No services match those filters" : "No services yet"}>
          {hasFilters
            ? "Try a different combination, or clear the filters."
            : "Domains, hosting, email and the rest of the web offering live here."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-white">
          <table className="admin-table w-full min-w-[680px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line-strong text-[10.5px] font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Service</th>
                <th scope="col" className="px-3 py-1.5">Status</th>
                <th scope="col" className="px-3 py-1.5">Order</th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-b-0 align-top">
                  <td data-label="Service" className="px-3 py-2">
                    <div className="flex items-start gap-2.5">
                      <RowIcon name={s.icon} />
                      <div className="min-w-0">
                        <Link href={`/admin/services/${s.id}`} className="block hover:underline">
                          <p className="max-w-[42ch] text-[13.5px] font-medium text-ink">{s.title}</p>
                        </Link>
                        <p className="mt-0.5 font-mono text-[12px] text-muted">/services/{s.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td data-label="Status" className="px-3 py-2"><Badge tone={statusTone[s.status]}>{s.status_label}</Badge></td>
                  <td data-label="Order" className="px-3 py-2 font-mono text-[12.5px] text-muted">{s.sort_order}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/services" params={{ status: params.status, q: params.q, per_page: params.per_page }} />
    </>
  );
}
