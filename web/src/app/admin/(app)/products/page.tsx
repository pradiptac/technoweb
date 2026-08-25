import Link from "next/link";
import { PageHeader, FilterBar } from "@/components/admin/page-header";
import Image from "next/image";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Alert, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { IconSwitch } from "@/components/icons";
import { getProductList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminProduct, Paginated, PublishStatus } from "@/types/api";

export const metadata = buildMetadata({ title: "Products", path: "/admin/products", seo: noIndex });

const statusTone = { draft: "closed", published: "resolved", archived: "closed" } as const;

type SearchParams = { q?: string; status?: PublishStatus; page?: string; deleted?: string; per_page?: string;
};

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  let result: Paginated<AdminProduct> | null = null;
  try {
    result = await getProductList({
      q: params.q, status: params.status, page: Number(params.page) || 1,
      per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return (
      <ErrorState title="We could not load the products">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const products = result.data;
  const filtered = Boolean(params.q || params.status);

  return (
    <>
      <PageHeader title="Products">
        <div className="ml-auto"><ButtonLink href="/admin/products/new" size="sm">New product</ButtonLink></div>
      </PageHeader>

      {params.deleted && (
        <Alert tone="ok" title="Product deleted">
          It is off the site now, and its slug is free for a replacement to reuse.
        </Alert>
      )}

      <FilterBar action="/admin/products">
        <div className="min-w-0">
          <label htmlFor="q" className="mb-0.5 block text-[11px] font-semibold text-faint">Search</label>
          <Input id="q" name="q" defaultValue={params.q} placeholder="Name, SKU or description…" className="min-w-[220px] py-1.5 text-[13px]" />
        </div>
        <div>
          <label htmlFor="status" className="mb-0.5 block text-[11px] font-semibold text-faint">Status</label>
          <Select
            id="status" name="status" defaultValue={params.status ?? ""}
          >
            <option value="">Any</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {filtered && <ButtonLink href="/admin/products" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </FilterBar>

      {products.length === 0 ? (
        <EmptyState icon={<IconSwitch />} title={filtered ? "No products match those filters" : "No products yet"}>
          {filtered
            ? "Try a different term, or clear the filters."
            : "The hardware catalogue. Each product gets its own page under /products."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[820px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line-strong text-[10.5px] font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Product</th>
                <th scope="col" className="px-3 py-1.5">Brand</th>
                <th scope="col" className="px-3 py-1.5">Category</th>
                <th scope="col" className="px-3 py-1.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-b-0 align-top">
                  <td data-label="Product" className="px-3 py-2">
                    <div className="flex items-start gap-2.5">
                      {/*
                        40px, not 28. The row is 58px tall around a 41px text
                        block, so this costs no height at all — and at 28px a
                        thumbnail carries no information: a real product photo
                        would be as unreadable there as the placeholder art is.
                      */}
                      <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded border border-line-strong bg-surface">
                        {p.image_urls?.[0]
                          ? <Image src={p.image_urls[0]} alt="" width={40} height={40} className="size-full object-contain" unoptimized />
                          : <IconSwitch />}
                      </span>
                      <div className="min-w-0">
                        <Link href={`/admin/products/${p.id}`} className="block hover:underline">
                          <span className="text-[13.5px] font-medium text-ink">{p.name}</span>
                        </Link>
                        {p.sku && <p className="mt-0.5 font-mono text-[12px] text-muted">{p.sku}</p>}
                      </div>
                      {p.is_featured && <Badge tone="open">Featured</Badge>}
                    </div>
                  </td>
                  <td data-label="Brand" className="px-3 py-2 text-muted">{p.brand_name ?? "—"}</td>
                  <td data-label="Category" className="px-3 py-2 text-muted">{p.category_name ?? "—"}</td>
                  <td data-label="Status" className="px-3 py-2">
                    <Badge tone={statusTone[p.status]}>{p.status_label ?? p.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/products" params={{ q: params.q, status: params.status, per_page: params.per_page }} />
    </>
  );
}
