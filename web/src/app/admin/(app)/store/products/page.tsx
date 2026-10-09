import Link from "next/link";
import { BulkBar, RowTick, TickAll } from "@/components/admin/row-selection";
import { bulkStoreProductsAction } from "../actions";
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
import { StoreFeedsCard } from "@/components/admin/store-feeds-card";
import { getSiteSettings } from "@/lib/settings";
import { settingEnabled } from "@/lib/site-settings";
import { noIndex } from "@/lib/no-index";
import type { StoreProductIndex } from "@/lib/admin";
import type { PublishStatus } from "@/types/api";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "Store products", path: "/admin/store/products", seo: noIndex });

const statusTone = { draft: "closed", published: "resolved", archived: "closed" } as const;

type SearchParams = {
  q?: string; status?: PublishStatus; type?: string; out_of_stock?: string; notices?: string;
  page?: string; per_page?: string;
};

export default async function StoreProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireScreen();
  const params = await searchParams;

  let result: StoreProductIndex;

  try {
    result = await getStoreProductList({
      q: params.q,
      status: params.status,
      type: params.type,
      out_of_stock: params.out_of_stock === "1",
      notices: params.notices === "1",
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
  const filtered = Boolean(params.q || params.status || params.type || params.out_of_stock || params.notices);
  // Whether the Meta feed answers; the public settings, cached like the site's.
  const metaEnabled = await getSiteSettings()
    .then((settings) => settingEnabled(settings, "meta_catalogue_enabled", true))
    .catch(() => true);

  return (
    <>
      <PageHeader
        title="Store products"
        lede={<>
          What the shop sells, which is a different list from the catalogue on the site. Everything
          here has a price and can be bought — there is no “for sale” tick to forget.
        </>}
      >
        <div className="ml-auto flex flex-wrap gap-2">
          <ButtonLink href="/admin/store/categories" variant="secondary" size="sm">Categories</ButtonLink>
          <ButtonLink href="/admin/store/products/import" variant="secondary" size="sm">Import</ButtonLink>
          <ButtonLink href="/admin/store/products/new" size="sm">New product</ButtonLink>
        </div>
      </PageHeader>

      {/*
        The shopping feeds — Google's and, since 2026-09-26, Meta's XML and
        CSV — with the catalogue export beside them. `StoreFeedsCard` says
        why each link is a plain `<a download>`.
      */}
      <StoreFeedsCard metaEnabled={metaEnabled} />

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

        {/* Somebody is waiting: the shelf worth reordering first. The dashboard's tile links here. */}
        <FilterField label="Waiting" htmlFor="notices">
          <Select id="notices" name="notices" defaultValue={params.notices ?? ""}>
            <option value="">Any</option>
            <option value="1">Someone waiting</option>
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
        <>
          <BulkBar scope="store-products" ids={products.map((p) => p.id)} noun={{ one: "product", many: "products" }} action={bulkStoreProductsAction} />
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[820px] text-left text-13">
            <thead>
              <tr className="border-b border-line-strong text-10-5 font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="w-8 px-3 py-1.5"><TickAll scope="store-products" ids={products.map((p) => p.id)} noun="product" /></th>
                <th scope="col" className="px-3 py-1.5">Product</th>
                <th scope="col" className="px-3 py-1.5">Type</th>
                <th scope="col" className="px-3 py-1.5">Price</th>
                <th scope="col" className="px-3 py-1.5">Stock</th>
                <th scope="col" className="px-3 py-1.5">Waiting</th>
                <th scope="col" className="px-3 py-1.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-b-0 align-top">
                  <td data-label="Select" className="px-3 py-2"><RowTick scope="store-products" id={p.id} label={p.name} /></td>
                  <td data-label="Product" className="px-3 py-2">
                    <div className="flex items-start gap-2.5">
                      <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded border border-line-strong bg-surface">
                        {p.image_urls?.[0]
                          ? <Image src={p.image_urls[0]} alt="" width={40} height={40} className="size-full object-contain" unoptimized />
                          : <IconSwitch />}
                      </span>
                      <div className="min-w-0">
                        <Link href={`/admin/store/products/${p.id}`} className="block hover:underline">
                          <span className="text-13-5 font-medium text-ink">{p.name}</span>
                        </Link>
                        {p.sku && <p className="mt-0.5 font-mono text-12 text-muted">{p.sku}</p>}
                      </div>
                      {p.is_featured && <Badge tone="accent">Featured</Badge>}
                      {/*
                        Left out of the Google shopping feed for a reason
                        somebody can fix here. Google rejects SVG, and this
                        library is mostly SVG placeholder art, so without a
                        badge the disapproval shows up nowhere on our side.
                      */}
                      {p.feed_problem && (
                        <span title={p.feed_problem === "no_image"
                          ? "Not in the Google shopping feed: no image."
                          : "Not in the Google shopping feed: only SVG images, which Google rejects. Upload a JPEG or PNG."}>
                          <Badge tone="progress">Not in feed</Badge>
                        </span>
                      )}
                    </div>
                  </td>

                  <td data-label="Type" className="px-3 py-2 text-muted">{p.type_label ?? p.type}</td>

                  <td data-label="Price" className="px-3 py-2 tabular-nums">
                    {formatPaise(p.price_paise)}
                    {p.compare_at_paise && p.compare_at_paise > p.price_paise && (
                      <span className="ml-1.5 text-12 text-faint line-through">
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

                  {/*
                    People who asked to be emailed when this is back and have
                    not been. A dash rather than a zero, so the column reads
                    at a glance for the one row that matters.
                  */}
                  <td data-label="Waiting" className="px-3 py-2 tabular-nums">
                    {p.notices_waiting
                      ? <span title={`${p.notices_waiting} waiting to hear this is back`}>{p.notices_waiting}</span>
                      : <span className="text-faint">—</span>}
                  </td>

                  <td data-label="Status" className="px-3 py-2">
                    <Badge tone={statusTone[p.status]}>{p.status_label ?? p.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      <Pagination
        meta={result.meta}
        basePath="/admin/store/products"
        params={{ q: params.q, status: params.status, type: params.type, out_of_stock: params.out_of_stock, notices: params.notices, per_page: params.per_page }}
      />
    </>
  );
}
