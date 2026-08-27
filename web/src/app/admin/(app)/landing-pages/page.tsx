import Link from "next/link";
import { PageHeader, FilterBar } from "@/components/admin/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Alert, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { getLandingPages } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminLandingPage } from "@/types/api";

export const metadata = buildMetadata({ title: "Landing pages", path: "/admin/landing-pages", seo: noIndex });

/*
 * Publish status, not ticket status — `statusTone` in badge.tsx maps the ticket
 * lifecycle and has no key for "draft". The CMS list screens each carry this
 * same three-line map; matching it keeps a draft the same amber here as it is
 * on /admin/blog.
 */
const statusTone = {
  published: "resolved",
  draft: "progress",
  archived: "closed",
} as const;

type SearchParams = { status?: string; kind?: string; q?: string; page?: string; per_page?: string; deleted?: string };

export default async function LandingPagesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  let result: Awaited<ReturnType<typeof getLandingPages>>;
  try {
    result = await getLandingPages({
      status: params.status, kind: params.kind, q: params.q,
      page: Number(params.page) || 1, per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return <ErrorState title="We could not load the landing pages">The admin API is not responding. Try again shortly.</ErrorState>;
  }

  const rows = result.data;
  const meta = result.meta;
  const atCap = meta.published >= meta.cap;

  return (
    <>
      <PageHeader
        title="Landing pages"
        lede={<>
          Pages built from combinations the catalogue already supports — a brand
          in a category, a service in a place we work. Each one has to earn its
          way onto the site: the reasons a page cannot go live yet are listed
          against it below.
        </>}
      >
        <div className="ml-auto flex gap-2">
          <ButtonLink href="/admin/landing-pages/opportunities" variant="secondary" size="sm">
            Find opportunities
          </ButtonLink>
        </div>
      </PageHeader>

      {params.deleted && <Alert tone="ok" title="Page deleted">Its URL will 404 unless a redirect handles it.</Alert>}

      {atCap && (
        <Alert tone="warn" title={`${meta.published} of ${meta.cap} published — that is the limit`}>
          Nothing more can go live until one is unpublished or the limit is raised
          in Settings. Volume is the part of this that carries risk, which is why
          the number is a deliberate decision rather than a default.
        </Alert>
      )}

      <FilterBar action="/admin/landing-pages">
        <div className="min-w-0">
          <label htmlFor="q" className="mb-0.5 block text-[11px] font-semibold text-faint">Search</label>
          <Input id="q" name="q" defaultValue={params.q} placeholder="Title or path" />
        </div>
        <div>
          <label htmlFor="status" className="mb-0.5 block text-[11px] font-semibold text-faint">Status</label>
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">Any status</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </Select>
        </div>
        <div>
          <label htmlFor="kind" className="mb-0.5 block text-[11px] font-semibold text-faint">Kind</label>
          <Select id="kind" name="kind" defaultValue={params.kind ?? ""}>
            <option value="">Any kind</option>
            {meta.kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </Select>
        </div>
        <Button type="submit" size="sm">Filter</Button>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState title="No landing pages yet">
          Nothing has been created. “Find opportunities” lists the combinations
          the catalogue actually supports — which is a much shorter list than
          every combination it could produce, and deliberately so.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[820px] border-collapse text-[13.5px]">
            <thead>
              <tr className="border-b border-line-strong text-left text-[11.5px] uppercase tracking-wide text-faint">
                <th className="py-2.5 pr-3 font-semibold">Page</th>
                <th className="py-2.5 pr-3 font-semibold">Kind</th>
                <th className="py-2.5 pr-3 font-semibold">Status</th>
                <th className="py-2.5 pr-3 font-semibold">Can it go live?</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row: AdminLandingPage) => (
                <tr key={row.id} className="border-b border-line align-top">
                  <td className="py-3 pr-3" data-label="Page">
                    <Link href={`/admin/landing-pages/${row.id}`} className="font-medium text-ink hover:text-brand-ink hover:underline">
                      {row.title}
                    </Link>
                    <p className="mt-0.5 font-mono text-[12px] text-muted">{row.path}</p>
                  </td>
                  <td className="py-3 pr-3 text-muted" data-label="Kind">{row.kind_label}</td>
                  <td className="py-3 pr-3" data-label="Status">
                    <Badge tone={statusTone[row.status]}>{row.status}</Badge>
                    {row.auto_generated && (
                      <span className="mt-1 block text-[11.5px] text-faint">Proposed automatically</span>
                    )}
                  </td>
                  {/*
                    The column this screen exists for. A list of drafts that says
                    only "draft" answers nothing; what an editor needs to know is
                    which one is three sentences from being finished and which is
                    a duplicate that should be deleted.
                  */}
                  <td className="py-3 pr-3" data-label="Can it go live?">
                    {row.publishable ? (
                      <span className="text-[13px] font-semibold text-ok">Ready</span>
                    ) : (
                      <ul className="grid gap-1">
                        {row.failures.map((f) => (
                          <li key={f.key} className="measure text-[12.5px] text-muted">
                            <span className="font-semibold text-ink">{f.label}:</span> {f.detail}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/landing-pages" params={{ q: params.q, status: params.status, kind: params.kind }} />
    </>
  );
}
