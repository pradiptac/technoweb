import Link from "next/link";
import { BulkBar, RowTick, TickAll } from "@/components/admin/row-selection";
import { bulkPagesAction } from "./actions";
import { PageHeader, FilterBar } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select, Alert } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { IconBook } from "@/components/icons";
import { getPages, type PageQueryParams, type PagesIndex } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { PublishStatus } from "@/types/api";
import type { ReactNode } from "react";
import { requireScreen } from "@/lib/admin-screen";
import { getCurrentStaff } from "@/lib/admin-auth";
import { NewHomepageButton } from "./homepage-button";
import { AiDraftButton } from "./ai-draft-button";
import { screenFor } from "../settings/settings-copy";

/**
 * Where the AI SEO assistant is switched on — the screen that draws the `seo`
 * group, opened on its tab at the switch. The AI page builder rides on that
 * assistant's switch, key and daily cap, so its refusals all point there.
 */
const SEO_SETTINGS = screenFor("seo");
const AI_SETTINGS_HREF = SEO_SETTINGS ? `${SEO_SETTINGS.path}?tab=seo#setting__seo_ai_enabled` : null;

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
      <label htmlFor={htmlFor} className="mb-0.5 block text-11 font-semibold text-faint">{label}</label>
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
  await requireScreen();
  const params = await searchParams;
  // The SEO settings are `role:admin`: anybody else following the link would
  // meet that screen's 404, so only an administrator is offered it.
  const isAdmin = (await getCurrentStaff())?.roles.some((r) => r.slug === "admin") ?? false;

  const queryParams: PageQueryParams = {
    status: params.status as PublishStatus | undefined,
    q: params.q,
    page: Number(params.page) || 1,
      per_page: Number(params.per_page) || undefined,
  };

  let result: PagesIndex | null = null;
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
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <AiDraftButton availability={result.meta.ai_draft ?? null} settingsHref={isAdmin ? AI_SETTINGS_HREF : null} />
          <NewHomepageButton />
          <ButtonLink href="/admin/pages/new" size="sm">New page</ButtonLink>
        </div>
      </PageHeader>

      {params.deleted && <Alert tone="ok" title="Page deleted">That URL now returns 404.</Alert>}

      <FilterBar action="/admin/pages">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Title or slug…" className="min-w-[200px] py-1.5 text-13" />
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
        <>
          <BulkBar scope="pages" ids={pages.map((p) => p.id)} noun={{ one: "page", many: "pages" }} action={bulkPagesAction} />
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[620px] text-left text-13">
            <thead>
              <tr className="border-b border-line-strong text-10-5 font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="w-8 px-3 py-1.5"><TickAll scope="pages" ids={pages.map((p) => p.id)} noun="page" /></th>
                <th scope="col" className="px-3 py-1.5">Page</th>
                <th scope="col" className="px-3 py-1.5">Status</th>
                <th scope="col" className="px-3 py-1.5">URL</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-b-0 align-top">
                  <td data-label="Select" className="px-3 py-2"><RowTick scope="pages" id={p.id} label={p.title} /></td>
                  <td data-label="Page" className="px-3 py-2">
                    <Link href={`/admin/pages/${p.id}`} className="block hover:underline">
                      <p className="text-13-5 font-medium text-ink">{p.title}</p>
                    </Link>
                  </td>
                  <td data-label="Status" className="px-3 py-2"><Badge tone={statusTone[p.status]}>{p.status_label}</Badge></td>
                  <td data-label="URL" className="px-3 py-2">
                    {p.status === "published" ? (
                      <Link href={`/${p.slug}`} className="font-mono text-12-5 text-brand-ink hover:underline">
                        /{p.slug}
                      </Link>
                    ) : (
                      <span className="font-mono text-12-5 text-muted">/{p.slug}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      <Pagination meta={result.meta} basePath="/admin/pages" params={{ status: params.status, q: params.q, per_page: params.per_page }} />
    </>
  );
}
