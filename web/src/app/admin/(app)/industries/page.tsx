import Link from "next/link";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Alert } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { iconMap, IconBuilding, type IconName } from "@/components/icons";
import { getIndustryList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminIndustry, Paginated } from "@/types/api";

export const metadata = buildMetadata({ title: "Industries", path: "/admin/industries", seo: noIndex });

function RowIcon({ name }: { name: string | null | undefined }) {
  const Icon = name && name in iconMap ? iconMap[name as IconName] : IconBuilding;
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded border border-brand-200 bg-brand-50 text-brand-600 [&_svg]:size-[15px]">
      <Icon />
    </span>
  );
}

type SearchParams = { q?: string; page?: string; deleted?: string };

export default async function AdminIndustriesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  let result: Paginated<AdminIndustry> | null = null;
  try {
    result = await getIndustryList({ q: params.q, page: Number(params.page) || 1 });
  } catch {
    return (
      <ErrorState title="We could not load the industries">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const industries = result.data;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="admin-title">Industries</h1>
        <div className="ml-auto"><ButtonLink href="/admin/industries/new" size="sm">New industry</ButtonLink></div>
      </div>

      {params.deleted && <Alert tone="ok" title="Industry deleted">Any case studies in it kept their content but lost the sector.</Alert>}

      {/* No status filter: industries have no draft state. */}
      <form className="mb-3 flex flex-wrap items-end gap-x-2 gap-y-2 border-b border-line pb-3" action="/admin/industries">
        <div className="min-w-0">
          <label htmlFor="q" className="mb-0.5 block text-[11px] font-semibold text-faint">Search</label>
          <Input id="q" name="q" defaultValue={params.q} placeholder="Name or summary…" className="min-w-[220px] py-1.5 text-[13px]" />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {params.q && <ButtonLink href="/admin/industries" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </form>

      {industries.length === 0 ? (
        <EmptyState icon={<IconBuilding />} title={params.q ? "No industries match that search" : "No industries yet"}>
          {params.q
            ? "Try a different term, or clear the search."
            : "Sectors the site speaks to. Case studies and solutions both reference them."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-white">
          <table className="w-full min-w-[680px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line-strong text-[10.5px] font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Industry</th>
                <th scope="col" className="px-3 py-1.5">Case studies</th>
                <th scope="col" className="px-3 py-1.5">Order</th>
              </tr>
            </thead>
            <tbody>
              {industries.map((i) => (
                <tr key={i.id} className="border-b border-line last:border-b-0 align-top">
                  <td className="px-3 py-2">
                    <div className="flex items-start gap-2.5">
                      <RowIcon name={i.icon} />
                      <div className="min-w-0">
                        <Link href={`/admin/industries/${i.id}`} className="block hover:underline">
                          <p className="max-w-[42ch] text-[13.5px] font-medium text-ink">{i.name}</p>
                        </Link>
                        <p className="mt-0.5 font-mono text-[12px] text-muted">/industries/{i.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted">{i.case_study_count ?? 0}</td>
                  <td className="px-3 py-2 font-mono text-[12.5px] text-muted">{i.sort_order ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/industries" params={{ q: params.q }} />
    </>
  );
}
