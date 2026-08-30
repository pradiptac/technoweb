import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { IconClose } from "@/components/icons";
import { getNewsletterSuppressions } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { Paginated, NewsletterSuppression } from "@/types/api";
import { SuppressionRow, AddSuppression } from "./suppression-controls";

export const metadata = buildMetadata({ title: "Unsubscribes", path: "/admin/newsletter/unsubscribes", seo: noIndex });

export default async function UnsubscribesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;

  let result: Paginated<NewsletterSuppression>;

  try {
    result = await getNewsletterSuppressions({ q: params.q, page: Number(params.page) || 1 });
  } catch {
    return <ErrorState title="We could not load this list">The admin API is not responding.</ErrorState>;
  }

  return (
    <>
      <PageHeader
        title="Unsubscribes"
        back={{ href: "/admin/newsletter", label: "Newsletter" }}
        lede={<>
          The do-not-mail list. Every campaign checks it, and so does every import — an address
          here cannot be added back by a spreadsheet, which is the point of keeping it
          separately from the subscriber records.
        </>}
      />

      <AddSuppression />

      <FilterBar action="/admin/newsletter/unsubscribes">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Email address…" />
        </FilterField>
        <div className="flex gap-2">
          <button type="submit" className="rounded border border-brand-600 bg-brand-600 px-3 text-[13px] font-semibold text-white hover:bg-brand-700">
            Search
          </button>
        </div>
      </FilterBar>

      {result.data.length === 0 ? (
        <EmptyState icon={<IconClose />} title="Nobody has unsubscribed">
          When somebody does, they appear here permanently — including if their subscriber
          record is later deleted.
        </EmptyState>
      ) : (
        <table className="admin-table w-full min-w-[620px] text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[12px] uppercase tracking-[.04em] text-muted">
              <th className="py-2 pr-3 font-semibold">Address</th>
              <th className="py-2 pr-3 font-semibold">Why</th>
              <th className="py-2 pr-3 font-semibold">When</th>
              <th className="py-2 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {result.data.map((row) => <SuppressionRow key={row.id} row={row} />)}
          </tbody>
        </table>
      )}

      <Pagination meta={result.meta} basePath="/admin/newsletter/unsubscribes" params={{ q: params.q }} />
    </>
  );
}
