import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select, Alert } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { IconBook } from "@/components/icons";
import { getPages, type PageQueryParams } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminPage, Paginated, PublishStatus } from "@/types/api";
import type { ReactNode } from "react";

export const metadata = buildMetadata({ title: "Pages", path: "/admin/pages", seo: noIndex });

const STATUS_OPTIONS: { value: PublishStatus; label: string }[] = [
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
];

const statusTone = { published: "resolved", draft: "progress", archived: "closed" } as const;

function FilterField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="min-w-[150px]">
      <label htmlFor={htmlFor} className="mb-1.5 block text-[12px] font-semibold text-muted">{label}</label>
      {children}
    </div>
  );
}

type SearchParams = { status?: string; q?: string; page?: string; deleted?: string };

export default async function AdminPagesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const queryParams: PageQueryParams = {
    status: params.status as PublishStatus | undefined,
    q: params.q,
    page: Number(params.page) || 1,
  };

  let result: Paginated<AdminPage> | null = null;
  try {
    result = await getPages(queryParams);
  } catch {
    return (
      <ErrorState title="We could not load the pages">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const pages = result.data;
  const hasFilters = Boolean(params.status || params.q);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h2 className="display-3">Pages</h2>
        <div className="ml-auto">
          <ButtonLink href="/admin/pages/new" size="sm">New page</ButtonLink>
        </div>
      </div>

      {params.deleted && <Alert tone="ok" title="Page deleted">That URL now returns 404.</Alert>}

      <form className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-line-strong bg-white p-4" action="/admin/pages">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Title or slug…" className="min-w-[220px]" />
        </FilterField>
        <FilterField label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">All</option>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </FilterField>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {hasFilters && <ButtonLink href="/admin/pages" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </form>

      {pages.length === 0 ? (
        <EmptyState
          icon={<IconBook />}
          title={hasFilters ? "No pages match those filters" : "No pages yet"}
          action={hasFilters ? undefined : <ButtonLink href="/admin/pages/new" size="sm">Create one</ButtonLink>}
        >
          {hasFilters
            ? "Try a different combination, or clear the filters."
            : "Standalone pages like privacy, terms and downloads live here. Each one is served at /its-slug."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-white">
          <table className="w-full min-w-[620px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-line-strong text-[12px] font-semibold uppercase tracking-[.04em] text-muted">
                <th scope="col" className="px-4 py-3">Page</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">URL</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-b-0 align-top">
                  <td className="px-4 py-3.5">
                    <Link href={`/admin/pages/${p.id}`} className="block hover:underline">
                      <p className="text-[14px] text-ink">{p.title}</p>
                    </Link>
                  </td>
                  <td className="px-4 py-3.5"><Badge tone={statusTone[p.status]}>{p.status_label}</Badge></td>
                  <td className="px-4 py-3.5">
                    {p.status === "published" ? (
                      <Link href={`/${p.slug}`} className="font-mono text-[12.5px] text-brand-600 hover:underline">
                        /{p.slug}
                      </Link>
                    ) : (
                      <span className="font-mono text-[12.5px] text-muted">/{p.slug}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/pages" params={{ status: params.status, q: params.q }} />
    </>
  );
}
