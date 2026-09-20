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
import { buildMetadata, SITE } from "@/lib/seo";
import { Card } from "@/components/ui/card";
import { CopyLink } from "@/components/ui/copy-link";
import { noIndex } from "@/lib/no-index";
import type { StoreProductIndex } from "@/lib/admin";
import type { PublishStatus } from "@/types/api";

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
  const feedUrl = `${SITE.url.replace(/\/$/, "")}/google-shopping-feed.xml`;

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
        The Merchant Center feed, where somebody setting Google up will look
        for it (the client's ask, 2026-09-18). The address is shown absolute
        on the production origin — that is the string Merchant Center is
        given, and the console rule about paths is about links a person
        clicks from wherever the console is running — and the download beside
        it is a plain `<a download>` at a path, never a `Link`: a `next/link`
        at a route handler prefetches it, and this one builds the whole feed.
      */}
      <Card interactive={false} padding="sm" className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-13">
        <span className="font-medium text-ink">Google shopping feed</span>
        <code className="min-w-0 truncate font-mono text-12-5 text-muted" title={feedUrl}>{feedUrl}</code>
        <CopyLink url={feedUrl} className="grid size-7 place-items-center rounded-md border border-line text-muted hover:text-ink" />
        <a href="/google-shopping-feed.xml" download className="ml-auto text-12-5 font-medium text-brand-ink underline-offset-2 hover:underline">
          Download the XML
        </a>
        {/*
          The catalogue as a spreadsheet — every product and variation in
          the columns the import reads back, so "change forty prices" is
          export, edit, import. The same plain `<a download>` as the feed,
          for the same reason: this route handler builds the whole file.
        */}
        <a href="/api/admin/store/products/export" download className="text-12-5 font-medium text-brand-ink underline-offset-2 hover:underline">
          Export the catalogue (CSV)
        </a>
        <span className="basis-full text-12-5 text-muted">
          Paste the address into Merchant Center as a scheduled fetch; it is rebuilt on every request from what is published here.
          The CSV export is the file to edit and <Link href="/admin/store/products/import" className="underline">import</Link> back.
        </span>
      </Card>

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
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[820px] text-left text-13">
            <thead>
              <tr className="border-b border-line-strong text-10-5 font-semibold uppercase tracking-[.06em] text-faint">
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
      )}

      <Pagination
        meta={result.meta}
        basePath="/admin/store/products"
        params={{ q: params.q, status: params.status, type: params.type, out_of_stock: params.out_of_stock, notices: params.notices, per_page: params.per_page }}
      />
    </>
  );
}
