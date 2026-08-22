import Link from "next/link";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { IconSearchChart } from "@/components/icons";
import { getSeoOverview } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { SitemapToggle } from "./sitemap-toggle";
import type { SeoMeta, SeoRow } from "@/types/api";

export const metadata = buildMetadata({ title: "SEO", path: "/admin/seo", seo: noIndex });

type SearchParams = { type?: string; q?: string; issues?: string };

export default async function AdminSeoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  let rows: SeoRow[];
  let meta: SeoMeta;
  try {
    const res = await getSeoOverview({ type: params.type, q: params.q });
    rows = res.data;
    meta = res.meta;
  } catch {
    return (
      <ErrorState title="We could not load the SEO overview">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  // Filtered here rather than in the API: the row already carries its issues,
  // and a second query parameter for something this cheap is not worth it.
  const onlyIssues = params.issues === "1";
  const visible = onlyIssues ? rows.filter((r) => r.issues.length > 0) : rows;
  const filtered = Boolean(params.type || params.q || onlyIssues);

  return (
    <>
      <h1 className="admin-title mb-1.5">SEO</h1>
      <p className="mb-6 max-w-[70ch] text-[14px] text-muted">
        Every indexable record and the metadata it will actually publish.
        Anything not overridden is derived from the content, which is usually
        right — this is where you find the places it is not. Editing happens on
        the record itself; the sitemap toggle is here because it is a decision
        you make while looking at the whole list.
      </p>

      <div className="mb-6 flex flex-wrap gap-3">
        <div className="rounded-lg border border-line-strong bg-white px-4 py-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-[.06em] text-faint">Records</p>
          <p className="font-display text-2xl font-semibold">{meta.total}</p>
        </div>
        <div className="rounded-lg border border-line-strong bg-white px-4 py-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-[.06em] text-faint">With issues</p>
          <p className="font-display text-2xl font-semibold">{meta.with_issues}</p>
        </div>
      </div>

      <form className="mb-3 flex flex-wrap items-end gap-x-2 gap-y-2 border-b border-line pb-3" action="/admin/seo">
        <div className="min-w-0">
          <label htmlFor="q" className="mb-0.5 block text-[11px] font-semibold text-faint">Search</label>
          <Input id="q" name="q" defaultValue={params.q} placeholder="Record name…" className="min-w-[200px] py-1.5 text-[13px]" />
        </div>
        <div>
          <label htmlFor="type" className="mb-0.5 block text-[11px] font-semibold text-faint">Type</label>
          <select
            id="type" name="type" defaultValue={params.type ?? ""}
            className="rounded border border-line-strong bg-white px-2.5 py-1.5 text-[13px]"
          >
            <option value="">All types</option>
            {meta.types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="issues" className="mb-0.5 block text-[11px] font-semibold text-faint">Show</label>
          <select
            id="issues" name="issues" defaultValue={onlyIssues ? "1" : ""}
            className="rounded border border-line-strong bg-white px-2.5 py-1.5 text-[13px]"
          >
            <option value="">Everything</option>
            <option value="1">Only records with issues</option>
          </select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {filtered && <ButtonLink href="/admin/seo" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </form>

      {visible.length === 0 ? (
        <EmptyState icon={<IconSearchChart />} title={onlyIssues ? "Nothing needs attention" : "No records match"}>
          {onlyIssues
            ? "Every title and description is within the lengths search engines show."
            : "Try a different term, or clear the filters."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-white">
          <table className="admin-table w-full min-w-[900px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line-strong text-[10.5px] font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Record</th>
                <th scope="col" className="px-3 py-1.5">Title &amp; description</th>
                <th scope="col" className="px-3 py-1.5">Source</th>
                <th scope="col" className="px-3 py-1.5">Sitemap</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={`${r.type}-${r.id}`} className="border-b border-line last:border-b-0 align-top">
                  <td data-label="Record" className="px-3 py-2">
                    <Link href={r.admin_path} className="block hover:underline">
                      <span className="text-[13.5px] font-medium text-ink">{r.name}</span>
                    </Link>
                    <p className="mt-0.5 text-[12px] text-faint">{r.type_label}</p>
                  </td>
                  <td data-label="Title &amp; description" className="px-3 py-2">
                    <p className="max-w-[46ch] text-ink">{r.title ?? <em className="text-err">No title</em>}</p>
                    <p className="mt-0.5 max-w-[60ch] text-[12.5px] text-muted">
                      {r.description ?? <em className="text-err">No description</em>}
                    </p>
                    {r.issues.length > 0 && (
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        {r.issues.map((i) => <Badge key={i} tone="urgent">{i}</Badge>)}
                      </span>
                    )}
                  </td>
                  <td data-label="Source" className="px-3 py-2">
                    {r.has_override
                      ? (
                        <>
                          <Badge tone="resolved">Overridden</Badge>
                          <p className="mt-1 text-[12px] text-faint">{r.overridden.join(", ")}</p>
                        </>
                      )
                      : <Badge tone="closed">Derived</Badge>}
                  </td>
                  <td data-label="Sitemap" className="px-3 py-2">
                    <SitemapToggle type={r.type} id={r.id} included={r.sitemap_include} name={r.name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
