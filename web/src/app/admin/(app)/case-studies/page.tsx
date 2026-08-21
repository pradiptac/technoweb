import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select, Alert } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { IconBuilding } from "@/components/icons";
import { getCaseStudies, getIndustries, type CaseStudyQueryParams } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminCaseStudy, AdminIndustry, Paginated, PublishStatus } from "@/types/api";
import type { ReactNode } from "react";

export const metadata = buildMetadata({ title: "Case studies", path: "/admin/case-studies", seo: noIndex });

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

type SearchParams = { status?: string; industry_id?: string; q?: string; page?: string; deleted?: string };

export default async function AdminCaseStudiesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const queryParams: CaseStudyQueryParams = {
    status: params.status as PublishStatus | undefined,
    industry_id: params.industry_id ? Number(params.industry_id) : undefined,
    q: params.q,
    page: Number(params.page) || 1,
  };

  let result: Paginated<AdminCaseStudy> | null = null;
  let industries: AdminIndustry[] = [];
  try {
    [result, industries] = await Promise.all([getCaseStudies(queryParams), getIndustries()]);
  } catch {
    return (
      <ErrorState title="We could not load the case studies">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const studies = result.data;
  const hasFilters = Boolean(params.status || params.industry_id || params.q);
  const paginationParams: Record<string, string | undefined> = {
    status: params.status, industry_id: params.industry_id, q: params.q,
  };

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h2 className="display-3">Case studies</h2>
        <div className="ml-auto">
          <ButtonLink href="/admin/case-studies/new" size="sm">New case study</ButtonLink>
        </div>
      </div>

      {params.deleted && <Alert tone="ok" title="Case study deleted">It is no longer on the site.</Alert>}

      <form className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-line-strong bg-white p-4" action="/admin/case-studies">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Title, client or summary…" className="min-w-[220px]" />
        </FilterField>
        <FilterField label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">All</option>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Industry" htmlFor="industry_id">
          <Select id="industry_id" name="industry_id" defaultValue={params.industry_id ?? ""}>
            <option value="">All</option>
            {industries.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </Select>
        </FilterField>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {hasFilters && <ButtonLink href="/admin/case-studies" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </form>

      {studies.length === 0 ? (
        <EmptyState
          icon={<IconBuilding />}
          title={hasFilters ? "No case studies match those filters" : "No case studies yet"}
          action={hasFilters ? undefined : <ButtonLink href="/admin/case-studies/new" size="sm">Write the first one</ButtonLink>}
        >
          {hasFilters
            ? "Try a different combination, or clear the filters."
            : "A case study is the most persuasive page on the site — real numbers from real work."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-white">
          <table className="w-full min-w-[800px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-line-strong text-[12px] font-semibold uppercase tracking-[.04em] text-muted">
                <th scope="col" className="px-4 py-3">Case study</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Industry</th>
                <th scope="col" className="px-4 py-3">Results</th>
              </tr>
            </thead>
            <tbody>
              {studies.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-b-0 align-top">
                  <td className="px-4 py-3.5">
                    <Link href={`/admin/case-studies/${c.id}`} className="block hover:underline">
                      <p className="max-w-[44ch] text-[14px] text-ink">{c.title}</p>
                    </Link>
                    <p className="mt-0.5 font-mono text-[12px] text-muted">/case-studies/{c.slug}</p>
                    {c.client_name && <p className="mt-1 text-[12.5px] text-muted">{c.client_name}</p>}
                  </td>
                  <td className="px-4 py-3.5"><Badge tone={statusTone[c.status]}>{c.status_label}</Badge></td>
                  <td className="px-4 py-3.5 text-muted">{c.industry?.name ?? "—"}</td>
                  <td className="px-4 py-3.5 text-muted">
                    {c.results.length
                      ? <span className="font-mono text-[12.5px]">{c.results.map((r) => r.value).join(" · ")}</span>
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/case-studies" params={paginationParams} />
    </>
  );
}
