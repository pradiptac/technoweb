import Link from "next/link";
import { PageHeader, FilterBar } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select, Alert } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { IconBook } from "@/components/icons";
import { getKnowledgeArticles, getKnowledgeCategories, type KnowledgeQueryParams } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminKnowledgeArticle, KnowledgeCategory, Paginated, PublishStatus } from "@/types/api";
import type { ReactNode } from "react";

export const metadata = buildMetadata({ title: "Knowledge base", path: "/admin/knowledge-base", seo: noIndex });

const STATUS_OPTIONS: { value: PublishStatus; label: string }[] = [
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
];

const statusTone = { published: "resolved", draft: "progress", archived: "closed" } as const;

function formatDate(iso: string) {
  // No year: in a table it is nearly always the current one, and the
  // extra four characters wrap the column onto a second line. The full
  // date stays available in the cell's title attribute.
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(d);
}

function FilterField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="mb-0.5 block text-[11px] font-semibold text-faint">{label}</label>
      {children}
    </div>
  );
}

type SearchParams = {
  status?: string; knowledge_category_id?: string; q?: string; page?: string; deleted?: string;
  per_page?: string;
};

export default async function AdminKnowledgeBasePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const queryParams: KnowledgeQueryParams = {
    status: params.status as PublishStatus | undefined,
    knowledge_category_id: params.knowledge_category_id ? Number(params.knowledge_category_id) : undefined,
    q: params.q,
    page: Number(params.page) || 1,
      per_page: Number(params.per_page) || undefined,
  };

  let result: Paginated<AdminKnowledgeArticle> | null = null;
  let categories: KnowledgeCategory[] = [];
  try {
    [result, categories] = await Promise.all([getKnowledgeArticles(queryParams), getKnowledgeCategories()]);
  } catch {
    return (
      <ErrorState title="We could not load the articles">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const articles = result.data;
  const hasFilters = Boolean(params.status || params.knowledge_category_id || params.q);
  const paginationParams: Record<string, string | undefined> = {
    status: params.status, knowledge_category_id: params.knowledge_category_id, q: params.q,
    per_page: params.per_page,
  };

  return (
    <>
      <PageHeader title="Knowledge base">
        <div className="ml-auto">
          <ButtonLink href="/admin/knowledge-base/new" size="sm">New article</ButtonLink>
        </div>
      </PageHeader>

      {params.deleted && <Alert tone="ok" title="Article deleted">It is no longer in the knowledge base.</Alert>}

      <FilterBar action="/admin/knowledge-base">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Title, body or tag…" className="min-w-[200px] py-1.5 text-[13px]" />
        </FilterField>
        <FilterField label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">All</option>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Category" htmlFor="knowledge_category_id">
          <Select id="knowledge_category_id" name="knowledge_category_id" defaultValue={params.knowledge_category_id ?? ""}>
            <option value="">All</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </FilterField>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {hasFilters && <ButtonLink href="/admin/knowledge-base" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </FilterBar>

      {articles.length === 0 ? (
        <EmptyState
          icon={<IconBook />}
          title={hasFilters ? "No articles match those filters" : "No articles yet"}
          action={hasFilters ? undefined : <ButtonLink href="/admin/knowledge-base/new" size="sm">Write the first one</ButtonLink>}
        >
          {hasFilters
            ? "Try a different combination, or clear the filters."
            : "A good knowledge base deflects tickets — every article here is one someone does not have to raise."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[800px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line-strong text-[10.5px] font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Article</th>
                <th scope="col" className="px-3 py-1.5">Status</th>
                <th scope="col" className="px-3 py-1.5">Category</th>
                <th scope="col" className="px-3 py-1.5">Published</th>
                <th scope="col" className="px-3 py-1.5">Views</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((a) => (
                <tr key={a.id} className="border-b border-line last:border-b-0 align-top">
                  <td data-label="Article" className="px-3 py-2">
                    <Link href={`/admin/knowledge-base/${a.id}`} className="block hover:underline">
                      <p className="max-w-[44ch] text-[13.5px] font-medium text-ink">{a.title}</p>
                    </Link>
                    <p className="mt-0.5 font-mono text-[12px] text-muted">/knowledge-base/{a.slug}</p>
                    {a.tags.length > 0 && (
                      <p className="mt-1 text-[12px] text-faint">{a.tags.join(" · ")}</p>
                    )}
                  </td>
                  <td data-label="Status" className="px-3 py-2"><Badge tone={statusTone[a.status]}>{a.status_label}</Badge></td>
                  <td data-label="Category" className="px-3 py-2 text-muted">{a.category?.name ?? "—"}</td>
                  <td data-label="Published" className="px-3 py-2 text-muted">{a.published_at ? formatDate(a.published_at) : "—"}</td>
                  <td data-label="Views" className="px-3 py-2 text-muted">{a.view_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/knowledge-base" params={paginationParams} />
    </>
  );
}
