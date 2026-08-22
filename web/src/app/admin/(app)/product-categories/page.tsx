import Link from "next/link";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Alert } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { iconMap, IconSwitch, type IconName } from "@/components/icons";
import { getProductCategoryList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminProductCategory, Paginated } from "@/types/api";

export const metadata = buildMetadata({
  title: "Product categories", path: "/admin/product-categories", seo: noIndex,
});

function RowIcon({ name }: { name: string | null | undefined }) {
  const Icon = name && name in iconMap ? iconMap[name as IconName] : IconSwitch;
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded border border-brand-200 bg-brand-50 text-brand-600 [&_svg]:size-[17px]">
      <Icon />
    </span>
  );
}

type SearchParams = { q?: string; page?: string; deleted?: string };

export default async function AdminProductCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  let result: Paginated<AdminProductCategory> | null = null;
  try {
    result = await getProductCategoryList({ q: params.q, page: Number(params.page) || 1 });
  } catch {
    return (
      <ErrorState title="We could not load the categories">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const categories = result.data;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h2 className="display-3">Product categories</h2>
        <div className="ml-auto">
          <ButtonLink href="/admin/product-categories/new" size="sm">New category</ButtonLink>
        </div>
      </div>

      {params.deleted && (
        <Alert tone="ok" title="Category deleted">
          Its products stayed in the catalogue, and any child categories moved up a level.
        </Alert>
      )}

      {/* No status filter: categories have no draft state. */}
      <form className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-line-strong bg-white p-4" action="/admin/product-categories">
        <div className="min-w-[150px]">
          <label htmlFor="q" className="mb-1.5 block text-[12px] font-semibold text-muted">Search</label>
          <Input id="q" name="q" defaultValue={params.q} placeholder="Category name…" className="min-w-[260px]" />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {params.q && <ButtonLink href="/admin/product-categories" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </form>

      {categories.length === 0 ? (
        <EmptyState icon={<IconSwitch />} title={params.q ? "No categories match that search" : "No categories yet"}>
          {params.q
            ? "Try a different term, or clear the search."
            : "How the catalogue is grouped. Each one gets its own /products/… listing page."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-white">
          <table className="w-full min-w-[720px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-line-strong text-[12px] font-semibold uppercase tracking-[.04em] text-muted">
                <th scope="col" className="px-4 py-3">Category</th>
                <th scope="col" className="px-4 py-3">Parent</th>
                <th scope="col" className="px-4 py-3">Products</th>
                <th scope="col" className="px-4 py-3">Order</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-b-0 align-top">
                  <td className="px-4 py-3.5">
                    <div className="flex items-start gap-3">
                      <RowIcon name={c.icon} />
                      <div className="min-w-0">
                        <Link href={`/admin/product-categories/${c.id}`} className="block hover:underline">
                          <span className="text-[14px] text-ink">{c.name}</span>
                        </Link>
                        <p className="mt-0.5 font-mono text-[12px] text-muted">/products/{c.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-muted">{c.parent_name ?? "—"}</td>
                  <td className="px-4 py-3.5 text-muted">{c.product_count ?? 0}</td>
                  <td className="px-4 py-3.5 font-mono text-[12.5px] text-muted">{c.sort_order ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/product-categories" params={{ q: params.q }} />
    </>
  );
}
