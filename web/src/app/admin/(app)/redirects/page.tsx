import Link from "next/link";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Alert } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { IconArrows } from "@/components/icons";
import { getRedirectList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminRedirect, Paginated } from "@/types/api";

export const metadata = buildMetadata({ title: "Redirects", path: "/admin/redirects", seo: noIndex });

type SearchParams = { q?: string; source?: string; page?: string; deleted?: string };

export default async function AdminRedirectsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  let result: Paginated<AdminRedirect>;
  try {
    result = await getRedirectList({ q: params.q, source: params.source, page: Number(params.page) || 1 });
  } catch {
    return (
      <ErrorState title="We could not load the redirects">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const rows = result.data;
  const filtered = Boolean(params.q || params.source);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="admin-title">Redirects</h1>
        <div className="ml-auto"><ButtonLink href="/admin/redirects/new" size="sm">New redirect</ButtonLink></div>
      </div>

      <p className="mb-6 max-w-[70ch] text-[14px] text-muted">
        Most of these are written for you: changing a slug leaves one behind so
        the old URL keeps working and keeps its ranking. Add your own for a
        vanity URL, or for a page that moved before this site existed.
      </p>

      {params.deleted && (
        <Alert tone="ok" title="Redirect deleted">That path will now 404 unless something else handles it.</Alert>
      )}

      <form className="mb-3 flex flex-wrap items-end gap-x-2 gap-y-2 border-b border-line pb-3" action="/admin/redirects">
        <div className="min-w-0">
          <label htmlFor="q" className="mb-0.5 block text-[11px] font-semibold text-faint">Search</label>
          <Input id="q" name="q" defaultValue={params.q} placeholder="Either path…" className="min-w-[210px] py-1.5 text-[13px]" />
        </div>
        <div>
          <label htmlFor="source" className="mb-0.5 block text-[11px] font-semibold text-faint">Source</label>
          <select
            id="source" name="source" defaultValue={params.source ?? ""}
            className="rounded border border-line-strong bg-white px-2.5 py-1.5 text-[13px]"
          >
            <option value="">Any</option>
            <option value="automatic">Written by the CMS</option>
            <option value="manual">Added by hand</option>
          </select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {filtered && <ButtonLink href="/admin/redirects" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={<IconArrows />} title={filtered ? "No redirects match those filters" : "No redirects yet"}>
          {filtered
            ? "Try a different term, or clear the filters."
            : "One will appear here the first time a slug changes."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-white">
          <table className="w-full min-w-[820px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line-strong text-[10.5px] font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">From</th>
                <th scope="col" className="px-3 py-1.5">To</th>
                <th scope="col" className="px-3 py-1.5">Type</th>
                <th scope="col" className="px-3 py-1.5">Followed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-b-0 align-top">
                  <td className="px-3 py-2">
                    <Link href={`/admin/redirects/${r.id}`} className="block hover:underline">
                      <span className="font-mono text-[13px] text-ink">{r.from_path}</span>
                    </Link>
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      {r.created_automatically && <Badge tone="open">From a slug change</Badge>}
                      {!r.is_active && <Badge tone="closed">Off</Badge>}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-[13px] text-muted">{r.to_path}</td>
                  <td className="px-3 py-2 font-mono text-[12.5px] text-muted">{r.status_code}</td>
                  <td className="px-3 py-2 text-muted">
                    {r.hit_count}
                    {r.last_hit_at && (
                      <span className="block text-[12px] text-faint">
                        {new Date(r.last_hit_at).toLocaleDateString("en-GB")}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/redirects" params={{ q: params.q, source: params.source }} />
    </>
  );
}
