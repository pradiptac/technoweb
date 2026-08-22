import Link from "next/link";
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

type SearchParams = { q?: string; page?: string; deleted?: string };

export default async function AdminBrandsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  let result: Paginated<AdminBrand> | null = null;
  try {
    result = await getBrandList({ q: params.q, page: Number(params.page) || 1 });
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
        <h2 className="display-3">Brands</h2>
        <div className="ml-auto"><ButtonLink href="/admin/brands/new" size="sm">New brand</ButtonLink></div>
      </div>

      {params.deleted && (
        <Alert tone="ok" title="Brand deleted">
          Its products stayed in the catalogue — they are simply unbranded now.
        </Alert>
      )}

      {/* No status filter: brands have no draft state. */}
      <form className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-line-strong bg-white p-4" action="/admin/brands">
        <div className="min-w-[150px]">
          <label htmlFor="q" className="mb-1.5 block text-[12px] font-semibold text-muted">Search</label>
          <Input id="q" name="q" defaultValue={params.q} placeholder="Brand name…" className="min-w-[260px]" />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {params.q && <ButtonLink href="/admin/brands" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </form>

      {brands.length === 0 ? (
        <EmptyState icon={<IconShop />} title={params.q ? "No brands match that search" : "No brands yet"}>
          {params.q
            ? "Try a different term, or clear the search."
            : "Manufacturers you supply. They become filter options on the product listing."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-white">
          <table className="w-full min-w-[680px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-line-strong text-[12px] font-semibold uppercase tracking-[.04em] text-muted">
                <th scope="col" className="px-4 py-3">Brand</th>
                <th scope="col" className="px-4 py-3">Products</th>
                <th scope="col" className="px-4 py-3">Order</th>
              </tr>
            </thead>
            <tbody>
              {brands.map((b) => (
                <tr key={b.id} className="border-b border-line last:border-b-0 align-top">
                  <td className="px-4 py-3.5">
                    <div className="flex items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded border border-line-strong bg-surface">
                        {b.logo
                          ? <Image src={b.logo} alt="" width={36} height={36} className="size-full object-contain" unoptimized />
                          : <IconShop />}
                      </span>
                      <div className="min-w-0">
                        <Link href={`/admin/brands/${b.id}`} className="block hover:underline">
                          <span className="text-[14px] text-ink">{b.name}</span>
                        </Link>
                        <p className="mt-0.5 font-mono text-[12px] text-muted">?brand={b.slug}</p>
                      </div>
                      {b.is_featured && <Badge tone="open">Featured</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-muted">{b.product_count ?? 0}</td>
                  <td className="px-4 py-3.5 font-mono text-[12.5px] text-muted">{b.sort_order ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/brands" params={{ q: params.q }} />
    </>
  );
}
