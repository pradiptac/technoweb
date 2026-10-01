import Link from "next/link";
import { PageHeader, FilterBar } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select, Alert } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { iconMap, IconLayers, type IconName } from "@/components/icons";
import { getServiceCategoryList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminServiceCategory, Paginated } from "@/types/api";
import { IconTile } from "@/components/ui/icon-tile";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({
  title: "Service categories", path: "/admin/service-categories", seo: noIndex,
});

function RowIcon({ name }: { name: string | null | undefined }) {
  const Icon = name && name in iconMap ? iconMap[name as IconName] : IconLayers;
  return (
    <IconTile size="sm"><Icon /></IconTile>
  );
}

type SearchParams = { q?: string; active?: string; page?: string; deleted?: string; per_page?: string };

export default async function AdminServiceCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireScreen();
  const params = await searchParams;

  let result: Paginated<AdminServiceCategory> | null = null;
  try {
    result = await getServiceCategoryList({
      q: params.q, active: params.active,
      page: Number(params.page) || 1, per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return (
      <ErrorState title="We could not load the service categories">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const categories = result.data;
  const hasFilters = Boolean(params.q || params.active);

  return (
    <>
      <PageHeader title="Service categories">
        <div className="ml-auto">
          <ButtonLink href="/admin/service-categories/new" size="sm">New category</ButtonLink>
        </div>
      </PageHeader>

      {params.deleted && (
        <Alert tone="ok" title="Category deleted">
          Its services stayed on the site, under &ldquo;Other services&rdquo;.
        </Alert>
      )}

      <FilterBar action="/admin/service-categories">
        <div className="min-w-0">
          <label htmlFor="q" className="mb-0.5 block text-11 font-semibold text-faint">Search</label>
          <Input id="q" name="q" defaultValue={params.q} placeholder="Category name…" className="min-w-[220px] py-1.5 text-13" />
        </div>
        <div className="min-w-0">
          <label htmlFor="active" className="mb-0.5 block text-11 font-semibold text-faint">Shown</label>
          <Select id="active" name="active" defaultValue={params.active ?? ""}>
            <option value="">All</option>
            <option value="1">Active</option>
            <option value="0">Hidden</option>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {hasFilters && <ButtonLink href="/admin/service-categories" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </FilterBar>

      {categories.length === 0 ? (
        <EmptyState icon={<IconLayers />} title={hasFilters ? "No categories match that search" : "No service categories yet"}>
          {hasFilters
            ? "Try a different term, or clear the filters."
            : "Each category is a tab on the homepage's services section and on /services."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[680px] text-left text-13">
            <thead>
              <tr className="border-b border-line-strong text-10-5 font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Category</th>
                <th scope="col" className="px-3 py-1.5">Services</th>
                <th scope="col" className="px-3 py-1.5">Cards</th>
                <th scope="col" className="px-3 py-1.5">Order</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-b-0 align-top">
                  <td data-label="Category" className="px-3 py-2">
                    <div className="flex items-start gap-2.5">
                      <RowIcon name={c.icon} />
                      <div className="min-w-0">
                        <Link href={`/admin/service-categories/${c.id}`} className="block hover:underline">
                          <span className="text-13-5 font-medium text-ink">{c.name}</span>
                        </Link>
                        <p className="mt-0.5 font-mono text-12 text-muted">/services#{c.slug}</p>
                      </div>
                      {!c.is_active && <Badge tone="closed">Hidden</Badge>}
                    </div>
                  </td>
                  <td data-label="Services" className="px-3 py-2 text-muted">
                    <Link href={`/admin/services?category=${c.id}`} className="hover:underline">{c.services_count ?? 0}</Link>
                  </td>
                  <td data-label="Cards" className="px-3 py-2 text-muted">{c.image_background ? "Picture background" : "Standard"}</td>
                  <td data-label="Order" className="px-3 py-2 font-mono text-12-5 text-muted">{c.sort_order ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/service-categories" params={{ q: params.q, active: params.active, per_page: params.per_page }} />
    </>
  );
}
