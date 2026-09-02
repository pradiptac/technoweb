import Link from "next/link";
import Image from "next/image";
import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { IconSwitch } from "@/components/icons";
import { getStoreProductList } from "@/lib/admin";
import { formatPaise } from "@/lib/money";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { StoreProductIndex } from "@/lib/admin";
import type { PublishStatus } from "@/types/api";

export const metadata = buildMetadata({ title: "Store products", path: "/admin/store/products", seo: noIndex });

const statusTone = { draft: "closed", published: "resolved", archived: "closed" } as const;

type SearchParams = {
  q?: string; status?: PublishStatus; type?: string; out_of_stock?: string;
  page?: string; per_page?: string;
};

export default async function StoreProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  let result: StoreProductIndex;

  try {
    result = await getStoreProductList({
      q: params.q,
      status: params.status,
      type: params.type,
      out_of_stock: params.out_of_stock === "1",
      page: Number(params.page) || 1,
      per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return (
      <ErrorState title="We could not load the store">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const products = result.data;
  const filtered = Boolean(params.q || params.status || params.type || params.out_of_stock);

  return (
    <>
      <PageHeader
        title="Store products"
        lede={<>
          What the shop sells, which is a different list from the catalogue on the site. Everything
          here has a price and can be bought — there is no “for sale” tick to forget.
        </>}
      >
        <div className="ml-auto flex gap-2">
          <ButtonLink href="/admin/store/categories" variant="secondary" size="sm">Categories</ButtonLink>
          <ButtonLink href="/admin/store/products/new" size="sm">New product</ButtonLink>
        </div>
      </PageHeader>

      <FilterBar action="/admin/store/products">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Name or SKU…" />
        </FilterField>

        <FilterField label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">Any status</option>
            {result.meta.statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </FilterField>

        <FilterField label="Type" htmlFor="type">
          <Select id="type" name="type" defaultValue={params.type ?? ""}>
            <option value="">Any type</option>
            {result.meta.types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </FilterField>

        {/*
          "What has run out" is the question this screen is opened with more
          than any other, and it cannot be asked of the shop — which publishes
          no counts at all.
        */}
        <FilterField label="Stock" htmlFor="out_of_stock">
          <Select id="out_of_stock" name="out_of_stock" defaultValue={params.out_of_stock ?? ""}>
            <option value="">Any</option>
            <option value="1">Out of stock</option>
          </Select>
        </FilterField>

        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {filtered && <ButtonLink href="/admin/store/products" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </FilterBar>

      {products.length === 0 ? (
        <EmptyState icon={<IconSwitch />} title={filtered ? "Nothing matches those filters" : "The shop is empty"}>
          {filtered
            ? "Try a different term, or clear the filters."
            : "Add what you sell. Each product gets its own page under /store/products."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[820px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line-strong text-[10.5px] font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Product</th>
                <th scope="col" className="px-3 py-1.5">Type</th>
                <th scope="col" className="px-3 py-1.5">Price</th>
                <th scope="col" className="px-3 py-1.5">Stock</th>
                <th scope="col" className="px-3 py-1.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-b-0 align-top">
                  <td data-label="Product" className="px-3 py-2">
                    <div className="flex items-start gap-2.5">
                      <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded border border-line-strong bg-surface">
                        {p.image_urls?.[0]
                          ? <Image src={p.image_urls[0]} alt="" width={40} height={40} className="size-full object-contain" unoptimized />
                          : <IconSwitch />}
                      </span>
                      <div className="min-w-0">
                        <Link href={`/admin/store/products/${p.id}`} className="block hover:underline">
                          <span className="text-[13.5px] font-medium text-ink">{p.name}</span>
                        </Link>
                        {p.sku && <p className="mt-0.5 font-mono text-[12px] text-muted">{p.sku}</p>}
                      </div>
                      {p.is_featured && <Badge tone="open">Featured</Badge>}
                    </div>
                  </td>

                  <td data-label="Type" className="px-3 py-2 text-muted">{p.type_label ?? p.type}</td>

                  <td data-label="Price" className="px-3 py-2 tabular-nums">
                    {formatPaise(p.price_paise)}
                    {p.compare_at_paise && p.compare_at_paise > p.price_paise && (
                      <span className="ml-1.5 text-[12px] text-faint line-through">
                        {formatPaise(p.compare_at_paise)}
                      </span>
                    )}
                  </td>

                  {/*
                    The figure and the verdict, because they answer different
                    questions: "how many" is what you reorder against, and "can
                    anybody buy it" is what the shop is actually doing right now.
                    A product with variations is counted per variation, so its
                    own number would be a misleading zero.
                  */}
                  <td data-label="Stock" className="px-3 py-2">
                    {!p.track_stock
                      ? <span className="text-muted">Not counted</span>
                      : p.variations?.length
                        ? <span className="text-muted">Per variation</span>
                        : <span className="tabular-nums">{p.stock_on_hand ?? p.stock}</span>}
                    {!p.in_stock && <Badge tone="urgent" className="ml-1.5">Out of stock</Badge>}
                  </td>

                  <td data-label="Status" className="px-3 py-2">
                    <Badge tone={statusTone[p.status]}>{p.status_label ?? p.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        meta={result.meta}
        basePath="/admin/store/products"
        params={{ q: params.q, status: params.status, type: params.type, per_page: params.per_page }}
      />
    </>
  );
}
