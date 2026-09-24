import Link from "next/link";
import { PageHeader, FilterBar } from "@/components/admin/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { IconHeadset } from "@/components/icons";
import { getCannedReplies } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { formatDate } from "@/lib/dates";

export const metadata = buildMetadata({ title: "Saved replies", path: "/admin/tickets/saved-replies", seo: noIndex });

type SearchParams = { q?: string; page?: string; per_page?: string };

/** The first line or so of a reply, for the list. */
function preview(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 120 ? `${flat.slice(0, 117)}…` : flat;
}

export default async function SavedRepliesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  let result: Awaited<ReturnType<typeof getCannedReplies>>;
  try {
    result = await getCannedReplies({ q: params.q, page: Number(params.page) || 1, per_page: Number(params.per_page) || undefined });
  } catch {
    return (
      <ErrorState title="We could not load the saved replies">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const rows = result.data;
  const filtered = Boolean(params.q);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/tickets", label: "All tickets" }}
        title="Saved replies"
        lede={<>
          Wording the whole desk reuses. Each reply is offered on every ticket&rsquo;s
          reply form with the customer&rsquo;s name, the reference and your own
          name already filled in, and is pasted as text you can still edit.
        </>}
      >
        <div className="ml-auto"><ButtonLink href="/admin/tickets/saved-replies/new" size="sm">New saved reply</ButtonLink></div>
      </PageHeader>

      <FilterBar action="/admin/tickets/saved-replies">
        <div className="min-w-0">
          <label htmlFor="q" className="mb-0.5 block text-11 font-semibold text-faint">Search</label>
          <Input id="q" name="q" defaultValue={params.q} placeholder="Title or wording…" className="min-w-[210px] py-1.5 text-13" />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {filtered && <ButtonLink href="/admin/tickets/saved-replies" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState icon={<IconHeadset />} title={filtered ? "No saved replies match" : "No saved replies yet"}>
          {filtered
            ? "Try a different term, or clear the search."
            : "Save the answers the desk gives most often, and they will be offered on every ticket."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[720px] text-left text-13">
            <thead>
              <tr className="border-b border-line-strong text-10-5 font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Title</th>
                <th scope="col" className="px-3 py-1.5">Reply</th>
                <th scope="col" className="px-3 py-1.5">Order</th>
                <th scope="col" className="px-3 py-1.5">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-b-0 align-top">
                  <td data-label="Title" className="px-3 py-2">
                    <Link href={`/admin/tickets/saved-replies/${r.id}`} className="block font-semibold text-ink hover:underline">
                      {r.title}
                    </Link>
                    {r.created_by && <span className="mt-0.5 block text-12 text-faint">by {r.created_by.name}</span>}
                  </td>
                  <td data-label="Reply" className="px-3 py-2 text-muted">
                    <span className="block max-w-[52ch]">{preview(r.body)}</span>
                  </td>
                  <td data-label="Order" className="px-3 py-2 font-mono text-12-5 text-muted">{r.sort_order}</td>
                  <td data-label="Updated" className="px-3 py-2 text-muted">
                    {r.updated_at ? formatDate(r.updated_at, "numeric") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/tickets/saved-replies" params={{ q: params.q, per_page: params.per_page }} />
    </>
  );
}
