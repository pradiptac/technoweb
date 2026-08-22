import Link from "next/link";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Alert } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { IconLifebuoy } from "@/components/icons";
import { getFaqList, getFaqOwners } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminFaq, FaqOwnerGroup, Paginated } from "@/types/api";

export const metadata = buildMetadata({ title: "FAQs", path: "/admin/faqs", seo: noIndex });

type SearchParams = { q?: string; owner_type?: string; page?: string; deleted?: string };

export default async function AdminFaqsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  let result: Paginated<AdminFaq>;
  let owners: FaqOwnerGroup[] = [];
  try {
    [result, owners] = await Promise.all([
      getFaqList({ q: params.q, owner_type: params.owner_type, page: Number(params.page) || 1 }),
      getFaqOwners(),
    ]);
  } catch {
    return (
      <ErrorState title="We could not load the FAQs">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const faqs = result.data;
  const filtered = Boolean(params.q || params.owner_type);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="admin-title">FAQs</h1>
        <div className="ml-auto"><ButtonLink href="/admin/faqs/new" size="sm">New FAQ</ButtonLink></div>
      </div>

      <p className="mb-6 max-w-[70ch] text-[14px] text-muted">
        Every question on the site, wherever it lives. The same ones can be
        edited inline on the record they belong to — this view is for finding a
        duplicate or a stale answer without opening each screen in turn.
      </p>

      {params.deleted && <Alert tone="ok" title="FAQ deleted">It is off that page now.</Alert>}

      <form className="mb-3 flex flex-wrap items-end gap-x-2 gap-y-2 border-b border-line pb-3" action="/admin/faqs">
        <div className="min-w-0">
          <label htmlFor="q" className="mb-0.5 block text-[11px] font-semibold text-faint">Search</label>
          <Input id="q" name="q" defaultValue={params.q} placeholder="Question or answer…" className="min-w-[210px] py-1.5 text-[13px]" />
        </div>
        <div>
          <label htmlFor="owner_type" className="mb-0.5 block text-[11px] font-semibold text-faint">Appears on</label>
          <select
            id="owner_type" name="owner_type" defaultValue={params.owner_type ?? ""}
            className="rounded border border-line-strong bg-white px-2.5 py-1.5 text-[13px]"
          >
            <option value="">Anywhere</option>
            {owners.map((g) => <option key={g.type} value={g.type}>{g.label}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {filtered && <ButtonLink href="/admin/faqs" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </form>

      {faqs.length === 0 ? (
        <EmptyState icon={<IconLifebuoy />} title={filtered ? "No FAQs match those filters" : "No FAQs yet"}>
          {filtered
            ? "Try a different term, or clear the filters."
            : "Questions shown on solution, service, product and page detail screens."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-white">
          <table className="admin-table w-full min-w-[700px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line-strong text-[10.5px] font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Question</th>
                <th scope="col" className="px-3 py-1.5">Appears on</th>
                <th scope="col" className="px-3 py-1.5">Order</th>
              </tr>
            </thead>
            <tbody>
              {faqs.map((f) => (
                <tr key={f.id} className="border-b border-line last:border-b-0 align-top">
                  <td data-label="Question" className="px-3 py-2">
                    <Link href={`/admin/faqs/${f.id}`} className="block hover:underline">
                      <span className="text-[13.5px] font-medium text-ink">{f.question}</span>
                    </Link>
                  </td>
                  <td data-label="Appears on" className="px-3 py-2 text-muted">
                    {f.owner_missing
                      ? <Badge tone="urgent">Owner deleted</Badge>
                      : <>{f.owner_name}{" "}
                          <span className="text-faint">({f.owner_type})</span></>}
                  </td>
                  <td data-label="Order" className="px-3 py-2 font-mono text-[12.5px] text-muted">{f.sort_order}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/faqs" params={{ q: params.q, owner_type: params.owner_type }} />
    </>
  );
}
