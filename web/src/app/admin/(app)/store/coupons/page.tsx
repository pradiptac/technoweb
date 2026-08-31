import Link from "next/link";
import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { IconTag } from "@/components/icons";
import { getCoupons } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminCoupon } from "@/lib/admin";
import type { Paginated } from "@/types/api";

export const metadata = buildMetadata({ title: "Discount codes", path: "/admin/store/coupons", seo: noIndex });

export default async function CouponsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; per_page?: string }>;
}) {
  const params = await searchParams;

  let result: Paginated<AdminCoupon>;

  try {
    result = await getCoupons({ q: params.q, page: Number(params.page) || 1 });
  } catch {
    return (
      <ErrorState title="We could not load the codes">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const coupons = result.data;

  return (
    <>
      <PageHeader
        title="Discount codes"
        back={{ href: "/admin/store/orders", label: "Orders" }}
        lede={<>
          A percentage or an amount off, with the ordinary guards. The discount is worked out on
          the server every time a basket is read, so a code that expires stops applying at once.
        </>}
      >
        <div className="ml-auto">
          <ButtonLink href="/admin/store/coupons/new" size="sm">New code</ButtonLink>
        </div>
      </PageHeader>

      <FilterBar action="/admin/store/coupons">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Code…" className="font-mono text-[13px]" />
        </FilterField>

        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {params.q && <ButtonLink href="/admin/store/coupons" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </FilterBar>

      {coupons.length === 0 ? (
        <EmptyState icon={<IconTag />} title={params.q ? "Nothing matches that" : "No discount codes yet"}>
          {params.q
            ? "Try a different term."
            : "A code takes a percentage or an amount off the basket. Nothing else — no bundles, no tiers."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[720px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line-strong text-[10.5px] font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Code</th>
                <th scope="col" className="px-3 py-1.5">Discount</th>
                <th scope="col" className="px-3 py-1.5">Used</th>
                <th scope="col" className="px-3 py-1.5">Ends</th>
                <th scope="col" className="px-3 py-1.5">Active</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((coupon) => (
                <tr key={coupon.id} className="border-b border-line last:border-b-0">
                  <td data-label="Code" className="px-3 py-2">
                    <Link href={`/admin/store/coupons/${coupon.id}`} className="font-mono text-[13px] font-medium hover:underline">
                      {coupon.code}
                    </Link>
                    {coupon.description && (
                      <p className="mt-0.5 text-[12px] text-faint">{coupon.description}</p>
                    )}
                  </td>

                  <td data-label="Discount" className="px-3 py-2">{coupon.label}</td>

                  {/*
                    The count and what it cost. A usage count alone cannot
                    answer "what has this promotion cost us" — ten uses of a
                    percentage code on ten baskets are ten different amounts.
                  */}
                  <td data-label="Used" className="px-3 py-2 tabular-nums text-muted">
                    {coupon.usages_count ?? 0}
                    {coupon.usage_limit ? ` / ${coupon.usage_limit}` : ""}
                    {coupon.total_given && coupon.usages_count ? (
                      <span className="block text-[12px] text-faint">{coupon.total_given}</span>
                    ) : null}
                  </td>

                  <td data-label="Ends" className="px-3 py-2 text-muted">
                    {coupon.ends_at ? new Date(coupon.ends_at).toLocaleDateString() : "—"}
                  </td>

                  <td data-label="Active" className="px-3 py-2">
                    {coupon.is_active
                      ? <Badge tone="resolved">Yes</Badge>
                      : <Badge tone="closed">Off</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/store/coupons" params={{ q: params.q }} />
    </>
  );
}
