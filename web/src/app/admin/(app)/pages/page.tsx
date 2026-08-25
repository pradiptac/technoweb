import Link from "next/link";
import { PageHeader, FilterBar } from "@/components/admin/page-header";
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
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="mb-0.5 block text-[11px] font-semibold text-faint">{label}</label>
      {children}
    </div>
  );
}

type SearchParams = { status?: string; q?: string; page?: string; deleted?: string; per_page?: string;
};

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
      per_page: Number(params.per_page) || undefined,
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
      <PageHeader title="Pages">
        <div className="ml-auto">
          <ButtonLink href="/admin/pages/new" size="sm">New page</ButtonLink>
        </div>
      </PageHeader>

      {params.deleted && <Alert tone="ok" title="Page deleted">That URL now returns 404.</Alert>}

      <FilterBar action="/admin/pages">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Title or slug…" className="min-w-[200px] py-1.5 text-[13px]" />
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
      </FilterBar>

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
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[620px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line-strong text-[10.5px] font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Page</th>
                <th scope="col" className="px-3 py-1.5">Status</th>
                <th scope="col" className="px-3 py-1.5">URL</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-b-0 align-top">
                  <td data-label="Page" className="px-3 py-2">
                    <Link href={`/admin/pages/${p.id}`} className="block hover:underline">
                      <p className="text-[13.5px] font-medium text-ink">{p.title}</p>
                    </Link>
                  </td>
                  <td data-label="Status" className="px-3 py-2"><Badge tone={statusTone[p.status]}>{p.status_label}</Badge></td>
                  <td data-label="URL" className="px-3 py-2">
                    {p.status === "published" ? (
                      <Link href={`/${p.slug}`} className="font-mono text-[12.5px] text-brand-ink hover:underline">
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

      <Pagination meta={result.meta} basePath="/admin/pages" params={{ status: params.status, q: params.q, per_page: params.per_page }} />
    </>
  );
}
