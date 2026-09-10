import Link from "next/link";

import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { IconImage } from "@/components/icons";
import { getPopupList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";

export const metadata = buildMetadata({ title: "Popups", path: "/admin/popups", seo: noIndex });

/** The window, said in words, because two ISO strings in a cell are not read. */
function windowOf(starts: string | null, ends: string | null): string {
  const on = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  if (starts && ends) return `${on(starts)} – ${on(ends)}`;
  if (starts) return `From ${on(starts)}`;
  if (ends) return `Until ${on(ends)}`;

  return "Always";
}

export default async function AdminPopupsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string; per_page?: string }>;
}) {
  const params = await searchParams;

  let result;
  try {
    result = await getPopupList({
      q: params.q,
      status: params.status,
      page: Number(params.page) || 1,
      per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return (
      <ErrorState title="We could not load the popups">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        title="Popups"
        lede={<>
          A picture shown over a page, with a link on it. Each one says which sections of the
          site it appears on, how often a visitor sees it, and — if you want — the dates
          between which it runs. Only one is ever shown on a page: when two target the same
          one, the lower order wins.
        </>}
      >
        <div className="ml-auto"><ButtonLink href="/admin/popups/new" size="sm">New popup</ButtonLink></div>
      </PageHeader>

      <FilterBar action="/admin/popups">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Name…" />
        </FilterField>
        <FilterField label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">Any</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </Select>
        </FilterField>
        <ButtonLink href="/admin/popups" variant="ghost" size="sm">Clear</ButtonLink>
      </FilterBar>

      {result.data.length === 0 ? (
        <EmptyState icon={<IconImage />} title="No popups yet">
          Upload a picture, tick the sections it belongs on, and publish it.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[720px] text-[13.5px]">
            <thead>
              <tr className="border-b border-line-strong text-left text-[11.5px] uppercase tracking-[.06em] text-faint">
                <th className="py-2.5 font-semibold">Name</th>
                <th className="py-2.5 font-semibold">Where</th>
                <th className="py-2.5 font-semibold">When</th>
                <th className="py-2.5 font-semibold">How often</th>
                <th className="py-2.5 font-semibold">Order</th>
                <th className="py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((popup) => (
                <tr key={popup.id} className="border-b border-line last:border-b-0">
                  <td data-label="Name" className="py-2.5">
                    <Link href={`/admin/popups/${popup.id}`} className="font-semibold text-brand-ink hover:underline">
                      {popup.name}
                    </Link>
                  </td>
                  {/*
                    The resolved patterns, not the keys somebody ticked. A row
                    reading "home, store" and a row reading "/" and "/store/*"
                    are the same fact, and only the second one can be checked
                    against the address bar.
                  */}
                  <td data-label="Where" className="max-w-[34ch] truncate py-2.5 font-mono text-[12.5px] text-muted">
                    {popup.match_paths.length > 0 ? popup.match_paths.join("  ") : "Nowhere"}
                  </td>
                  <td data-label="When" className="py-2.5 text-muted">
                    {windowOf(popup.starts_at, popup.ends_at)}
                  </td>
                  <td data-label="How often" className="py-2.5 text-muted">{popup.frequency ?? "session"}</td>
                  <td data-label="Order" className="py-2.5">{popup.sort_order}</td>
                  <td data-label="Status" className="py-2.5">
                    <Badge tone={popup.status === "published" ? "resolved" : "progress"}>
                      {popup.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        meta={result.meta}
        basePath="/admin/popups"
        params={{ q: params.q, status: params.status, per_page: params.per_page }}
      />
    </>
  );
}
