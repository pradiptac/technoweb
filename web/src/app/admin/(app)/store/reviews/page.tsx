import Link from "next/link";
import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { SortTh } from "@/components/admin/sort-th";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Stars } from "@/components/store/stars";
import { ApiError } from "@/lib/api";
import { getAdminReviews } from "@/lib/admin/reviews";
import { formatTableDate } from "@/lib/dates";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { ReviewBulkBar, ReviewTick, ReviewTickAll } from "./bulk";
import { ReviewRowActions } from "./row-actions";
import type { AdminReviewList, ReviewStatus } from "@/types/api";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "Reviews", path: "/admin/store/reviews", seo: noIndex });

const TONE: Record<ReviewStatus, "progress" | "resolved" | "closed" | "urgent"> = {
  pending: "progress",
  published: "resolved",
  rejected: "closed",
  spam: "urgent",
};

type SearchParams = {
  status?: string; rating?: string; verified?: string; q?: string; product?: string;
  sort?: string; dir?: string; page?: string; per_page?: string;
};

/**
 * Store → Reviews: the queue every product review waits in.
 *
 * Opens on what is waiting — the screen exists to be emptied — and every
 * decision is one press, on a row or on a selection. Nothing is published
 * without somebody here saying so (the client's decision, 2026-09-26),
 * including a verified buyer's; an edited review comes back here too.
 */
export default async function AdminStoreReviewsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireScreen();
  const params = await searchParams;

  let result: AdminReviewList;

  try {
    result = await getAdminReviews({
      status: params.status, rating: params.rating, verified: params.verified, q: params.q, product: params.product,
      sort: params.sort, dir: params.dir,
      page: Number(params.page) || 1,
      per_page: Number(params.per_page) || undefined,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return <ErrorState title="Store managers only">Reviews are moderated by store manager and administrator accounts.</ErrorState>;
    }
    return <ErrorState title="We could not load the reviews">The admin API is not responding. Try again shortly.</ErrorState>;
  }

  const reviews = result.data;
  const filtered = Boolean(params.status || params.rating || params.verified || params.q || params.product);
  const listParams: Record<string, string | undefined> = {
    status: params.status, rating: params.rating, verified: params.verified, q: params.q, product: params.product,
    per_page: params.per_page, sort: params.sort, dir: params.dir,
  };
  const ids = reviews.map((r) => r.id);

  return (
    <>
      <PageHeader
        title="Reviews"
        lede={<>
          Every review of a shop product waits here until somebody publishes it — a verified
          buyer&apos;s included, and an edited one comes back. Reject what is not a review;
          spam what is spam. Featured reviews sort first on the product page.
        </>}
      >
        {result.meta.pending_count > 0 && (
          <span className="ml-auto"><Badge tone="progress">{result.meta.pending_count} waiting</Badge></span>
        )}
      </PageHeader>

      <FilterBar action="/admin/store/reviews">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Words, name, address or product…" />
        </FilterField>
        <FilterField label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            {/* The blank option is "Waiting", not everything: this screen exists to be emptied. */}
            <option value="">Waiting</option>
            {result.meta.statuses.filter((s) => s.value !== "pending").map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
            <option value="all">Everything</option>
          </Select>
        </FilterField>
        <FilterField label="Stars" htmlFor="rating">
          <Select id="rating" name="rating" defaultValue={params.rating ?? ""}>
            <option value="">Any</option>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n === 1 ? "" : "s"}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Buyer" htmlFor="verified">
          <Select id="verified" name="verified" defaultValue={params.verified ?? ""}>
            <option value="">Anyone</option>
            <option value="1">Verified</option>
            <option value="0">Not verified</option>
          </Select>
        </FilterField>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {filtered && <ButtonLink href="/admin/store/reviews" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </FilterBar>

      {reviews.length === 0 ? (
        <EmptyState title={filtered ? "Nothing matches that" : "Nothing is waiting"}>
          {filtered
            ? "No review matches that filter."
            : "Every review has been dealt with. New ones arrive here and stay off the shop until you publish them."}
        </EmptyState>
      ) : (
        <>
          <ReviewBulkBar ids={ids} />
          <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
            <table className="admin-table w-full min-w-[900px] text-left text-13">
              <thead>
                <tr className="border-b border-line-strong text-10-5 font-semibold uppercase tracking-[.06em] text-faint">
                  <th scope="col" className="w-8 px-3 py-1.5"><ReviewTickAll ids={ids} /></th>
                  <th scope="col" className="px-3 py-1.5">Review</th>
                  <SortTh sortKey="rating" label="Stars" basePath="/admin/store/reviews" params={listParams} sort={params.sort} dir={params.dir} />
                  <th scope="col" className="px-3 py-1.5">Status</th>
                  <SortTh sortKey="created" label="Written" basePath="/admin/store/reviews" params={listParams} sort={params.sort} dir={params.dir} className="md:max-xl:hidden" />
                  <th scope="col" className="px-3 py-1.5">Decide</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((r) => (
                  <tr key={r.id} className="border-b border-line align-top last:border-b-0">
                    <td data-label="Select" className="px-3 py-2.5"><ReviewTick id={r.id} label={r.display_name} /></td>
                    <td data-label="Review" className="min-w-0 px-3 py-2.5">
                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        {r.product ? (
                          <Link href={`/store/products/${r.product.slug}`} className="font-medium text-ink hover:underline" target="_blank">
                            {r.product.name}
                          </Link>
                        ) : (
                          <span className="text-muted">A deleted product</span>
                        )}
                        {r.verified && <Badge tone="resolved">Verified</Badge>}
                        {r.is_featured && <Badge tone="accent" dot={false}>Featured</Badge>}
                      </div>
                      {r.title && <p className="mt-1 text-13-5 font-semibold">{r.title}</p>}
                      {/* Plain text by construction, rendered as a string — nothing typed becomes markup. */}
                      <p className="mt-1 max-w-[70ch] whitespace-pre-line text-13 leading-[1.55] text-ink-2 [overflow-wrap:anywhere]">{r.body}</p>
                      <p className="mt-1.5 text-12 text-muted [overflow-wrap:anywhere]">
                        <span className="font-medium text-ink-2">{r.display_name}</span>
                        {r.customer && <> · {r.customer.name} · <span className="font-mono text-11-5">{r.customer.email}</span></>}
                        {r.variant_label && <> · {r.variant_label}</>}
                      </p>
                    </td>
                    <td data-label="Stars" className="px-3 py-2.5 whitespace-nowrap">
                      <Stars value={r.rating} size="size-3.5" />
                    </td>
                    <td data-label="Status" className="px-3 py-2.5">
                      <Badge tone={TONE[r.status]}>{r.status_label}</Badge>
                      {r.moderated_by && r.status !== "pending" && (
                        <p className="mt-1 text-11-5 text-faint">by {r.moderated_by}</p>
                      )}
                    </td>
                    <td data-label="Written" className="px-3 py-2.5 whitespace-nowrap text-muted md:max-xl:hidden">{formatTableDate(r.created_at)}</td>
                    <td data-label="Decide" className="px-3 py-2.5">
                      <ReviewRowActions key={`${r.status}:${r.is_featured ? 1 : 0}`} review={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Pagination meta={result.meta} basePath="/admin/store/reviews" params={listParams} />
    </>
  );
}
