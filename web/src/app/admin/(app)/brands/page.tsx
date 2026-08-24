import Link from "next/link";
import { FilterBar } from "@/components/admin/page-header";
import Image from "next/image";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Alert } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { IconShop } from "@/components/icons";
import { getBrandList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminBrand, Paginated } from "@/types/api";

export const metadata = buildMetadata({ title: "Brands", path: "/admin/brands", seo: noIndex });

type SearchParams = { q?: string; page?: string; deleted?: string; per_page?: string;
};

export default async function AdminBrandsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  let result: Paginated<AdminBrand> | null = null;
  try {
    result = await getBrandList({ q: params.q, page: Number(params.page) || 1,
      per_page: Number(params.per_page) || undefined });
  } catch {
    return (
      <ErrorState title="We could not load the brands">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const brands = result.data;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="admin-title">Brands</h1>
        <div className="ml-auto"><ButtonLink href="/admin/brands/new" size="sm">New brand</ButtonLink></div>
      </div>

      {params.deleted && (
        <Alert tone="ok" title="Brand deleted">
          Its products stayed in the catalogue — they are simply unbranded now.
        </Alert>
      )}

      {/* No status filter: brands have no draft state. */}
      <FilterBar action="/admin/brands">
        <div className="min-w-0">
          <label htmlFor="q" className="mb-0.5 block text-[11px] font-semibold text-faint">Search</label>
          <Input id="q" name="q" defaultValue={params.q} placeholder="Brand name…" className="min-w-[220px] py-1.5 text-[13px]" />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {params.q && <ButtonLink href="/admin/brands" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </FilterBar>

      {brands.length === 0 ? (
        <EmptyState icon={<IconShop />} title={params.q ? "No brands match that search" : "No brands yet"}>
          {params.q
            ? "Try a different term, or clear the search."
            : "Manufacturers you supply. They become filter options on the product listing."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-white">
          <table className="admin-table w-full min-w-[680px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line-strong text-[10.5px] font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Brand</th>
                <th scope="col" className="px-3 py-1.5">Products</th>
                <th scope="col" className="px-3 py-1.5">Order</th>
              </tr>
            </thead>
            <tbody>
              {brands.map((b) => (
                <tr key={b.id} className="border-b border-line last:border-b-0 align-top">
                  <td data-label="Brand" className="px-3 py-2">
                    <div className="flex items-start gap-2.5">
                      {/*
                        40px, not 28. The row is 58px tall around a 41px text
                        block, so this costs no height at all — and at 28px a
                        thumbnail carries no information: a real product photo
                        would be as unreadable there as the placeholder art is.
                      */}
                      <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded border border-line-strong bg-surface">
                        {b.logo
                          ? <Image src={b.logo} alt="" width={40} height={40} className="size-full object-contain" unoptimized />
                          : <IconShop />}
                      </span>
                      <div className="min-w-0">
                        <Link href={`/admin/brands/${b.id}`} className="block hover:underline">
                          <span className="text-[13.5px] font-medium text-ink">{b.name}</span>
                        </Link>
                        <p className="mt-0.5 font-mono text-[12px] text-muted">?brand={b.slug}</p>
                      </div>
                      {b.is_featured && <Badge tone="open">Featured</Badge>}
                    </div>
                  </td>
                  <td data-label="Products" className="px-3 py-2 text-muted">{b.product_count ?? 0}</td>
                  <td data-label="Order" className="px-3 py-2 font-mono text-[12.5px] text-muted">{b.sort_order ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/brands" params={{ q: params.q, per_page: params.per_page }} />
    </>
  );
}
