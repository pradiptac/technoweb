import Link from "next/link";
import Image from "next/image";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Alert } from "@/components/ui/input";
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

type SearchParams = { q?: string; status?: PublishStatus; page?: string; deleted?: string };

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
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h2 className="display-3">Products</h2>
        <div className="ml-auto"><ButtonLink href="/admin/products/new" size="sm">New product</ButtonLink></div>
      </div>

      {params.deleted && (
        <Alert tone="ok" title="Product deleted">
          It is off the site now, and its slug is free for a replacement to reuse.
        </Alert>
      )}

      <form className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-line-strong bg-white p-4" action="/admin/products">
        <div className="min-w-[150px]">
          <label htmlFor="q" className="mb-1.5 block text-[12px] font-semibold text-muted">Search</label>
          <Input id="q" name="q" defaultValue={params.q} placeholder="Name, SKU or description…" className="min-w-[260px]" />
        </div>
        <div>
          <label htmlFor="status" className="mb-1.5 block text-[12px] font-semibold text-muted">Status</label>
          <select
            id="status" name="status" defaultValue={params.status ?? ""}
            className="rounded border border-line-strong bg-white px-3 py-2.5 text-[14px]"
          >
            <option value="">Any</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {filtered && <ButtonLink href="/admin/products" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </form>

      {products.length === 0 ? (
        <EmptyState icon={<IconSwitch />} title={filtered ? "No products match those filters" : "No products yet"}>
          {filtered
            ? "Try a different term, or clear the filters."
            : "The hardware catalogue. Each product gets its own page under /products."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-white">
          <table className="w-full min-w-[820px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-line-strong text-[12px] font-semibold uppercase tracking-[.04em] text-muted">
                <th scope="col" className="px-4 py-3">Product</th>
                <th scope="col" className="px-4 py-3">Brand</th>
                <th scope="col" className="px-4 py-3">Category</th>
                <th scope="col" className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-b-0 align-top">
                  <td className="px-4 py-3.5">
                    <div className="flex items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded border border-line-strong bg-surface">
                        {p.image_urls?.[0]
                          ? <Image src={p.image_urls[0]} alt="" width={36} height={36} className="size-full object-contain" unoptimized />
                          : <IconSwitch />}
                      </span>
                      <div className="min-w-0">
                        <Link href={`/admin/products/${p.id}`} className="block hover:underline">
                          <span className="text-[14px] text-ink">{p.name}</span>
                        </Link>
                        {p.sku && <p className="mt-0.5 font-mono text-[12px] text-muted">{p.sku}</p>}
                      </div>
                      {p.is_featured && <Badge tone="open">Featured</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-muted">{p.brand_name ?? "—"}</td>
                  <td className="px-4 py-3.5 text-muted">{p.category_name ?? "—"}</td>
                  <td className="px-4 py-3.5">
                    <Badge tone={statusTone[p.status]}>{p.status_label ?? p.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/products" params={{ q: params.q, status: params.status }} />
    </>
  );
}
